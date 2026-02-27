import { ParamID, Struct } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { writeFileSync } from 'fs';
import { StructService } from '../../../core/services/struct/struct.service';
import { ScriptAnalysisService } from '../../../core/services/script/script-analysis.service';
import { ITask, ITaskSkill } from '../../../core/types/task-mockup.interface';
import { ITaskType } from '../../../core/types/task-type-mockup.interface';
import { IInteractiveTaskExtractResult } from './interactive-task-extract-result.interface';
import { InteractiveTaskService } from './interactive-task.service';

@Injectable()
export class TasksCommand {
  constructor(
    private structService: StructService,
    private interactivetaskService: InteractiveTaskService,
    private scriptAnalysisService: ScriptAnalysisService,
  ) {}

  public async handleTaskExtract(options: any): Promise<IInteractiveTaskExtractResult> {
    const results: IInteractiveTaskExtractResult = await this.interactivetaskService.promptTaskExtraction(options);
    if (options.json) {
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

  public async handleUpdateCombatVarps(options: any): Promise<ITaskType> {
    console.log('🔧 Updating combat achievement task varps...');
    
    // Hardcoded combat achievement values
    const taskCompletedScriptId = 4834;
    const taskTypesUrl = 'https://raw.githubusercontent.com/osrs-reldo/task-json-store/refs/heads/main/task-types.json';
    
    console.log(`📊 Analyzing script ${taskCompletedScriptId} to extract task varps...`);
    
    // Use ScriptAnalysisService to automatically extract varps
    const taskVarps = await this.scriptAnalysisService.generateTaskVarps(taskCompletedScriptId);
    console.log(`✅ Extracted ${taskVarps.length} task varps: ${taskVarps.slice(0, 5).join(', ')}${taskVarps.length > 5 ? '...' : ''}`);
    
    // Load task-type definitions from GitHub
    console.log(`📡 Fetching task-types from ${taskTypesUrl}...`);
    const response = await axios.get(taskTypesUrl);
    const taskTypes: ITaskType[] = response.data;
    
    // Find combat achievement task-type (look for taskJsonName "COMBAT" or similar)
    const taskTypeDefinition = taskTypes.find(tt => 
      tt.taskJsonName === 'COMBAT' || 
      tt.taskJsonName === 'combat' ||
      tt.name?.toLowerCase().includes('combat')
    );
    
    if (!taskTypeDefinition) {
      throw new Error('Could not find combat achievement task-type in the fetched data');
    }
    
    console.log(`📄 Found combat task-type: "${taskTypeDefinition.name}" (${taskTypeDefinition.taskJsonName})`);
    
    // Update the taskVarps with freshly extracted ones
    const oldVarpsCount = taskTypeDefinition.taskVarps.length;
    taskTypeDefinition.taskVarps = taskVarps;
    taskTypeDefinition.taskCompletedScriptId = taskCompletedScriptId;
    
    console.log(`🔄 Updated taskVarps: ${oldVarpsCount} → ${taskVarps.length} varps`);
    
    if (options.json) {
      writeFileSync(`./out/combat-tasktype.json`, JSON.stringify(taskTypeDefinition, null));
      console.log(`💾 Updated task-type written to ./out/combat-tasktype.json`);
    } else {
      console.log(JSON.stringify(taskTypeDefinition, null, 2));
    }

    console.log('✨ Combat achievement varp update complete!');
    return taskTypeDefinition;
  }
}
