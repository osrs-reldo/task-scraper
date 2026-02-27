import { ParamID, Struct } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { writeFileSync, mkdirSync } from 'fs';
import { StructService } from '../../../core/services/struct/struct.service';
import { ScriptAnalysisService } from '../../../core/services/script/script-analysis.service';
import { ITask, ITaskSkill } from '../../../core/types/task-mockup.interface';
import { ITaskType } from '../../../core/types/task-type-mockup.interface';
import { IInteractiveTaskExtractResult } from './interactive-task-extract-result.interface';
import { InteractiveTaskService } from './interactive-task.service';
import { InteractivePrompt } from '../../interactive-prompt.util';

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
}
