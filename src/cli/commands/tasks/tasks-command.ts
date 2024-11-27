import { ParamID, Struct } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { readFileSync, writeFileSync } from 'fs';
import { PARAM_ID } from '../../../core/data/param-ids';
import { replacer } from '../../../core/json-replacer';
import { EnumService } from '../../../core/services/enum/enum.service';
import { StructService } from '../../../core/services/struct/struct.service';
import { ITask, ITaskSkill } from '../../../core/types/task-mockup.interface';
import { IInteractiveTaskExtractResult } from './interactive-task-extract-result.interface';
import { InteractiveTaskService } from './interactive-task.service';

@Injectable()
export class TasksCommand {
  constructor(
    private structService: StructService,
    private enumService: EnumService,
    private interactivetaskService: InteractiveTaskService,
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

  public async handleCompareCombat() {
    const newjsonstore = readFileSync('./new.json').toString();
    const oldjsonstore = readFileSync('./old.json').toString();
    const out = JSON.parse(newjsonstore);
    out.forEach((outItem, i) => {
      console.log(oldjsonstore[i], outItem);
    });
  }

  public async handleCombatTasks(options: any): Promise<ITask[]> {
    const orderedStructIds: number[] = [];
    const categoryEnum = await this.enumService.getEnum(3413); // Preload category enum
  
    const difficultyEnums: number[] = [3981, 3982, 3983, 3984, 3985, 3986];
    for (let enumId of difficultyEnums) {
      const orderedDifficultyStructIds: Map<number, string | number> = (await this.enumService.getEnum(enumId)).map;
      for (const structId of orderedDifficultyStructIds.values()) {
        orderedStructIds.push(structId as number);
      }
    }
  
    const allTaskStructs: Struct[] = [];
    for (let structId of orderedStructIds) {
      const taskStruct: Struct = await this.structService.getStruct(structId);
      allTaskStructs.push(taskStruct);
    }
  
    let allTasksFormatted: any[] = [];

if (options.legacy) {
  allTasksFormatted = allTaskStructs.map((s, i) => {
    const categoryValue = s.params.get(PARAM_ID.CA_CATEGORY_ID) as number;

    return {
      id: '' + (s.params.get(PARAM_ID.CA_VARBIT_INDEX) as number),
      monster: '' + (s.params.get(PARAM_ID.CA_MONSTER_ID) as number),
      name: s.params.get(PARAM_ID.CA_NAME) as string,
      description: s.params.get(PARAM_ID.CA_DESCRIPTION) as string,
      category: categoryEnum.map.get(categoryValue) || 'Unknown',
      tier: this.getLegacyTier(s.params.get(PARAM_ID.CA_TIER_ID) as number),
      clientSortId: '' + i,
      area: s.params.get(PARAM_ID.LEAGUE_AREA_ID) as string,
    };
  });
} else {
  allTasksFormatted = allTaskStructs.map((s, i) => {
    return {
      structId: s.id,
      sortId: i,
    } as ITask;
  });
}

if (options.json) {
  this.writeToFile(allTasksFormatted, 'combat.json');
} else {
  console.log(JSON.stringify(allTasksFormatted, replacer));
}

return allTasksFormatted;
  }

    public async handleLeagues4(options: any): Promise<ITask[]> {
    console.debug('handleLeagues4 invoked with options:', options);
  
    const structId: ParamID = PARAM_ID.LEAGUE_VARBIT_INDEX;
    const categoryParamId: ParamID = PARAM_ID.LEAGUE_CATEGORY_ID;
    const areaParamId: ParamID = PARAM_ID.LEAGUE_AREA_ID;
    const tierParamId: ParamID = PARAM_ID.LEAGUE_TIER_ID;
    
  
    // Define tierMap (could probably move this not here)
    const tierMap = {
      1: 'Easy',
      2: 'Medium',
      3: 'Hard',
      4: 'Elite',
      5: 'Master',
      6: 'Grandmaster',
    };
  
    const categoryEnum = await this.enumService.getEnum(3413);
    const areaEnum = await this.enumService.getEnum(3412);
    
    // Ensure the categories are read and still valid from previous year.
    console.log('Loaded areaEnum:', Array.from(areaEnum.map.entries()));

  
    // Sort function for tasks
    const sortFunction = (a: Struct, b: Struct) => {
      const aSort = a.params.get(structId) as number;
      const bSort = b.params.get(structId) as number;
      return aSort - bSort;
    };
  
    const easy = (await this.structService.findByParam(tierParamId, 1)).sort(sortFunction);
    const medium = (await this.structService.findByParam(tierParamId, 2)).sort(sortFunction);
    const hard = (await this.structService.findByParam(tierParamId, 3)).sort(sortFunction);
    const elite = (await this.structService.findByParam(tierParamId, 4)).sort(sortFunction);
    const master = (await this.structService.findByParam(tierParamId, 5)).sort(sortFunction);
  
    const all = [...easy, ...medium, ...hard, ...elite, ...master];
    let allAsTasks: any[] = [];
  
    allAsTasks = all.map((s, i) => {
      const categoryValue = s.params.get(categoryParamId) as number;
      const areaValue = s.params.get(areaParamId) as number;
      const tierValue = s.params.get(tierParamId) as number;
    
      return {
        id: '' + (s.params.get(structId) as number),
        lookupstruct: s.id,
        name: s.params.get(PARAM_ID.LEAGUE_NAME) as string,
        description: s.params.get(PARAM_ID.LEAGUE_DESCRIPTION) as string,
        category: categoryEnum.map.get(categoryValue) || 'Unknown',
        tier: tierMap[tierValue] || 'Unknown',
        clientSortId: '' + i,
        area: areaEnum.map.get(areaValue) || 'Unknown',
      };
    });
    
  
    if (options.json) {
      this.writeToFile(allAsTasks, 'leagues_4.json');
    } else {
      console.log(JSON.stringify(allAsTasks, replacer, 2));
    }
  
    return allAsTasks;
  }  

  private writeToFile(obj: any, fileNameAndPath: string): void {
    writeFileSync('./out/' + fileNameAndPath, JSON.stringify(obj, null, 2));
  }

  private getLegacyTier(value: number): string {
    switch (value) {
      case 1:
        return 'Easy';
      case 2:
        return 'Medium';
      case 3:
        return 'Hard';
      case 4:
        return 'Elite';
      case 5:
        return 'Master';
      case 6:
        return 'Grandmaster';
      default:
        throw new Error('invalid value ' + value);
    }
  }
}
