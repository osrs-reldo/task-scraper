import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { SKILL_NAMES } from '../wiki/skills';
import * as fs from 'fs';
import * as path from 'path';

export interface QuestRequirements {
  skills: Record<string, number>;
  quests: number[];
}

export interface QuestDefinition {
  id: number;
  name: string;
  requirements: QuestRequirements;
}

@Injectable()
export class QuestScraperService {
  private readonly wikiApiUrl = 'https://oldschool.runescape.wiki/api.php';
  private readonly questIdByName: Record<string, number>;
  private readonly questIdByNormalizedName: Record<string, number>;

  public constructor() {
    const mapPath = path.join(__dirname, 'quest-id-map.json');
    const raw = fs.readFileSync(mapPath, 'utf-8');
    const parsed = JSON.parse(raw) as { idByName?: Record<string, number> };
    this.questIdByName = parsed.idByName || {};
    this.questIdByNormalizedName = {};
    Object.entries(this.questIdByName).forEach(([name, questId]) => {
      const normalized = this.normalizeQuestName(name);
      if (!(normalized in this.questIdByNormalizedName)) {
        this.questIdByNormalizedName[normalized] = questId;
      }
    });
  }

  public async scrapeAllQuests(): Promise<QuestDefinition[]> {
    const questNames = await this.scrapeQuestList();
    const quests: QuestDefinition[] = [];
    const unmapped: string[] = [];
    for (const name of questNames) {
      const questId = this.resolveQuestId(name);
      if (questId === undefined) {
        unmapped.push(name);
        continue;
      }
      const requirements = await this.scrapeQuestRequirements(name);
      quests.push({
        id: questId,
        name,
        requirements,
      });
      await this.sleep(300);
    }
    if (unmapped.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`Skipped ${unmapped.length} quests without Quest enum ids.`);
    }
    return quests;
  }

  public async listQuestIds(): Promise<{ id: number; name: string }[]> {
    const quests = await this.readQuestsFile();
    return quests
      .map((quest) => ({
        id: Number(quest?.id),
        name: String(quest?.name || ''),
      }))
      .filter((quest) => !Number.isNaN(quest.id) && quest.name.length > 0)
      .sort((a, b) => a.id - b.id);
  }

  public async getQuestRequirementRollup(
    questId: number,
  ): Promise<{ skills: Record<string, number>; quests: number[] }> {
    const quests = await this.readQuestsFile();
    const questMap = new Map<number, any>();
    quests.forEach((quest) => {
      const id = Number(quest?.id);
      if (!Number.isNaN(id)) {
        questMap.set(id, quest);
      }
    });

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
      const reqs = quest.requirements || {};
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

  private async scrapeQuestList(): Promise<string[]> {
    const questNames: Set<string> = new Set();
    let cmcontinue: string | undefined;

    do {
      const response = await axios.get(this.wikiApiUrl, {
        params: {
          action: 'query',
          list: 'categorymembers',
          cmtitle: 'Category:Quests',
          cmnamespace: 0,
          cmlimit: 500,
          format: 'json',
          cmcontinue,
        },
      });

      const members = response.data?.query?.categorymembers || [];
      members.forEach((member: any) => {
        if (member?.title) {
          questNames.add(member.title.trim());
        }
      });

      cmcontinue = response.data?.continue?.cmcontinue;
    } while (cmcontinue);

    return Array.from(questNames).sort((a, b) => a.localeCompare(b));
  }

  private async scrapeQuestRequirements(name: string): Promise<QuestRequirements> {
    const urlName = encodeURIComponent(name.replace(/\s+/g, '_'));
    const html = await this.fetchQuestHtml(urlName);
    const $ = cheerio.load(html);

    const requirements: QuestRequirements = {
      skills: {},
      quests: [],
    };

    const requirementRow = this.findDetailsRow($, 'Requirements');
    const questRow = this.findDetailsRow($, 'Quests');

    if (questRow) {
      if (requirementRow) {
        this.parseRequirementsCell($, requirementRow, requirements, false);
      }
      this.parseRequirementsCell($, questRow, requirements, true);
    } else if (requirementRow) {
      this.parseRequirementsCell($, requirementRow, requirements, true);
    }

    requirements.quests = Array.from(new Set(requirements.quests));
    return requirements;
  }

  private async fetchQuestHtml(urlName: string): Promise<string> {
    const url = `https://oldschool.runescape.wiki/w/${urlName}?action=render`;
    let attempt = 0;
    while (attempt < 5) {
      attempt += 1;
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'osrs-reldo-quest-scraper/1.0',
          },
        });
        return response.data as string;
      } catch (error: any) {
        const status = error?.response?.status;
        const retryAfter = Number.parseInt(error?.response?.headers?.['retry-after'] || '0', 10);
        if (status === 429) {
          const waitMs = Number.isNaN(retryAfter) || retryAfter <= 0 ? 2000 : retryAfter * 1000;
          await this.sleep(waitMs);
          continue;
        }
        if (attempt >= 5) {
          throw error;
        }
        await this.sleep(1000 * attempt);
      }
    }
    throw new Error(`Failed to fetch ${url}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private findDetailsRow($: cheerio.CheerioAPI, header: string): cheerio.Cheerio<cheerio.Element> | null {
    const row = $('th')
      .filter((_idx, el) => $(el).text().trim().toLowerCase() === header.toLowerCase())
      .first()
      .closest('tr');
    if (!row || row.length === 0) {
      return null;
    }
    return row as cheerio.Cheerio<cheerio.Element>;
  }

  private parseRequirementsCell(
    $: cheerio.CheerioAPI,
    row: cheerio.Cheerio<cheerio.Element>,
    requirements: QuestRequirements,
    includeQuests: boolean,
  ) {
    const cell = row.find('td').first();
    if (!cell || cell.length === 0) {
      return;
    }

    this.extractSkillsFromCell($, cell, requirements);

    const listItems = cell.find('li');
    if (listItems.length > 0) {
      const topLevelItems = cell.find('> ul > li');
      const items = topLevelItems.length > 0 ? topLevelItems : listItems;
      items.each((_idx, li) => {
        const item = $(li);
        this.parseRequirementItem($, item, requirements);
      });
      if (includeQuests) {
        this.extractQuestLinksFromRequirementList($, cell, requirements);
      }
    } else {
      this.parseRequirementText($, cell.text(), cell, requirements);
      if (includeQuests) {
        this.extractQuestLinks($, cell, requirements);
      }
    }
  }

  private parseRequirementItem(
    $: cheerio.CheerioAPI,
    item: cheerio.Cheerio<cheerio.Element>,
    requirements: QuestRequirements,
  ) {
    const text = item.text().trim();
    if (this.isOptional(text, item)) {
      return;
    }
    this.extractSkillsFromCell($, item, requirements);
    this.extractSkillsFromText(text, requirements);
  }

  private parseRequirementText(
    $: cheerio.CheerioAPI,
    text: string,
    cell: cheerio.Cheerio<cheerio.Element>,
    requirements: QuestRequirements,
  ) {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    lines.forEach((line) => {
      if (this.isOptional(line, cell)) {
        return;
      }
      this.extractSkillsFromText(line, requirements);
    });
  }

  private extractQuestLinksDirect(
    $: cheerio.CheerioAPI,
    item: cheerio.Cheerio<cheerio.Element>,
    requirements: QuestRequirements,
  ) {
    const clone = item.clone();
    clone.find('ul').remove();
    this.extractQuestLinks($, clone, requirements);
  }

  private extractQuestLinksFromRequirementList(
    $: cheerio.CheerioAPI,
    cell: cheerio.Cheerio<cheerio.Element>,
    requirements: QuestRequirements,
  ) {
    const questMarkerItems = cell
      .find('li')
      .filter((_idx, el) => $(el).text().toLowerCase().includes('following quests'));

    if (questMarkerItems.length > 0) {
      questMarkerItems.each((_idx, el) => {
        const marker = $(el);
        const firstList = marker.find('ul').first();
        if (!firstList || firstList.length === 0) {
          this.extractQuestLinksDirect($, marker, requirements);
          return;
        }
        firstList
          .find('> li')
          .each((_liIdx, li) => {
            this.extractFirstQuestLink($, $(li), requirements);
          });
      });
      return;
    }

    const topLevelItems = cell.find('> ul > li');
    if (topLevelItems.length > 0) {
      topLevelItems.each((_idx, li) => {
        this.extractQuestLinksDirect($, $(li), requirements);
      });
      return;
    }

    this.extractQuestLinks($, cell, requirements);
  }

  private extractFirstQuestLink(
    $: cheerio.CheerioAPI,
    node: cheerio.Cheerio<cheerio.Element>,
    requirements: QuestRequirements,
  ) {
    const link = node.find('a').first();
    if (!link || link.length === 0) {
      return;
    }
    const title = $(link).attr('title') || $(link).text();
    if (!title) {
      return;
    }
    const questName = title.trim();
    const questId = this.resolveQuestId(questName);
    if (questId === undefined) {
      return;
    }
    requirements.quests.push(questId);
  }

  private extractSkillsFromCell(
    $: cheerio.CheerioAPI,
    node: cheerio.Cheerio<cheerio.Element>,
    requirements: QuestRequirements,
  ) {
    const skillSet = new Set(Array.from(SKILL_NAMES).map((skill) => skill.toLowerCase()));
    node.find('.scp[data-skill][data-level]').each((_idx, el) => {
      const skill = ($(el).attr('data-skill') || '').trim();
      const levelRaw = ($(el).attr('data-level') || '').trim();
      const level = Number.parseInt(levelRaw, 10);
      if (!skill || Number.isNaN(level)) {
        return;
      }
      if (!skillSet.has(skill.toLowerCase())) {
        return;
      }
      const skillKey = skill.toUpperCase();
      requirements.skills[skillKey] = Math.max(requirements.skills[skillKey] || 0, level);
    });
  }

  private extractSkillsFromText(text: string, requirements: QuestRequirements) {
    const skills = Array.from(SKILL_NAMES).map((skill) => skill.toLowerCase());
    const regex = new RegExp(`(\\d{1,3})\\s+(${skills.join('|')})`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const level = Number.parseInt(match[1], 10);
      const skill = match[2].toUpperCase();
      if (!Number.isNaN(level)) {
        requirements.skills[skill] = Math.max(requirements.skills[skill] || 0, level);
      }
    }
  }

  private extractQuestLinks(
    $: cheerio.CheerioAPI,
    node: cheerio.Cheerio<cheerio.Element>,
    requirements: QuestRequirements,
  ) {
    node.find('a').each((_idx, link) => {
      const title = $(link).attr('title') || $(link).text();
      if (!title) {
        return;
      }
      const questName = title.trim();
      const questId = this.resolveQuestId(questName);
      if (questId === undefined) {
        return;
      }
      requirements.quests.push(questId);
    });
  }

  private isOptional(text: string, node: cheerio.Cheerio<cheerio.Element>): boolean {
    if (text.toLowerCase().includes('optional')) {
      return true;
    }
    const optionalEl = node.find('.optional');
    return optionalEl.length > 0;
  }

  private resolveQuestId(name: string): number | undefined {
    if (name in this.questIdByName) {
      return this.questIdByName[name];
    }
    const normalized = this.normalizeQuestName(name);
    return this.questIdByNormalizedName[normalized];
  }

  private normalizeQuestName(name: string): string {
    return name
      .replace(/[’‘]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/\s*\/\s*/g, ' - ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private async resolveTaskJsonStorePath(): Promise<string> {
    const candidates = [
      path.resolve(process.cwd(), 'task-json-store'),
      path.resolve(process.cwd(), '../task-json-store'),
      path.resolve(process.cwd(), '../../task-json-store'),
    ];
    for (const candidate of candidates) {
      try {
        const stat = await fs.promises.stat(candidate);
        if (stat.isDirectory()) {
          return candidate;
        }
      } catch {
        // ignore
      }
    }
    throw new Error('Could not locate task-json-store directory relative to current working directory.');
  }

  private async readQuestsFile(): Promise<any[]> {
    const storePath = await this.resolveTaskJsonStorePath();
    const filePath = path.join(storePath, 'quests.json');
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return parsed.quests || [];
    } catch {
      return [];
    }
  }

}
