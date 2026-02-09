import { Module } from '@nestjs/common';
import { QuestScraperService } from './quest-scraper.service';

@Module({
  providers: [QuestScraperService],
  exports: [QuestScraperService],
})
export class QuestScraperModule {}
