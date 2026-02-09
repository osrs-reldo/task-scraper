import { Injectable } from '@nestjs/common';
import { writeFileSync } from 'fs';
import * as path from 'path';
import { QuestScraperService } from '../../../core/services/quests/quest-scraper.service';

@Injectable()
export class QuestCommand {
  constructor(private questScraper: QuestScraperService) {}

  public async handleQuestScrape(): Promise<void> {
    console.log('Scraping quest list and requirements from OSRS wiki...');
    const quests = await this.questScraper.scrapeAllQuests();
    const output = {
      source: 'https://oldschool.runescape.wiki/w/Quests/List',
      updatedAt: new Date().toISOString(),
      quests,
    };

    const outputPath = path.resolve(process.cwd(), '../task-json-store/quests.json');
    writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`Saved ${quests.length} quests to ${outputPath}`);
  }

  public async handleQuestListIds(): Promise<void> {
    const quests = await this.questScraper.listQuestIds();
    quests.forEach((quest) => {
      console.log(`${quest.id}\t${quest.name}`);
    });
  }

  public async handleQuestRollup(questId: number): Promise<void> {
    const result = await this.questScraper.getQuestRequirementRollup(questId);
    console.log(JSON.stringify(result, null, 2));
  }
}
