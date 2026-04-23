import { ParamID, Struct } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import * as path from 'path';
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

@Injectable()
export class TasksCommand {
  constructor(
    private structService: StructService,
    private interactivetaskService: InteractiveTaskService,
    private interactiveDbRowTaskService: InteractiveDbRowTaskService,
    private scriptAnalysisService: ScriptAnalysisService,
    private wikiService: WikiService,
  ) {}

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
    
    const taskTypesUrl = 'https://raw.githubusercontent.com/osrs-reldo/task-json-store/refs/heads/main/task-types.json';
    
    // Load task-type definitions from GitHub
    console.log(`📡 Fetching task-types from ${taskTypesUrl}...`);
    const response = await axios.get(taskTypesUrl);
    const taskTypes: ITaskType[] = response.data;
    
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

    const taskFilePath = path.join(taskJsonStoreDir, 'tasks', `${taskTypeDefinition.taskJsonName}.min.json`);
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
}
