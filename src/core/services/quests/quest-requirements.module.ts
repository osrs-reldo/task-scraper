import { Module } from '@nestjs/common';
import { DBRowServiceModule } from '../dbrow/dbrow-service.module';
import { QuestRequirementsService } from './quest-requirements.service';

@Module({
  imports: [DBRowServiceModule],
  providers: [QuestRequirementsService],
  exports: [QuestRequirementsService],
})
export class QuestRequirementsModule {}
