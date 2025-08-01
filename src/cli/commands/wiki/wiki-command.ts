import { Injectable } from '@nestjs/common';
import { ParamID } from '@abextm/cache2';
import { readFileSync, writeFileSync } from 'fs';
import { IColumnDefinitions } from '../../../core/services/wiki/column-definitions.interface';
import { WikiService } from '../../../core/services/wiki/wiki.service';
import { ITask } from '../../../core/types/task-mockup.interface';
import { InteractivePrompt } from '../../interactive-prompt.util';
import { COMBAT_COLUMNS } from '../tasks/column-definitions/combat-columns';
import { PARAM_ID } from '../../../core/data/param-ids';
import { LEAGUE_5_COLUMNS } from '../tasks/column-definitions/league-5-columns';

@Injectable()
export class WikiCommand {
  constructor(private wikiService: WikiService) {}

  public async handleWikiTaskTypeExtract(options: any) {
    const wikiUrl: string = await InteractivePrompt.input(
      'enter the wiki url with all tasks on it',
      'https://oldschool.runescape.wiki/w/Raging_Echoes_League/Tasks',
    );

    const taskIdAttribute: string = await InteractivePrompt.input(
      'enter the task id attribute (from the tr elements)',
      'data-taskid',
    );

    // TODO: Get from user
    const columnDefinitions: IColumnDefinitions = LEAGUE_5_COLUMNS;

    const includeNameDescription = true;
    const data = await this.wikiService.extractWikiData(
      wikiUrl,
      taskIdAttribute,
      columnDefinitions,
      includeNameDescription,
    );

    if (options.json) {
      writeFileSync(`./out/wiki-scrape.json`, JSON.stringify(data, null));
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  public async handleWikiAppend(taskJsonFile: string, options: any) {
    const wikiUrl: string = await InteractivePrompt.input(
      'enter the wiki url with all tasks on it',
      'https://oldschool.runescape.wiki/w/Raging_Echoes_League/Tasks',
    );

    const taskIdAttribute: string = await InteractivePrompt.input(
      'enter the task id attribute (from the tr elements)',
      'data-taskid',
    );

    // TODO: Get from user
    const columnDefinitions: IColumnDefinitions = COMBAT_COLUMNS;

    // Load existing task dump
    const taskJsonPath = taskJsonFile.endsWith('.json') ? taskJsonFile : `${taskJsonFile}.json`;
    let tasks: ITask[];
    
    try {
      const taskJsonContent = readFileSync(taskJsonPath, 'utf-8');
      tasks = JSON.parse(taskJsonContent);
    } catch (error) {
      console.error(`Error reading task file ${taskJsonPath}:`, error);
      return;
    }

    // Get varbit index param ID
    const varbitIndexParamIdInput: string = await InteractivePrompt.input(
      'enter the varbit index param id (used to match wiki data to tasks)'
    );
    const varbitIndexParamId: ParamID = Number.parseInt(varbitIndexParamIdInput) as ParamID;

    console.log('Appending wiki data to tasks...');
    const enhancedTasks = await this.wikiService.extractAndAppendData(
      tasks,
      wikiUrl,
      taskIdAttribute,
      varbitIndexParamId,
      columnDefinitions,
    );

    const outputFileName = taskJsonPath.replace('.json', '-with-wiki.json');
    if (options.json) {
      writeFileSync(outputFileName, JSON.stringify(enhancedTasks, null));
      console.log(`Enhanced tasks written to ${outputFileName}`);
    } else {
      console.log(JSON.stringify(enhancedTasks, null, 2));
    }
  }

  public async handleWikiAppendCombat(options: any) {
    // Hardcoded values for combat achievements
    const wikiUrl = 'https://oldschool.runescape.wiki/w/Combat_Achievements/All_tasks';
    const taskIdAttribute = 'data-ca-task-id';
    const columnDefinitions: IColumnDefinitions = COMBAT_COLUMNS;
    const varbitIndexParamId: ParamID = PARAM_ID.CA_VARBIT_INDEX;

    console.log('Using hardcoded combat achievement settings:');
    console.log(`  Wiki URL: ${wikiUrl}`);
    console.log(`  Task ID attribute: ${taskIdAttribute}`);
    console.log(`  Varbit index param ID: ${varbitIndexParamId}`);

    // Load existing task dump
    let tasks: ITask[];
    
    const taskJsonPath = './out/combat.json';
    try {
      const taskJsonContent = readFileSync(taskJsonPath, 'utf-8');
      tasks = JSON.parse(taskJsonContent);
    } catch (error) {
      console.error(`Error reading task file ${taskJsonPath}:`, error);
      return;
    }

    console.log('Appending wiki data to combat tasks...');
    const enhancedTasks = await this.wikiService.extractAndAppendData(
      tasks,
      wikiUrl,
      taskIdAttribute,
      varbitIndexParamId,
      columnDefinitions,
    );

    const outputFileName = taskJsonPath.replace('.json', '-with-wiki.json');
    if (options.json) {
      writeFileSync(outputFileName, JSON.stringify(enhancedTasks, null));
      console.log(`Enhanced combat tasks written to ${outputFileName}`);
    } else {
      console.log(JSON.stringify(enhancedTasks, null, 2));
    }
  }
}
