import { ParamID, Struct } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ITask, ITaskSkill } from '../../types/task-mockup.interface';
import { StructService } from '../struct/struct.service';
import { IColumnDefinitions } from './column-definitions.interface';
import { SKILL_NAMES } from './skills';
import { ITaskWikiData } from './task-wiki-data.interface';

@Injectable()
export class WikiService {
  constructor(private structService: StructService) {}

  public async extractAndAppendData(
    tasks: ITask[],
    wikiUrl: string,
    taskIdAttribute: string,
    varbitIndexParamId: ParamID,
    columnDefinitions: IColumnDefinitions,
  ): Promise<ITask[]> {
    const tasksByVarbitIndex: Map<number, ITask> = new Map();
    for (const task of tasks) {
      const struct: Struct = await this.structService.getStruct(task.structId);
      const varbitIndex = struct.params.get(varbitIndexParamId) as number;
      tasksByVarbitIndex.set(varbitIndex, task);
    }

    const extractedWikiData = await this.extractWikiData(wikiUrl, taskIdAttribute, columnDefinitions);

    for (const taskWikiData of extractedWikiData) {
      const task: ITask = tasksByVarbitIndex.get(taskWikiData.varbitIndex);
      if (!task) {
        console.error('task not found by varbit index ' + taskWikiData.varbitIndex);
        continue;
        // throw new Error('task not found by varbit index ' + taskWikiData.varbitIndex);
      }
      if (taskWikiData.skills) {
        task.skills = taskWikiData.skills;
      }
      if (taskWikiData.notes) {
        task.wikiNotes = taskWikiData.notes;
      }
      if (taskWikiData.completionPercent) {
        task.completionPercent = taskWikiData.completionPercent;
      }
    }

    return tasks;
  }

  public async extractWikiData(
    wikiUrl: string,
    taskIdAttribute: string,
    columnDefinitions: IColumnDefinitions,
    includeNameDescription: boolean = false,
  ): Promise<ITaskWikiData[]> {
    try {
      const response = await axios.get(wikiUrl);
      const html = response.data;

      // Load the HTML with Cheerio
      const $ = cheerio.load(html);

      const result: ITaskWikiData[] = [];

      $(`tr[${taskIdAttribute}]`).each((_idx, element) => {
        const row = $(element);
        const cells = row.find('td');
        const varbitIndex = Number.parseInt(row.attr(taskIdAttribute));

        // parse name description
        let name: string = undefined;
        let description: string = undefined;
        if (includeNameDescription) {
          const nameCell = cells[columnDefinitions.nameColumnId];
          name = $(nameCell).text().trim();
          const descriptionCell = cells[columnDefinitions.descriptionColumnId];
          description = $(descriptionCell).text().trim();
        }

        // notes & skills
        let notes: string = undefined;
        let skills: ITaskSkill[] = [];
        if (columnDefinitions.requirementsColumnId) {
          const requirementsCell = cells[columnDefinitions.requirementsColumnId];

          // suffix coins image and amount with word "coins"
          const coinElements = $(requirementsCell).find('span.coins');
          if (coinElements.length > 0) {
            const amountOfCoins = $(coinElements).text();
            const plural = amountOfCoins !== '1';
            $(coinElements).text(`${amountOfCoins} coin${plural ? 's' : ''}`);
          }

          // replace region "buttons" with just their name
          const regionElements = $(requirementsCell).find('span.tbz-region');
          if (regionElements.length > 0) {
            for (const regionElement of regionElements) {
              const cleanedRegion = $(regionElement).text().replace('✓', '').trim();
              $(regionElement).text(cleanedRegion);
            }
          }

          // parse skills
          const scps = $(requirementsCell).find('span.scp');
          for (const scp of scps) {
            const skill = $(scp).attr('data-skill')?.toUpperCase();
            if (!SKILL_NAMES.has(skill)) continue;

            const levelString = $(scp).attr('data-level');
            try {
              const level = Number.parseInt(levelString);
              skills.push({
                skill,
                level,
              });
            } catch (ex) {
              console.error(
                `unable to parse skill (${skill}) level "${levelString}" for task varbit index ${varbitIndex}' + )`,
              );
            }
          }

          // replace linebreaks in the cell with a space, so they're not appended to the previous line without a space
          let cleanedHtml = $(requirementsCell).html().replace('<br>', ' ');
          $(requirementsCell).html(cleanedHtml);

          // get requirements cell text
          let requirementsCellText = $(requirementsCell).text().trim();
          if (requirementsCellText === 'N/A') {
            requirementsCellText = undefined;
          }
          notes = requirementsCellText;
        }

        let completionPercent: number = undefined;
        if (columnDefinitions.completionColumnId) {
          const completionCell = cells[columnDefinitions.completionColumnId];
          completionPercent = Number.parseFloat($(completionCell).text().replace('%', ''));
        }

        const taskData: ITaskWikiData = {
          varbitIndex,
          name,
          description,
          notes,
          completionPercent,
          skills: skills?.length > 0 ? skills : undefined,
        };
        result.push(taskData);
      });

      return result;
    } catch (error) {
      console.error('Error scraping the wiki page:', error);
      return [];
    }
  }
}
