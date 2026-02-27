import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'node:fs/promises';
import * as path from 'path';
import * as os from 'node:os';
import { EnumService } from '../core/services/enum/enum.service';
import { QuestRequirementsService } from '../core/services/quests/quest-requirements.service';
import { StructService } from '../core/services/struct/struct.service';

interface CustomColumnDefinition {
  key: string;
  label: string;
  valueType: 'string' | 'number' | 'boolean' | 'skills' | 'quests';
  values: Record<
    string,
    string | number | boolean | null | { skill: string; level: number }[] | string[]
  >;
}

interface TaskRow {
  structId: number;
  sortId: number;
  skills?: any[];
  metadata?: Record<string, string | number>;
  wikiNotes?: string;
  completionPercent?: number;
  params: Record<string, string | number | null>;
  enumValues: Record<string, string | number | null>;
}

@Injectable()
/**
 * Data access layer used by the editor UI.
 *
 * Responsibilities:
 * - Load task types and task rows from task-json-store (including params/enums).
 * - Read/write custom columns (skills/quests/etc) under task-json-store/custom-data.
 * - Update task skill arrays in tasks/*.min.json.
 * - Fetch wiki summaries for quick in-editor context.
 * - Provide quest lists and rollups for requirement editing.
 * - Persist wizard state for the editor workflow.
 */
export class EditorService {
  constructor(
    private readonly structService: StructService,
    private readonly enumService: EnumService,
    private readonly questRequirements: QuestRequirementsService,
  ) {}

  private async resolveTaskJsonStorePath(): Promise<string> {
    const candidates = [
      path.resolve(process.cwd(), 'task-json-store'),
      path.resolve(process.cwd(), '../task-json-store'),
      path.resolve(process.cwd(), '../../task-json-store'),
    ];
    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isDirectory()) {
          return candidate;
        }
      } catch {
        // ignore
      }
    }
    throw new Error('Could not locate task-json-store directory relative to current working directory.');
  }

  public async getTaskTypes(): Promise<any[]> {
    const storePath = await this.resolveTaskJsonStorePath();
    const taskTypesPath = path.join(storePath, 'task-types.json');
    const data = await fs.readFile(taskTypesPath, 'utf-8');
    return JSON.parse(data);
  }

  public async getTaskType(taskJsonName: string): Promise<any> {
    const taskTypes = await this.getTaskTypes();
    const taskType = taskTypes.find((t) => t.taskJsonName === taskJsonName);
    if (!taskType) {
      throw new Error(`Task type not found for taskJsonName ${taskJsonName}`);
    }
    return taskType;
  }

  public async getTasks(taskJsonName: string): Promise<TaskRow[]> {
    const storePath = await this.resolveTaskJsonStorePath();
    const taskType = await this.getTaskType(taskJsonName);
    const tasksPath = path.join(storePath, 'tasks', `${taskJsonName}.min.json`);
    const raw = await fs.readFile(tasksPath, 'utf-8');
    const tasks = JSON.parse(raw);

    const intParamMap = taskType.intParamMap ?? {};
    const stringParamMap = taskType.stringParamMap ?? {};
    const paramMap: Record<string, number> = {
      ...intParamMap,
      ...stringParamMap,
    };

    const enumMap: Record<string, number> = taskType.stringEnumMap ?? {};

    const tasksWithParams: TaskRow[] = await Promise.all(
      tasks.map(async (task) => {
        const struct = await this.structService.getStruct(task.structId);
        const params: Record<string, string | number | null> = {};
        for (const [key, paramId] of Object.entries(paramMap)) {
          const value = struct.params.get(paramId as any);
          params[key] = value ?? null;
        }

        const enumValues: Record<string, string | number | null> = {};
        for (const [key, enumId] of Object.entries(enumMap)) {
          const paramId = paramMap[key];
          const rawValue = paramId ? struct.params.get(paramId as any) : undefined;
          if (rawValue === undefined || rawValue === null) {
            enumValues[key] = null;
            continue;
          }
          const enumData = await this.enumService.getEnum(enumId);
          const mapped = enumData.map.get(rawValue as any);
          enumValues[key] = mapped ?? null;
        }

        return {
          structId: task.structId,
          sortId: task.sortId,
          skills: task.skills,
          metadata: task.metadata,
          wikiNotes: task.wikiNotes,
          completionPercent: task.completionPercent,
          params,
          enumValues,
        } as TaskRow;
      }),
    );

    return tasksWithParams;
  }

  public async getCustomColumns(taskJsonName: string): Promise<CustomColumnDefinition[]> {
    const storePath = await this.resolveTaskJsonStorePath();
    const customDir = path.join(storePath, 'custom-data', taskJsonName);
    try {
      const entries = await fs.readdir(customDir);
      const columns: CustomColumnDefinition[] = [];
      for (const entry of entries) {
        if (!entry.endsWith('.json')) {
          continue;
        }
        const content = await fs.readFile(path.join(customDir, entry), 'utf-8');
        columns.push(JSON.parse(content));
      }
      return columns;
    } catch {
      return [];
    }
  }

  public async createCustomColumn(
    taskJsonName: string,
    column: Pick<CustomColumnDefinition, 'key' | 'label' | 'valueType'>,
  ): Promise<CustomColumnDefinition> {
    const storePath = await this.resolveTaskJsonStorePath();
    const customDir = path.join(storePath, 'custom-data', taskJsonName);
    await fs.mkdir(customDir, { recursive: true });
    const filePath = path.join(customDir, `${column.key}.json`);

    const columnData: CustomColumnDefinition = {
      key: column.key,
      label: column.label,
      valueType: column.valueType,
      values: {},
    };
    await fs.writeFile(filePath, JSON.stringify(columnData, null, 2));
    return columnData;
  }

  public async saveCustomColumnValues(
    taskJsonName: string,
    columnKey: string,
    values: Record<string, string | number | boolean | null | { skill: string; level: number }[] | string[]>,
  ): Promise<CustomColumnDefinition> {
    const storePath = await this.resolveTaskJsonStorePath();
    const customDir = path.join(storePath, 'custom-data', taskJsonName);
    const filePath = path.join(customDir, `${columnKey}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    const column = JSON.parse(content) as CustomColumnDefinition;
    column.values = values;
    await fs.writeFile(filePath, JSON.stringify(column, null, 2));
    return column;
  }

  public async updateTaskSkills(
    taskJsonName: string,
    structId: number,
    skills: { skill: string; level: number }[],
  ): Promise<void> {
    const storePath = await this.resolveTaskJsonStorePath();
    const tasksPath = path.join(storePath, 'tasks', `${taskJsonName}.min.json`);
    const raw = await fs.readFile(tasksPath, 'utf-8');
    const tasks = JSON.parse(raw);
    const task = tasks.find((t) => Number(t.structId) === Number(structId));
    if (!task) {
      throw new Error(`Task not found for structId ${structId}`);
    }
    if (skills.length === 0) {
      delete task.skills;
    } else {
      task.skills = skills;
    }
    await fs.writeFile(tasksPath, JSON.stringify(tasks));
  }

  public async getWikiSummary(taskName: string): Promise<string | null> {
    if (!taskName) {
      return null;
    }
    const url = 'https://oldschool.runescape.wiki/api.php';
    const response = await axios.get(url, {
      params: {
        action: 'query',
        prop: 'extracts',
        exintro: 1,
        explaintext: 1,
        redirects: 1,
        format: 'json',
        titles: taskName,
      },
    });
    const pages = response.data?.query?.pages;
    if (!pages) {
      return null;
    }
    const firstPage = Object.values(pages)[0] as any;
    const extract = firstPage?.extract;
    return extract ? String(extract).trim() : null;
  }

  public async getQuests(): Promise<{ quests: any[] }> {
    return this.questRequirements.getQuests();
  }

  public async getQuestRequirementRollup(
    questId: number,
  ): Promise<{ skills: Record<string, number>; quests: number[] }> {
    return this.questRequirements.getQuestRequirementRollup(questId);
  }

  private getWizardStatePath(taskJsonName: string, columnKey: string): string {
    const safeTask = taskJsonName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeCol = columnKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(os.tmpdir(), `osrs-reldo-skill-wizard-${safeTask}-${safeCol}.json`);
  }

  public async getWizardState(taskJsonName: string, columnKey: string): Promise<{ index: number } | null> {
    const filePath = this.getWizardStatePath(taskJsonName, columnKey);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      if (typeof parsed.index === 'number') {
        return { index: parsed.index };
      }
      return null;
    } catch {
      return null;
    }
  }

  public async saveWizardState(taskJsonName: string, columnKey: string, index: number): Promise<void> {
    const filePath = this.getWizardStatePath(taskJsonName, columnKey);
    await fs.writeFile(filePath, JSON.stringify({ index }), 'utf-8');
  }
}
