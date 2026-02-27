import { Module } from '@nestjs/common';
import { QuestRequirementsModule } from '../quests/quest-requirements.module';
import { CombatSkillRequirementsService } from './combat-skill-requirements.service';

@Module({
  imports: [QuestRequirementsModule],
  providers: [CombatSkillRequirementsService],
  exports: [CombatSkillRequirementsService],
})
export class CombatSkillRequirementsModule {}
