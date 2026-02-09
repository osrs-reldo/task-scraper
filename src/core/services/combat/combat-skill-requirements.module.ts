import { Module } from '@nestjs/common';
import { QuestScraperModule } from '../quests/quest-scraper.module';
import { CombatSkillRequirementsService } from './combat-skill-requirements.service';

@Module({
  imports: [QuestScraperModule],
  providers: [CombatSkillRequirementsService],
  exports: [CombatSkillRequirementsService],
})
export class CombatSkillRequirementsModule {}
