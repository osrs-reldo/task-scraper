import { DBRow, ParamID, Struct } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { DBRowService } from '../../../core/services/dbrow/dbrow.service';
import { EnumService } from '../../../core/services/enum/enum.service';
import { StructService } from '../../../core/services/struct/struct.service';
import { ScriptAnalysisService } from '../../../core/services/script/script-analysis.service';
import { WikiService } from '../../../core/services/wiki/wiki.service';
import { IColumnDefinitions } from '../../../core/services/wiki/column-definitions.interface';
import { ITask, ITaskSkill } from '../../../core/types/task-mockup.interface';
import { ITaskType } from '../../../core/types/task-type-mockup.interface';
import { IInteractiveTaskExtractResult } from './interactive-task-extract-result.interface';
import { InteractiveDbRowTaskService } from './interactive-dbrow-task.service';
import { InteractiveTaskService } from './interactive-task.service';
import { InteractivePrompt } from '../../interactive-prompt.util';
import { BossKcMapEntry, BossKcMapResult, BossKcVarpsCommand } from './subcommands/boss-kc-varps-command';
import { VarbitMapEntry, VarbitMappingCommand } from './subcommands/varbit-mapping-command';

@Injectable()
export class TasksCommand {
  constructor(
    private structService: StructService,
    private interactivetaskService: InteractiveTaskService,
    private interactiveDbRowTaskService: InteractiveDbRowTaskService,
    private scriptAnalysisService: ScriptAnalysisService,
    private wikiService: WikiService,
    private dbrowService: DBRowService,
    private enumService: EnumService,
    private bossKcVarpsCommand: BossKcVarpsCommand,
    private varbitMappingCommand: VarbitMappingCommand,
  ) {}

  public async handleMapLeagueVarbitProgress(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypeName: string = options.type ?? 'LEAGUE_6';
    const tasksPath = path.join(taskJsonStoreDir, 'tasks', `${taskTypeName}.min.json`);

    if (!existsSync(tasksPath)) {
      throw new Error(`Tasks file not found: ${tasksPath}`);
    }

    const tasks: any[] = JSON.parse(readFileSync(tasksPath, 'utf-8'));
    const mapEntries: VarbitMapEntry[] = await this.varbitMappingCommand.mapVarbits(tasks, taskTypeName, options.review);

    console.log(`\n✅ Mapped ${mapEntries.length} varbit→task entries`);
    mkdirSync('./out', { recursive: true });
    const outPath = `./out/${taskTypeName}-varbit-map.json`;
    writeFileSync(outPath, JSON.stringify(mapEntries, null, 2));
    console.log(`💾 Written to ${outPath}`);

    const mappedDataPath = path.join(taskJsonStoreDir, 'mapped-data', taskTypeName, 'varbit-map.json');
    mkdirSync(path.dirname(mappedDataPath), { recursive: true });
    writeFileSync(mappedDataPath, JSON.stringify(mapEntries, null, 2));
    console.log(`💾 Also written to ${mappedDataPath}`);
  }

  public async handleApplyLeagueVarbitProgress(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypeName: string = options.type ?? 'LEAGUE_6';
    const tasksPath = options.input
      ? path.resolve(process.cwd(), options.input)
      : path.join(taskJsonStoreDir, 'tasks', `${taskTypeName}.min.json`);
    const mapPath = options.map
      ? path.resolve(process.cwd(), options.map)
      : path.join(process.cwd(), 'out', `${taskTypeName}-varbit-map.json`);

    if (!existsSync(tasksPath)) throw new Error(`Tasks file not found: ${tasksPath}`);
    if (!existsSync(mapPath)) throw new Error(`Varbit map not found: ${mapPath} — run map-varbit-progress first or pass --map`);

    const tasks: any[] = JSON.parse(readFileSync(tasksPath, 'utf-8'));
    type VarbitMapEntry = { varbitName: string; varbitId: number; target: number; dbRowId: number };
    const varbitMap: VarbitMapEntry[] = JSON.parse(readFileSync(mapPath, 'utf-8'));

    const mapByDbRowId = new Map<number, VarbitMapEntry[]>();
    for (const e of varbitMap) {
      const arr = mapByDbRowId.get(e.dbRowId) ?? [];
      arr.push(e);
      mapByDbRowId.set(e.dbRowId, arr);
    }
    const updated = tasks.map(task => {
      const entries = mapByDbRowId.get(task.dbRowId);
      if (!entries) return task;
      return { ...task, progress: entries.map(e => ({ type: 'VARBIT', id: e.varbitId, target: e.target })) };
    });

    const patched = updated.filter((t, i) => t !== tasks[i]).length;
    console.log(`✅ Applied ${patched} varbit progress entries (${varbitMap.length} entries in map)`);

    if (options.json) {
      mkdirSync('./out', { recursive: true });
      const outPath = `./out/${taskTypeName}.min.json`;
      writeFileSync(outPath, JSON.stringify(updated));
      console.log(`💾 Written to ${outPath}`);
    } else {
      console.log(JSON.stringify(updated, null, 2));
    }
  }

  public async handleTaskExtract(options: any): Promise<IInteractiveTaskExtractResult> {
    const results: IInteractiveTaskExtractResult = await this.interactivetaskService.promptTaskExtraction(options);
    if (options.json) {
      mkdirSync('./out', { recursive: true });
      writeFileSync(`./out/${results.taskType.taskJsonName}.json`, JSON.stringify(results.tasks, null, 2));
      writeFileSync(`./out/${results.taskType.taskJsonName}-tasktype.json`, JSON.stringify(results.taskType, null, 2));
    } else {
      console.log(results);
    }
    return results;
  }

  public async handleGenerate(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypesPath = path.join(taskJsonStoreDir, 'task-types.json');

    if (!existsSync(taskTypesPath)) {
      throw new Error(`task-types.json not found at ${taskTypesPath}. Run from task-scraper/ directory.`);
    }

    const taskTypes: ITaskType[] = JSON.parse(readFileSync(taskTypesPath, 'utf-8'));
    const taskTypeName: string = options.type;
    if (!taskTypeName) {
      console.log('Available task types:');
      taskTypes.forEach(tt => console.log(`  - ${tt.taskJsonName}`));
      throw new Error('Please specify a task type with --type');
    }
    const taskTypeDefinition = taskTypes.find(
      (tt) => tt.taskJsonName.toLowerCase() === taskTypeName.toLowerCase(),
    );
    if (!taskTypeDefinition) {
      throw new Error(`Task type "${taskTypeName}" not found in task-types.json`);
    }

    if (taskTypeDefinition.taskSourceType !== 'DBROW') {
      throw new Error(`tasks generate only supports DBROW task types (got: ${taskTypeDefinition.taskSourceType ?? 'unset'})`);
    }

    const enumId = taskTypeDefinition.dbRowEnumId;
    if (!enumId) {
      throw new Error(`No dbRowEnumId in task-type definition`);
    }

    console.log(`📦 Loading enum ${enumId} for task type "${taskTypeDefinition.taskJsonName}"...`);
    const sourceEnum = await this.enumService.getEnum(enumId);
    if (!sourceEnum?.map?.size) {
      throw new Error(`Enum ${enumId} not found or empty`);
    }

    const tasks: ITask[] = [];
    let sortId = 0;
    for (const value of sourceEnum.map.values()) {
      if (typeof value === 'number') {
        tasks.push({ dbRowId: value, sortId: sortId++ } as any);
      }
    }

    console.log(`✅ Generated ${tasks.length} tasks from enum ${enumId}`);
    mkdirSync('./out', { recursive: true });
    const outPath = `./out/${taskTypeDefinition.taskJsonName}.min.json`;
    writeFileSync(outPath, JSON.stringify(tasks));
    console.log(`💾 Written to ${outPath}`);
  }

  public async handleDbRowTaskExtract(options: any): Promise<IInteractiveTaskExtractResult> {
    const results: IInteractiveTaskExtractResult = await this.interactiveDbRowTaskService.promptTaskExtraction(options);
    if (options.json) {
      mkdirSync('./out', { recursive: true });
      writeFileSync(`./out/${results.taskType.taskJsonName}.json`, JSON.stringify(results.tasks, null, 2));
      writeFileSync(`./out/${results.taskType.taskJsonName}-tasktype.json`, JSON.stringify(results.taskType, null, 2));
    } else {
      console.log(results);
    }
    return results;
  }

  public async handleGenerateFrontendTasks(jsonFilename: string, nameParamId: ParamID, descriptionParamId: ParamID) {
    interface IFrontendTask {
      id: string;
      label: string;
      description: string;
      skillReqs: { skill: string; level: number }[];
      regions: string[];
      difficulty: null; // placeholders
      category: null; // placeholders
      subcategory: null; // placeholders
      prerequisite: null; // placeholders
    }

    const jsonResponse = await axios.get(
      `https://raw.githubusercontent.com/osrs-reldo/task-json-store/refs/heads/main/tasks/${jsonFilename}.min.json`,
    );
    const taskStructData: ITask[] = jsonResponse.data;

    const transformSkills = (taskSkills: ITaskSkill[]): { skill: string; level: number }[] =>
      taskSkills.map((taskSkill) => ({
        skill: taskSkill.skill.charAt(0).toUpperCase() + taskSkill.skill.slice(1).toLowerCase(),
        level: taskSkill.level,
      }));

    const frontendTasks: Record<string, IFrontendTask> = {};
    for (const taskData of taskStructData) {
      const struct: Struct = await this.structService.getStruct(taskData.structId);
      const name: string = struct.params.get(nameParamId).toString();
      const description: string = struct.params.get(descriptionParamId).toString();
      const frontendTask: IFrontendTask = {
        id: String(taskData.sortId),
        label: name,
        description: description,
        skillReqs: taskData.skills ? transformSkills(taskData.skills) : [],
        regions: [],
        difficulty: null,
        category: null,
        subcategory: null,
        prerequisite: null,
      };
      frontendTasks[frontendTask.id] = frontendTask;
    }

    console.log(JSON.stringify(frontendTasks, null, 2));
  }

  public async handleUpdateVarps(options: any): Promise<ITaskType> {
    console.log('🔧 Updating task varps...');
    
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypesPath = path.join(taskJsonStoreDir, 'task-types.json');

    if (!existsSync(taskTypesPath)) {
      throw new Error(`task-types.json not found at ${taskTypesPath}. Run from task-scraper/ directory.`);
    }

    console.log(`📄 Reading task-types from ${taskTypesPath}...`);
    const taskTypes: ITaskType[] = JSON.parse(readFileSync(taskTypesPath, 'utf-8'));
    
    let taskTypeDefinition: ITaskType | undefined;
    
    // If --type provided, find it. Otherwise, show interactive selection
    if (options.type) {
      taskTypeDefinition = taskTypes.find(tt => 
        tt.taskJsonName.toLowerCase() === options.type.toLowerCase() ||
        tt.name.toLowerCase() === options.type.toLowerCase()
      );
      
      if (!taskTypeDefinition) {
        console.error(`❌ Could not find task-type matching "${options.type}"`);
        console.log(`Available task types: ${taskTypes.map(tt => tt.taskJsonName).join(', ')}`);
        throw new Error(`Task type "${options.type}" not found`);
      }
    } else {
      // Interactive selection
      const choices = taskTypes
        .filter(tt => tt.taskCompletedScriptId) // Only show task types with a script ID
        .map(tt => ({
          name: `${tt.name} (${tt.taskJsonName}) - Script ${tt.taskCompletedScriptId}`,
          value: tt,
        }));
      
      if (choices.length === 0) {
        throw new Error('No task types with taskCompletedScriptId found');
      }
      
      taskTypeDefinition = await InteractivePrompt.select(
        'Select a task type to update:',
        choices
      );
    }
    
    console.log(`📄 Selected task-type: "${taskTypeDefinition.name}" (${taskTypeDefinition.taskJsonName})`);
    
    if (!taskTypeDefinition.taskCompletedScriptId) {
      throw new Error(`Task type "${taskTypeDefinition.name}" does not have a taskCompletedScriptId defined`);
    }
    
    const taskCompletedScriptId = taskTypeDefinition.taskCompletedScriptId;
    console.log(`📊 Analyzing script ${taskCompletedScriptId} to extract task varps...`);
    
    // Use ScriptAnalysisService to automatically extract varps
    const taskVarps = await this.scriptAnalysisService.generateTaskVarps(taskCompletedScriptId);
    console.log(`✅ Extracted ${taskVarps.length} task varps: ${taskVarps.slice(0, 5).join(', ')}${taskVarps.length > 5 ? '...' : ''}`);
    
    // Update the taskVarps with freshly extracted ones
    const oldVarpsCount = taskTypeDefinition.taskVarps.length;
    taskTypeDefinition.taskVarps = taskVarps;
    
    console.log(`🔄 Updated taskVarps: ${oldVarpsCount} → ${taskVarps.length} varps`);
    
    if (options.json) {
      // Ensure out directory exists
      mkdirSync('./out', { recursive: true });
      const filename = `./out/${taskTypeDefinition.taskJsonName.toLowerCase()}-tasktype.json`;
      writeFileSync(filename, JSON.stringify(taskTypeDefinition, null, 2));
      console.log(`💾 Updated task-type written to ${filename}`);
    } else {
      console.log(JSON.stringify(taskTypeDefinition, null, 2));
    }

    console.log('✨ Task varp update complete!');
    return taskTypeDefinition;
  }

  public async handleUpdateWikiData(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypesPath = path.join(taskJsonStoreDir, 'task-types.json');

    if (!existsSync(taskTypesPath)) {
      throw new Error(`task-types.json not found at ${taskTypesPath}. Run from task-scraper/ directory.`);
    }

    const taskTypes: ITaskType[] = JSON.parse(readFileSync(taskTypesPath, 'utf-8'));

    let taskTypeDefinition: ITaskType | undefined;
    if (options.type) {
      taskTypeDefinition = taskTypes.find(
        (tt) =>
          tt.taskJsonName.toLowerCase() === options.type.toLowerCase() ||
          tt.name.toLowerCase() === options.type.toLowerCase(),
      );
      if (!taskTypeDefinition) {
        console.error(`❌ Could not find task-type matching "${options.type}"`);
        console.log(`Available task types: ${taskTypes.map((tt) => tt.taskJsonName).join(', ')}`);
        throw new Error(`Task type "${options.type}" not found`);
      }
    } else {
      const choices = taskTypes.map((tt) => ({
        name: `${tt.name} (${tt.taskJsonName})`,
        value: tt,
      }));
      taskTypeDefinition = await InteractivePrompt.select('Select a task type to update wiki data for:', choices);
    }

    console.log(`📄 Selected task-type: "${taskTypeDefinition.name}" (${taskTypeDefinition.taskJsonName})`);

    const taskFilePath = options.input
      ? path.resolve(process.cwd(), options.input)
      : path.join(taskJsonStoreDir, 'tasks', `${taskTypeDefinition.taskJsonName}.min.json`);
    if (!existsSync(taskFilePath)) {
      throw new Error(`Task file not found: ${taskFilePath}`);
    }
    console.log(`📂 Reading tasks from ${taskFilePath}...`);
    const tasks: ITask[] = JSON.parse(readFileSync(taskFilePath, 'utf-8'));
    console.log(`✅ Loaded ${tasks.length} tasks`);

    const wikiUrl: string =
      options.wikiUrl ??
      taskTypeDefinition.wikiConfig?.url ??
      (await InteractivePrompt.input(
        'Enter the wiki URL with all tasks on it',
        'https://oldschool.runescape.wiki/w/Combat_Achievements/All_tasks',
      ));

    const taskIdAttribute: string =
      options.taskIdAttribute ??
      taskTypeDefinition.wikiConfig?.taskIdAttribute ??
      (await InteractivePrompt.input('Enter the task id attribute (from the tr elements)', 'data-taskid'));

    const hasCompletionFromType = taskTypeDefinition.wikiConfig?.completionColumnId !== undefined;
    const hasRequirementsFromType = taskTypeDefinition.wikiConfig?.requirementsColumnId !== undefined;

    const completionColumnRaw: string =
      options.completionColumn !== undefined
        ? options.completionColumn
        : hasCompletionFromType
          ? String(taskTypeDefinition.wikiConfig.completionColumnId ?? '')
          : (await InteractivePrompt.input('0-indexed completion percent column (leave blank to skip)', ''));

    const requirementsColumnRaw: string = options.percentOnly
      ? ''
      : options.requirementsColumn !== undefined
        ? options.requirementsColumn
        : hasRequirementsFromType
          ? String(taskTypeDefinition.wikiConfig.requirementsColumnId ?? '')
          : (await InteractivePrompt.input('0-indexed requirements/notes column (leave blank to skip)', ''));

    const completionColumnId = completionColumnRaw !== '' ? Number.parseInt(completionColumnRaw) : null;
    const requirementsColumnId = requirementsColumnRaw !== '' ? Number.parseInt(requirementsColumnRaw) : null;

    const columnDefinitions: IColumnDefinitions = {
      nameColumnId: 0,
      descriptionColumnId: 0,
      requirementsColumnId,
      pointsColumnId: null,
      completionColumnId,
    };

    console.log(`🌐 Scraping wiki data from ${wikiUrl}...`);
    const updatedTasks = await this.wikiService.extractAndAppendDataBySortId(tasks, wikiUrl, taskIdAttribute, columnDefinitions);

    if (options.percentOnly) {
      const originalBySort = new Map(tasks.map((t) => [t.sortId, t]));
      for (const task of updatedTasks) {
        const original = originalBySort.get(task.sortId);
        if (!original) continue;
        task.skills = original.skills;
        task.wikiNotes = original.wikiNotes;
      }
    }

    console.log(`✅ Wiki data merged`);

    if (options.json) {
      mkdirSync('./out', { recursive: true });
      const outPath = `./out/${taskTypeDefinition.taskJsonName}.min.json`;
      writeFileSync(outPath, JSON.stringify(updatedTasks));
      console.log(`💾 Written to ${outPath}`);
    } else {
      console.log(JSON.stringify(updatedTasks, null, 2));
    }

    console.log('✨ Wiki data update complete!');
  }

  public async handleJoinLocation(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypeName: string = options.type ?? 'LEAGUE_6';

    const tasksPath = options.input
      ? path.resolve(process.cwd(), options.input)
      : path.join(taskJsonStoreDir, 'tasks', `${taskTypeName}.min.json`);
    const locationsPath = options.locations
      ? path.resolve(process.cwd(), options.locations)
      : path.join(process.cwd(), 'out', `${taskTypeName}-locations.json`);

    if (!existsSync(tasksPath)) {
      throw new Error(`Tasks file not found: ${tasksPath}`);
    }
    if (!existsSync(locationsPath)) {
      throw new Error(`Locations file not found: ${locationsPath} — run map-location first (or place the file in ./out/)`);
    }

    const tasks: any[] = JSON.parse(readFileSync(tasksPath, 'utf-8'));
    const locationEntries: { dbRowId: number; location: { x: number; y: number; plane: number } }[] =
      JSON.parse(readFileSync(locationsPath, 'utf-8'));

    const locationByDbRowId = new Map(locationEntries.map((l) => [l.dbRowId, l.location]));

    const merged = tasks.map((task) => {
      const location = locationByDbRowId.get(task.dbRowId);
      return location ? { ...task, location } : task;
    });

    const matched = merged.filter((t) => t.location).length;
    console.log(`✅ Joined location data onto ${matched} / ${merged.length} tasks`);

    if (options.json) {
      mkdirSync('./out', { recursive: true });
      const outPath = `./out/${taskTypeName}.min.json`;
      writeFileSync(outPath, JSON.stringify(merged));
      console.log(`💾 Written to ${outPath}`);
    } else {
      console.log(JSON.stringify(merged, null, 2));
    }
  }

  public async handleMapBossKc(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypeName: string = options.type ?? 'LEAGUE_6';
    const tasksPath = path.join(taskJsonStoreDir, 'tasks', `${taskTypeName}.min.json`);

    if (!existsSync(tasksPath)) {
      throw new Error(`Tasks file not found: ${tasksPath}`);
    }

    const tasks: any[] = JSON.parse(readFileSync(tasksPath, 'utf-8'));

    console.log('🔍 Deriving boss KC varps from cache...');
    const method: string = options.method ?? 'ca';
    const result: BossKcMapResult = await this.bossKcVarpsCommand.getBossKcVarps(tasks, method);

    const mapEntries: BossKcMapEntry[] = result.mapEntries;
    console.log(`\n✅ Mapped ${mapEntries.length} boss KC entries  (${result.skipped} skipped — no boss match or no target)`);
    mkdirSync('./out', { recursive: true });
    const outPath = `./out/${taskTypeName}-boss-kc-map.json`;
    writeFileSync(outPath, JSON.stringify(mapEntries, null, 2));
    console.log(`💾 Written to ${outPath}`);
  }

  public async handleApplyBossKc(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypeName: string = options.type ?? 'LEAGUE_6';
    const tasksPath = options.input
      ? path.resolve(process.cwd(), options.input)
      : path.join(taskJsonStoreDir, 'tasks', `${taskTypeName}.min.json`);
    const mapPath = path.join(process.cwd(), 'out', `${taskTypeName}-boss-kc-map.json`);

    if (!existsSync(tasksPath)) throw new Error(`Tasks file not found: ${tasksPath}`);
    if (!existsSync(mapPath)) throw new Error(`Boss KC map not found: ${mapPath} — run map-boss-kc first`);

    const tasks: any[] = JSON.parse(readFileSync(tasksPath, 'utf-8'));
    type BossKcMapEntry = { varpId: number; target: number; dbRowId: number };
    const bossKcMap: BossKcMapEntry[] = JSON.parse(readFileSync(mapPath, 'utf-8'));

    const mapByDbRowId = new Map(bossKcMap.map(e => [e.dbRowId, e]));
    const updated = tasks.map(task => {
      const entry = mapByDbRowId.get(task.dbRowId);
      if (!entry) return task;
      return { ...task, progress: [{ type: 'VARP', id: entry.varpId, target: entry.target }] };
    });

    const patched = updated.filter((t, i) => t !== tasks[i]).length;
    console.log(`✅ Applied ${patched} boss KC progress entries (${bossKcMap.length} entries in map)`);

    if (options.json) {
      mkdirSync('./out', { recursive: true });
      const outPath = `./out/${taskTypeName}.min.json`;
      writeFileSync(outPath, JSON.stringify(updated));
      console.log(`💾 Written to ${outPath}`);
    } else {
      console.log(JSON.stringify(updated, null, 2));
    }
  }
}
