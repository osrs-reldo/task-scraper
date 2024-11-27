import { Enum, ParamID, Struct } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import { PARAM_ID } from '../../../core/data/param-ids';
import { replacer } from '../../../core/json-replacer';
import { EnumService } from '../../../core/services/enum/enum.service';
import { StructService } from '../../../core/services/struct/struct.service';
import { WikiService } from '../../../core/services/wiki/wiki.service';
import { ITask } from '../../../core/types/task-mockup.interface';
import { ITaskType } from '../../../core/types/task-type-mockup.interface';
import { InteractivePrompt } from '../../interactive-prompt.util';
import { ISelectOption } from '../../select-option.interface';
import { LEAGUE_5_COLUMNS } from './column-definitions/league-5-columns';
import { IInteractiveTaskExtractResult } from './interactive-task-extract-result.interface';

@Injectable()
export class InteractiveTaskService {
  private readonly MAIN_PARAMS = ['id', 'name', 'description', 'tier'];

  constructor(
    private structService: StructService,
    private enumService: EnumService,
    private wikiService: WikiService,
  ) {}

  public async promptTaskExtraction(options: any): Promise<IInteractiveTaskExtractResult> {
    // search a name of a task => get name param id
    const taskNameInput: string =
      options.taskName ?? (await InteractivePrompt.input('enter a task name to get started'));
    const taskStructs: Struct[] = await this.structService.findStructs(taskNameInput);
    if (taskStructs.length === 0) {
      throw new Error(`no structs found for task name string: ${taskNameInput}`);
    }
    if (taskStructs.length > 1) {
      throw new Error('refine the task name search; more than one task found for name string: ' + taskNameInput);
    }

    console.log('map params to data; example to map from:');
    const foundTaskStruct: Struct = taskStructs[0];
    const example: any = await this.getSampleValuesForSameParams(foundTaskStruct);
    console.log(JSON.stringify(example, replacer, 2));

    const paramMap: Map<string, ParamID> = await this.promptExtractTaskParams(foundTaskStruct, options);

    console.log('extracting task data...');
    const allTasksFormatted: ITask[] = await this.extractTasks(paramMap);
    console.log('task data extracted');

    console.log('appending wiki data...');
    const wikiUrl: string = await InteractivePrompt.input(
      'enter the wiki url with all tasks on it',
      'https://oldschool.runescape.wiki/w/Raging_Echoes_League/Tasks',
    );
    const taskIdAttribute: string = await InteractivePrompt.input(
      'enter the task id attribute (from the tr elements)',
      'data-taskid',
    );
    const allTasksWithWikiData = await this.wikiService.extractAndAppendData(
      allTasksFormatted,
      wikiUrl,
      taskIdAttribute,
      paramMap.get('id'),
      LEAGUE_5_COLUMNS,
    );
    console.log('wiki data appended');

    console.log('define task type:');
    const name: string = options.name ?? (await InteractivePrompt.input('enter the task type name'));
    const description: string = options.description ?? (await InteractivePrompt.input('enter a task type description'));
    const taskJsonName: string = options.taskJsonName ?? (await InteractivePrompt.input('enter a task json name'));
    const taskTypeDefinition: ITaskType = {
      name,
      description,
      isEnabled: true,
      taskJsonName,
      filters: [], // defined after task type definition
      taskVarps: await this.promptTaskVarps(),
      otherVarps: [],
      varbits: [],
      intParamMap: this.getIntParamMap(foundTaskStruct, paramMap),
      stringParamMap: this.getStringParamMap(foundTaskStruct, paramMap),
      intEnumMap: undefined, // unused by plugin
      stringEnumMap: await this.promptStringEnumMap(),
      tierSpriteIdMap: await this.promptTierSpriteIdMap(),
      taskCompletedScriptId: await this.promptTaskCompletedScriptId(),
    };

    console.log('interactive task extraction complete!');
    return {
      taskType: taskTypeDefinition,
      tasks: allTasksWithWikiData,
    };
  }

  private async promptTaskVarps(): Promise<number[]> {
    console.log('start entering task varps; enter empty or "exit" to finish entering');
    const varpIds: number[] = [];
    let varpInput: string = '';
    while (varpInput !== undefined) {
      varpInput = await InteractivePrompt.input('input task varp (or comma-separated ids):');
      if (varpInput === '' || varpInput == null || varpInput === 'exit') {
        break;
      }
      try {
        const varpInputParts = varpInput.split(',').map((part) => part.trim());
        for (const varpInputPart of varpInputParts) {
          const varpId = Number.parseInt(varpInputPart);
          varpIds.push(varpId);
        }
      } catch (ex) {
        console.warn(`invalid varp id in input "${varpInput}", use numbers only or "exit" to finish entering`);
      }
    }
    return varpIds;
  }
  private async promptTaskCompletedScriptId(): Promise<number> {
    let taskCompletedScript: string = '';
    while (taskCompletedScript !== undefined) {
      taskCompletedScript = await InteractivePrompt.input('input the task completed script id:');
      try {
        const taskCompletedScriptId = Number.parseInt(taskCompletedScript);
        return taskCompletedScriptId;
      } catch (ex) {
        console.warn('invalid script id, use numbers only');
      }
    }
  }

  private async promptTierSpriteIdMap(): Promise<Record<string, number>> {
    console.log('start entering tier sprites; enter empty or "exit" to finish entering');
    const tierSpriteIds: Record<string, number> = {};
    let tierInput: string = '';
    while (tierInput !== undefined) {
      tierInput = await InteractivePrompt.input('input tier id:');
      if (tierInput === null || tierInput === '' || tierInput === 'exit') {
        break;
      }
      try {
        const tierId = Number.parseInt(tierInput);
        const sprite = await InteractivePrompt.input('enter sprite id for tier: ' + tierId);
        const spriteId = Number.parseInt(sprite);
        tierSpriteIds[tierId] = spriteId;
      } catch (ex) {
        console.warn('invalid tier or sprite id, use numbers only or "exit" to finish entering');
      }
    }
    return tierSpriteIds;
  }

  private async promptStringEnumMap(): Promise<Record<string, number>> {
    console.log('start entering string enums; enter empty or "exit" to finish entering');
    const stringEnumMap: Record<string, number> = {};
    let enumName: string = '';
    while (enumName !== undefined) {
      enumName = await InteractivePrompt.input('input string enum name:');
      if (enumName === null || enumName === '' || enumName === 'exit') {
        break;
      }
      const enumInput = await InteractivePrompt.input(`enter enum id for enum name ${enumName}:`);
      try {
        const enumId = Number.parseInt(enumInput);
        stringEnumMap[enumName] = enumId;
      } catch (ex) {
        console.warn('invalid enum id, use numbers only or "exit" to finish entering');
      }
    }
    return stringEnumMap;
  }

  private getStringParamMap(exampleStruct: Struct, paramMap: Map<string, ParamID>): Record<string, number> {
    const stringParamMap: Record<string, number> = {};
    for (const [paramName, paramId] of paramMap.entries()) {
      if (typeof exampleStruct.params.get(paramId) === 'string') {
        stringParamMap[paramName] = paramId;
      }
    }
    return stringParamMap;
  }

  private getIntParamMap(exampleStruct: Struct, paramMap: Map<string, ParamID>): Record<string, number> {
    const intParamMap: Record<number, number> = {};
    for (const [paramName, paramId] of paramMap.entries()) {
      if (typeof exampleStruct.params.get(paramId) === 'number') {
        intParamMap[paramName] = paramId;
      }
    }

    return intParamMap;
  }

  private async extractTasks(paramMap: Map<string, ParamID>) {
    // search for all task structs with name param id, use tier because name returns ones with undefined tiers
    const allTaskStructs: Struct[] = (await this.structService.findByParam(paramMap.get('tier'))).filter((s) => {
      const tierId: number = s.params.get(paramMap.get('tier')) as number;
      if (tierId === 100 && paramMap.get('tier') === PARAM_ID.CA_TIER_ID) {
        // edge case for some christmas achievements that used combat achievement struct params
        // as of 9/22/2024, struct id 740 is the only remaining; named "Can't stop" with tier id 100
        // https://oldschool.runescape.wiki/w/2023_Christmas_event
        return false;
      }
      return tierId !== undefined;
    });

    let tierEnumIds: number[] = (await this.extractTierEnumIdsFromTasks(allTaskStructs, paramMap)).filter(
      (value) => !!value,
    );

    // League 4 had all tasks in 1 enum. Combat has them in separate
    const allEnumIdsEqual = tierEnumIds.every((value) => value === tierEnumIds[1]);
    if (allEnumIdsEqual) {
      tierEnumIds = [5728];
    }

    // use enums to pull tasks in proper order
    const structIdsOrderedByTierEnums: number[] = await this.getStructIdsFromEnumIds(tierEnumIds);

    const structsOrderedByTierEnums: Struct[] = [];
    for (let structId of structIdsOrderedByTierEnums) {
      const taskStruct: Struct = await this.structService.getStruct(structId);
      structsOrderedByTierEnums.push(taskStruct);
    }

    // Validate the number of structs in the list of structs by presence of tier param to the list of structs from enums
    // if (allTaskStructs.length !== structsOrderedByTierEnums.length) {
    //   if (
    //     paramMap.get('tier') === PARAM_ID.LEAGUE_TIER_ID &&
    //     allTaskStructs.length === 1482 &&
    //     structsOrderedByTierEnums.length === 1480
    //   ) {
    //     // Skip mismatch if League 4 and the task count is off by 2
    //     // Two odd tasks not in the struct, contentious whether they actually exist
    //   } else {
    //     throw new Error(
    //       `task count after enum pulls does not match initial count by name param ${allTaskStructs.length}!=${structsOrderedByTierEnums.length}`,
    //     );
    //   }
    // }

    const allTasksFormatted: ITask[] = structsOrderedByTierEnums.map((s, i) => {
      const out: ITask = {
        structId: s.id,
        sortId: i,
      };
      return out;
    });
    return allTasksFormatted;
  }

  private async getStructIdsFromEnumIds(enumIds: number[]): Promise<number[]> {
    const orderedStructIds: number[] = [];
    for (let enumId of enumIds) {
      if (!enumId) {
        // unsure if 0 indexed so skip undefined values
        continue;
      }
      const orderedEnumStructIds: Map<number, string | number> = (await this.enumService.getEnum(enumId)).map;
      for (const structId of orderedEnumStructIds.values()) {
        orderedStructIds.push(structId as number);
      }
    }
    return orderedStructIds;
  }

  private async extractTierEnumIdsFromTasks(taskStructs: Struct[], paramMap: Map<string, ParamID>): Promise<number[]> {
    // group by tier (difficulty)
    const tierTaskStructsMap = new Map<number, Struct[]>();
    taskStructs.forEach((taskStruct) => {
      const tierId: number = taskStruct.params.get(paramMap.get('tier')) as number;
      const structsInTier = tierTaskStructsMap.get(tierId) || [];
      tierTaskStructsMap.set(tierId, [...structsInTier, taskStruct]);
    });

    let tierEnums: number[] = [];
    for (const [tierId, structs] of tierTaskStructsMap.entries()) {
      const sample: Struct = structs[5];
      const possibleEnums: Enum[] = await this.enumService.findEnumsByStruct(sample.id);
      const tierStructIds: number[] = structs.map((s) => s.id);
      const filteredEnums = possibleEnums.filter((e) => {
        const enumStructIds: Set<number> = new Set(e.map.values() as IterableIterator<number>);
        for (const tierStructId of tierStructIds) {
          if (tierStructId === 1949 || tierStructId === 5704) {
            // Two odd structs from leagues 4
            continue;
          }
          if (!enumStructIds.has(tierStructId)) {
            console.warn(`tierStructId ${tierStructId} not found in enumStructIds of enum ${e.id}`);
            return false;
          }
        }
        return true;
      });
      if (filteredEnums.length === 0) {
        throw new Error(`could not find enum for tier ${tierId} from possible`);
      }
      if (filteredEnums.length > 1) {
        throw new Error(`too many enums for tier ${tierId} after filtering`);
      }
      tierEnums[tierId] = filteredEnums[0].id;
    }
    return tierEnums;
  }

  private async promptExtractTaskParams(foundTaskStruct: Struct, options: any): Promise<Map<string, ParamID>> {
    const paramMap = new Map<string, ParamID>();
    let unmappedParams: ISelectOption<ParamID>[] = this.getSelectAParamOptions(
      Array.from(foundTaskStruct.params.keys()),
    );
    for (const paramName of this.MAIN_PARAMS) {
      const paramId: ParamID =
        options[paramName + 'Param'] ??
        (await InteractivePrompt.select(`select the param for ${paramName}`, unmappedParams));
      paramMap.set(paramName, paramId);
      unmappedParams = unmappedParams.filter((unmapped) => unmapped.value !== paramId);
    }

    // map other params
    let isMappingAdditional = options.addlParams !== false && unmappedParams.length > 0;
    while (isMappingAdditional) {
      const shouldContinue: boolean = await InteractivePrompt.confirm(
        `there are ${unmappedParams.length} remaining unmapped params. would you like to map them?`,
      );
      if (!shouldContinue) {
        break;
      }
      const paramId: ParamID = await InteractivePrompt.select('select the param to map', unmappedParams);
      if (paramId === -999) {
        break;
      }
      const paramName: string = await InteractivePrompt.input('enter the parameter name');
      paramMap.set(paramName, paramId);
      unmappedParams = unmappedParams.filter((unmapped) => unmapped.value !== paramId);
      isMappingAdditional = unmappedParams.length > 0;
    }
    return paramMap;
  }

  private async getSampleValuesForSameParams(sourceStruct: Struct): Promise<any> {
    const example: { [key: number]: any[] } = {};
    for (const paramId of sourceStruct.params.keys()) {
      const samples: Struct[] = (await this.structService.findByParam(paramId)).splice(0, 5);
      example[paramId] = samples.map((s) => s.params.get(paramId));
    }
    return example;
  }

  private getSelectAParamOptions(paramIds: ParamID[]): ISelectOption<ParamID>[] {
    const knownParamNamesById: Map<number, string> = new Map();
    Object.entries(PARAM_ID).forEach(([name, id]) => {
      knownParamNamesById.set(id, name);
    });
    const paramOptions: ISelectOption<ParamID>[] = [];
    paramIds.forEach((paramId) => {
      let knownNameSuffix: string = '';
      const knownName: string | undefined = knownParamNamesById.get(paramId);
      if (knownName) {
        knownNameSuffix = ` (${knownName})`;
      }
      const label: string = `${paramId}${knownNameSuffix}`;

      paramOptions.push({
        name: label,
        value: paramId,
      });
    });
    paramOptions.push({
      name: 'EXIT',
      value: -999 as ParamID,
    });
    return paramOptions;
  }
}
