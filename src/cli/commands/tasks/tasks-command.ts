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

  public async handleGenerateFrontendTasks(
    jsonFilename: string,
    nameParamId: ParamID,
    descriptionParamId: ParamID,
    categoryParamId: ParamID,
    tierParamId: ParamID,
    areaParamId: ParamID,
  ) {
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
      const categoryId: number = struct.params.get(categoryParamId) as number;
      const tierId: number = struct.params.get(tierParamId) as number;
      const areaId: number = struct.params.get(areaParamId) as number;
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
        const out = {
          id: '' + (s.params.get(PARAM_ID.CA_VARBIT_INDEX) as number),
          monster: '' + (s.params.get(PARAM_ID.CA_MONSTER_ID) as number),
          name: s.params.get(PARAM_ID.CA_NAME) as string,
          description: s.params.get(PARAM_ID.CA_DESCRIPTION) as string,
          category: '',
          tier: this.getLegacyTier(s.params.get(PARAM_ID.CA_TIER_ID) as number),
          clientSortId: '' + i,
        };
        return out;
      });
    } else {
      allTasksFormatted = allTaskStructs.map((s, i) => {
        const out: ITask = {
          structId: s.id,
          sortId: i,
        };
        return out;
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
    const structId: ParamID = 873 as ParamID;
    const sortFunction = (a: Struct, b: Struct) => {
      const aSort = a.params.get(structId) as number;
      const bSort = b.params.get(structId) as number;
      return aSort - bSort;
    };
    const tierParamId: ParamID = 1852 as ParamID;
    const easy: Struct[] = (await this.structService.findByParam(tierParamId, 1)).sort(sortFunction);
    const medium: Struct[] = (await this.structService.findByParam(tierParamId, 2)).sort(sortFunction);
    const hard: Struct[] = (await this.structService.findByParam(tierParamId, 3)).sort(sortFunction);
    const elite: Struct[] = (await this.structService.findByParam(tierParamId, 4)).sort(sortFunction);
    const master: Struct[] = (await this.structService.findByParam(tierParamId, 5)).sort(sortFunction);
    const all = [...easy, ...medium, ...hard, ...elite, ...master];
    let allAsTasks: any[] = [];

    if (options.legacy) {
      allAsTasks = all.map((s, i) => {
        const out = {
          id: '' + (s.params.get(structId) as number),
          monster: '',
          name: s.params.get(874 as ParamID) as string,
          description: s.params.get(875 as ParamID) as string,
          category: '',
          tier: '',
          clientSortId: '' + i,
        };
        return out;
      });
    } else {
      allAsTasks = all.map((s, i) => {
        const out: ITask = {
          structId: s.params.get(structId) as number,
          sortId: i,
        };
        return out;
      });
    }

    if (options.json) {
      this.writeToFile(allAsTasks, 'leagues_4.json');
    } else {
      console.log(JSON.stringify(allAsTasks, replacer));
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
