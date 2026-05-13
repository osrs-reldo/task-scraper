import { DBRow, Enum } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import { replacer } from '../../../core/json-replacer';
import { DBRowService } from '../../../core/services/dbrow/dbrow.service';
import { EnumService } from '../../../core/services/enum/enum.service';
import { WikiService } from '../../../core/services/wiki/wiki.service';
import { ScriptAnalysisService } from '../../../core/services/script/script-analysis.service';
import { ITask } from '../../../core/types/task-mockup.interface';
import { ITaskType } from '../../../core/types/task-type-mockup.interface';
import { InteractivePrompt } from '../../interactive-prompt.util';
import { ISelectOption } from '../../select-option.interface';
import { LEAGUE_5_COLUMNS } from './column-definitions/league-5-columns';
import { LEAGUE_6_COLUMNS } from './column-definitions/league-6-columns';
import { IInteractiveTaskExtractResult } from './interactive-task-extract-result.interface';
import { IColumnDefinitions } from 'src/core/services/wiki/column-definitions.interface';

interface DbRowColumnMapping {
  name: string;
  columnIndex: number;
  type: 'int' | 'string';
}

@Injectable()
export class InteractiveDbRowTaskService {
  private readonly MAIN_COLUMNS = ['name', 'description', 'tier'];

  constructor(
    private dbrowService: DBRowService,
    private enumService: EnumService,
    private wikiService: WikiService,
    private scriptAnalysisService: ScriptAnalysisService,
  ) {}

  public async promptTaskExtraction(options: any): Promise<IInteractiveTaskExtractResult> {
    // Step 1: Get source enum containing dbrow IDs
    const enumIdInput: string =
      options.enumId ?? (await InteractivePrompt.input('enter the enum id that contains the dbrow ids'));
    const enumId = Number.parseInt(enumIdInput);
    const sourceEnum: Enum = await this.enumService.getEnum(enumId);
    if (!sourceEnum || !sourceEnum.map || sourceEnum.map.size === 0) {
      throw new Error(`enum ${enumId} not found or is empty`);
    }
    console.log(`found enum ${enumId} with ${sourceEnum.map.size} entries`);

    // Step 2: Load dbrows from the enum values
    const dbrowIds: number[] = [];
    for (const value of sourceEnum.map.values()) {
      if (typeof value === 'number') {
        dbrowIds.push(value);
      }
    }
    if (dbrowIds.length === 0) {
      throw new Error(`enum ${enumId} has no numeric (dbrow id) values`);
    }
    console.log(`loading ${dbrowIds.length} dbrows from enum...`);

    const sampleDbRow: DBRow = await this.dbrowService.getDBRow(dbrowIds[0]);
    if (!sampleDbRow) {
      throw new Error(`could not load sample dbrow ${dbrowIds[0]}`);
    }

    // Step 3: Display sample dbrow for column mapping
    console.log('sample dbrow for column mapping:');
    console.log(JSON.stringify(sampleDbRow, replacer, 2));
    this.printDbRowColumns(sampleDbRow);

    // Step 4: Map columns to task params interactively
    const columnMappings: DbRowColumnMapping[] = await this.promptColumnMappings(sampleDbRow, options);

    // Step 5: Extract task data from all dbrows
    console.log('extracting task data from dbrows...');
    const allTasks: ITask[] = await this.extractTasksFromDbRows(dbrowIds, columnMappings);
    console.log(`extracted ${allTasks.length} tasks`);

    // Step 6: Append wiki data
    console.log('appending wiki data...');
    const wikiUrl: string = await InteractivePrompt.input(
      'enter the wiki url with all tasks on it',
      'https://oldschool.runescape.wiki/w/Raging_Echoes_League/Tasks',
    );
    const taskIdAttribute: string = await InteractivePrompt.input(
      'enter the task id attribute (from the tr elements)',
      'data-taskid',
    );
    const columnDefs = [LEAGUE_5_COLUMNS, LEAGUE_6_COLUMNS];
    let columnDefinitions: IColumnDefinitions;
    if (columnDefs.some((defs) => defs.nameColumnId === 1 && defs.descriptionColumnId === 2)) {
      const columnDefOptions: ISelectOption<IColumnDefinitions>[] = columnDefs.map((defs, index) => ({
        name: `League ${index + 5}`,
        value: defs,
      }));
      columnDefinitions = await InteractivePrompt.select(
        'select the column definitions to use for wiki data extraction',
        columnDefOptions,
        LEAGUE_5_COLUMNS,
      );
    }

    // For dbrow tasks, we match wiki data by sortId (enum index)
    const allTasksWithWikiData = await this.wikiService.extractAndAppendDataBySortId(
      allTasks,
      wikiUrl,
      taskIdAttribute,
      columnDefinitions,
    );
    console.log('wiki data appended');

    // Step 7: Define task type
    console.log('define task type:');
    const name: string = options.name ?? (await InteractivePrompt.input('enter the task type name'));
    const description: string = options.description ?? (await InteractivePrompt.input('enter a task type description'));
    const taskJsonName: string = options.taskJsonName ?? (await InteractivePrompt.input('enter a task json name'));

    // Get script ID and extract varps
    const taskCompletedScriptId = await this.promptTaskCompletedScriptId();
    const taskVarps = await this.extractTaskVarpsFromScript(taskCompletedScriptId);

    // Build int/string column maps from mappings
    const intColumnMap: Record<string, number> = {};
    const stringColumnMap: Record<string, number> = {};
    for (const mapping of columnMappings) {
      if (mapping.type === 'int') {
        intColumnMap[mapping.name] = mapping.columnIndex;
      } else {
        stringColumnMap[mapping.name] = mapping.columnIndex;
      }
    }

    const taskTypeDefinition: ITaskType = {
      name,
      description,
      isEnabled: true,
      taskJsonName,
      filters: [],
      taskVarps,
      otherVarps: [],
      varbits: [],
      intParamMap: intColumnMap,
      stringParamMap: stringColumnMap,
      intEnumMap: undefined,
      stringEnumMap: await this.promptStringEnumMap(),
      tierSpriteIdMap: await this.promptTierSpriteIdMap(),
      taskCompletedScriptId,
      taskPointTiers: [],
      taskCompletionCountTiers: [],
      taskSourceType: 'DBROW',
    } as any;

    console.log('interactive dbrow task extraction complete!');
    return {
      taskType: taskTypeDefinition,
      tasks: allTasksWithWikiData,
    };
  }

  private printDbRowColumns(dbrow: DBRow): void {
    if (!dbrow.values || !Array.isArray(dbrow.values)) {
      console.log('(no column values on dbrow)');
      return;
    }
    console.log('columns:');
    dbrow.values.forEach((columnValues, colIndex) => {
      if (!Array.isArray(columnValues)) {
        console.log(`  [${colIndex}]: (empty)`);
        return;
      }
      const types = columnValues.map((v) => typeof v);
      const preview = columnValues.map((v) => (typeof v === 'string' ? `"${v}"` : v));
      console.log(`  [${colIndex}]: ${preview.join(', ')}  (types: ${types.join(', ')})`);
    });
  }

  private async promptColumnMappings(sampleDbRow: DBRow, options: any): Promise<DbRowColumnMapping[]> {
    const mappings: DbRowColumnMapping[] = [];
    const columnOptions: ISelectOption<number>[] = this.getColumnSelectOptions(sampleDbRow);

    for (const columnName of this.MAIN_COLUMNS) {
      const columnIndex: number =
        options[columnName + 'Column'] ??
        (await InteractivePrompt.select(`select the column for "${columnName}"`, columnOptions));
      const columnType = this.inferColumnType(sampleDbRow, columnIndex);
      mappings.push({ name: columnName, columnIndex, type: columnType });
    }

    // Map additional columns
    let isMappingAdditional = options.addlColumns !== false && columnOptions.length > mappings.length;
    while (isMappingAdditional) {
      const shouldContinue: boolean = await InteractivePrompt.confirm(
        `there are unmapped columns remaining. would you like to map more?`,
      );
      if (!shouldContinue) {
        break;
      }
      const columnIndex: number = await InteractivePrompt.select('select the column to map', columnOptions);
      if (columnIndex === -999) {
        break;
      }
      const columnName: string = await InteractivePrompt.input('enter the column name');
      const columnType = this.inferColumnType(sampleDbRow, columnIndex);
      mappings.push({ name: columnName, columnIndex, type: columnType });
    }
    return mappings;
  }

  private getColumnSelectOptions(dbrow: DBRow): ISelectOption<number>[] {
    const options: ISelectOption<number>[] = [];
    if (!dbrow.values || !Array.isArray(dbrow.values)) {
      return options;
    }
    dbrow.values.forEach((columnValues, colIndex) => {
      if (!Array.isArray(columnValues)) {
        options.push({ name: `[${colIndex}]: (empty)`, value: colIndex });
        return;
      }
      const preview = columnValues
        .slice(0, 3)
        .map((v) => (typeof v === 'string' ? `"${v}"` : v))
        .join(', ');
      options.push({ name: `[${colIndex}]: ${preview}`, value: colIndex });
    });
    options.push({ name: 'EXIT', value: -999 });
    return options;
  }

  private inferColumnType(dbrow: DBRow, columnIndex: number): 'int' | 'string' {
    if (!dbrow.values || !Array.isArray(dbrow.values) || !dbrow.values[columnIndex]) {
      return 'int';
    }
    const firstValue = dbrow.values[columnIndex]?.[0];
    return typeof firstValue === 'string' ? 'string' : 'int';
  }

  private async extractTasksFromDbRows(
    dbrowIds: number[],
    columnMappings: DbRowColumnMapping[],
  ): Promise<ITask[]> {
    const tasks: ITask[] = [];
    const skipped: number[] = [];
    for (let i = 0; i < dbrowIds.length; i++) {
      const dbrowId = dbrowIds[i];
      let dbrow: DBRow;
      try {
        dbrow = await this.dbrowService.getDBRow(dbrowId);
      } catch (error: any) {
        console.warn(`failed to load dbrow ${dbrowId}: ${error.message}, skipping`);
        skipped.push(dbrowId);
        continue;
      }
      if (!dbrow) {
        console.warn(`could not load dbrow ${dbrowId}, skipping`);
        skipped.push(dbrowId);
        continue;
      }
      const task: ITask = {
        structId: undefined, // not applicable for dbrow tasks
        dbRowId: dbrowId,
        sortId: tasks.length, // flat positional index for bitmask completion
      } as any; // extended fields beyond base ITask

      tasks.push(task);
    }
    if (skipped.length > 0) {
      console.warn(`skipped ${skipped.length} dbrows due to load errors: ${skipped.join(', ')}`);
    }
    return tasks;
  }

  private async extractTaskVarpsFromScript(scriptId: number): Promise<number[]> {
    console.log(`Analyzing script ${scriptId} to extract task varps...`);
    try {
      const taskVarps = await this.scriptAnalysisService.generateTaskVarps(scriptId);
      console.log(`Automatically extracted ${taskVarps.length} task varps: ${taskVarps.join(', ')}`);

      const useAutomatic = await InteractivePrompt.confirm(
        `Use automatically extracted varps? (${taskVarps.length} found)`,
      );

      if (useAutomatic) {
        return taskVarps;
      } else {
        console.log('Falling back to manual input...');
        return await this.promptTaskVarps();
      }
    } catch (error: any) {
      console.warn(`Failed to analyze script ${scriptId}:`, error.message);
      console.log('Falling back to manual input...');
      return await this.promptTaskVarps();
    }
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

  private async promptNumberInput(message: string, defaultValue?: string): Promise<number> {
    const input = await InteractivePrompt.input(message, defaultValue);
    return Number.parseInt(input);
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
}
