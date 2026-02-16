import { DBRow } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { DBRowService } from '../dbrow/dbrow.service';

export interface QuestRequirements {
  skills: Record<string, number>;
  quests: number[];
}

export interface QuestDefinition {
  id: number;
  name: string;
  requirements: QuestRequirements;
}

export interface QuestRequirementDetails {
  tableId: number;
  questId: number;
  displayName: string | null;
  members: boolean | null;
  requirements: {
    quests: number[];
    questPoints: number | null;
    combatLevel: number | null;
    stats: Array<{ stat: number; level: number }>;
    checkSkillsOnStart: boolean | null;
    boostable: boolean | null;
  };
  recommended: {
    combatLevel: number | null;
    stats: Array<{ stat: number; level: number }>;
  };
  sources: {
    columns: {
      displayName: number;
      members: number;
      requirementStats: number;
      recommendedStats: number;
      requirementQuests: number;
      requirementQuestPoints: number;
      requirementCombat: number;
      recommendedCombat: number;
      checkSkillsOnStart: number;
      requirementsBoostable: number;
    };
    extraRequirementScripts: number[];
  };
}

@Injectable()
export class QuestRequirementsService {
  private questListCache: QuestDefinition[] | null = null;
  private questMapCache: Map<number, QuestDefinition> | null = null;
  private statNameCache: Map<number, string> | null = null;

  constructor(private readonly dbrowService: DBRowService) {}

  public async getQuests(): Promise<{ quests: QuestDefinition[] }> {
    const quests = await this.ensureQuestList();
    return { quests };
  }

  public async getQuestList(): Promise<QuestDefinition[]> {
    return this.ensureQuestList();
  }

  public async getQuestRequirementRollup(
    questId: number,
  ): Promise<{ skills: Record<string, number>; quests: number[] }> {
    const questMap = await this.ensureQuestMap();
    const visited = new Set<number>();
    const collectedQuests = new Set<number>();
    const skills: Record<string, number> = {};

    const mergeSkills = (source: Record<string, number> = {}) => {
      Object.entries(source).forEach(([skill, level]) => {
        const numericLevel = Number(level);
        if (Number.isNaN(numericLevel)) {
          return;
        }
        skills[skill] = Math.max(skills[skill] || 0, numericLevel);
      });
    };

    const walk = (currentId: number) => {
      if (visited.has(currentId)) {
        return;
      }
      visited.add(currentId);
      const quest = questMap.get(currentId);
      if (!quest) {
        return;
      }
      const reqs = quest.requirements || { skills: {}, quests: [] };
      mergeSkills(reqs.skills || {});
      const prereqs: number[] = Array.isArray(reqs.quests) ? reqs.quests : [];
      prereqs.forEach((childId) => {
        const numericId = Number(childId);
        if (Number.isNaN(numericId)) {
          return;
        }
        collectedQuests.add(numericId);
        walk(numericId);
      });
    };

    walk(Number(questId));

    return {
      skills,
      quests: Array.from(collectedQuests.values()).sort((a, b) => a - b),
    };
  }

  public async getQuestRequirementDetails(questId: number): Promise<QuestRequirementDetails | null> {
    const tableId = 0;
    const dbrow = await this.dbrowService.getDBRowByTable(tableId, questId);
    if (!dbrow) {
      return null;
    }

    const requirementStats = this.getStatTuples(dbrow, 23);
    const recommendedStats = this.getStatTuples(dbrow, 24);
    const requirementQuests = this.getColumnValues(dbrow, 25)
      .map((value) => this.normalizeNumber(value))
      .filter((value): value is number => value !== null);

    return {
      tableId,
      questId,
      displayName: this.getColumnString(dbrow, 2),
      members: this.getColumnBoolean(dbrow, 5),
      requirements: {
        quests: requirementQuests,
        questPoints: this.getColumnNumber(dbrow, 26),
        combatLevel: this.getColumnNumber(dbrow, 27),
        stats: requirementStats,
        checkSkillsOnStart: this.getColumnBoolean(dbrow, 29),
        boostable: this.getColumnBoolean(dbrow, 30),
      },
      recommended: {
        combatLevel: this.getColumnNumber(dbrow, 28),
        stats: recommendedStats,
      },
      sources: {
        columns: {
          displayName: 2,
          members: 5,
          requirementStats: 23,
          recommendedStats: 24,
          requirementQuests: 25,
          requirementQuestPoints: 26,
          requirementCombat: 27,
          recommendedCombat: 28,
          checkSkillsOnStart: 29,
          requirementsBoostable: 30,
        },
        extraRequirementScripts: [6837, 6838, 4875],
      },
    };
  }

  private async ensureQuestList(): Promise<QuestDefinition[]> {
    if (this.questListCache) {
      return this.questListCache;
    }

    const statNames = this.loadStatNames();
    const rows = await this.dbrowService.getDBRowsByTable(0);
    this.questListCache = rows
      .map((row) => {
        const id = Number(row.id);
        const displayName = this.getColumnString(row, 2);
        const name = displayName && displayName.trim().length > 0
          ? displayName
          : `Quest ${id}`;
        return {
          id,
          name,
          requirements: this.buildQuestRequirements(row, statNames),
        };
      })
      .filter((quest) => !Number.isNaN(quest.id))
      .sort((a, b) => a.id - b.id);

    return this.questListCache;
  }

  private async ensureQuestMap(): Promise<Map<number, QuestDefinition>> {
    if (!this.questMapCache) {
      const list = await this.ensureQuestList();
      this.questMapCache = new Map<number, QuestDefinition>();
      list.forEach((quest) => this.questMapCache?.set(quest.id, quest));
    }
    return this.questMapCache;
  }

  private loadStatNames(): Map<number, string> {
    if (this.statNameCache) {
      return this.statNameCache;
    }
    const map = new Map<number, string>();
    const statPath = path.resolve(process.cwd(), '../osrs-dumps/symbols/stat.sym');
    try {
      const raw = readFileSync(statPath, 'utf-8');
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .forEach((line) => {
          const [idRaw, nameRaw] = line.split(/\s+/, 2);
          const id = Number(idRaw);
          if (!Number.isNaN(id) && nameRaw) {
            map.set(id, nameRaw.toUpperCase());
          }
        });
    } catch (error) {
      console.warn('Unable to load stat symbols', { statPath, error });
    }
    this.statNameCache = map;
    return this.statNameCache;
  }

  private buildQuestRequirements(
    dbrow: DBRow,
    statNames: Map<number, string>,
  ): { skills: Record<string, number>; quests: number[] } {
    const skills: Record<string, number> = {};
    this.getStatTuples(dbrow, 23).forEach(({ stat, level }) => {
      const name = statNames.get(stat) ?? `STAT_${stat}`;
      const normalized = name.toUpperCase();
      skills[normalized] = Math.max(skills[normalized] || 0, level);
    });

    const quests = this.getColumnValues(dbrow, 25)
      .map((value) => this.normalizeNumber(value))
      .filter((value): value is number => value !== null);

    return {
      skills,
      quests,
    };
  }

  private getStatTuples(dbrow: DBRow, columnIndex: number): Array<{ stat: number; level: number }> {
    return this.getColumnTuples(dbrow, columnIndex)
      .map((tuple) => {
        const stat = this.normalizeNumber(tuple[0]);
        const level = this.normalizeNumber(tuple[1]);
        if (stat === null || level === null) {
          return null;
        }
        return { stat, level };
      })
      .filter((entry): entry is { stat: number; level: number } => entry !== null);
  }

  private normalizeNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'bigint') {
      return Number(value);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private getColumnValues(
    dbrow: DBRow,
    columnIndex: number,
  ): Array<string | number | bigint | undefined> {
    if (!dbrow.values || !Array.isArray(dbrow.values)) {
      return [];
    }
    const column = dbrow.values[columnIndex];
    return Array.isArray(column) ? column : [];
  }

  private getColumnTuples(
    dbrow: DBRow,
    columnIndex: number,
  ): Array<Array<string | number | bigint | undefined>> {
    const values = this.getColumnValues(dbrow, columnIndex);
    const types = dbrow.types?.[columnIndex];
    const tupleSize = Array.isArray(types) && types.length > 0 ? types.length : 1;
    if (values.length === 0) {
      return [];
    }
    if (tupleSize <= 1) {
      return values.map((value) => [value]);
    }
    const tuples: Array<Array<string | number | bigint | undefined>> = [];
    for (let i = 0; i < values.length; i += tupleSize) {
      tuples.push(values.slice(i, i + tupleSize));
    }
    return tuples;
  }

  private getColumnString(dbrow: DBRow, columnIndex: number): string | null {
    const values = this.getColumnValues(dbrow, columnIndex);
    const value = values.find((entry) => typeof entry === 'string');
    return typeof value === 'string' ? value : null;
  }

  private getColumnNumber(dbrow: DBRow, columnIndex: number): number | null {
    const values = this.getColumnValues(dbrow, columnIndex);
    for (const value of values) {
      const parsed = this.normalizeNumber(value);
      if (parsed !== null) {
        return parsed;
      }
    }
    return null;
  }

  private getColumnBoolean(dbrow: DBRow, columnIndex: number): boolean | null {
    const numeric = this.getColumnNumber(dbrow, columnIndex);
    return numeric === null ? null : numeric !== 0;
  }
}
