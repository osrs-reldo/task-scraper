import { Module } from '@nestjs/common';
import { QuestScraperModule } from '../../../core/services/quests/quest-scraper.module';
import { QuestCommand } from './quest-command';

@Module({
  imports: [QuestScraperModule],
  providers: [QuestCommand],
  exports: [QuestCommand],
})
export class QuestCommandModule {}
