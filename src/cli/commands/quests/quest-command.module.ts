import { Module } from '@nestjs/common';
import { QuestRequirementsModule } from '../../../core/services/quests/quest-requirements.module';
import { QuestCommand } from './quest-command';

@Module({
  imports: [QuestRequirementsModule],
  providers: [QuestCommand],
  exports: [QuestCommand],
})
export class QuestCommandModule {}
