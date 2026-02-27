import { Module } from '@nestjs/common';
import { DBRowServiceModule } from '../dbrow/dbrow-service.module';
import { EnumServiceModule } from '../enum/enum-service.module';
import { QuestRequirementsService } from './quest-requirements.service';

@Module({
  imports: [DBRowServiceModule, EnumServiceModule],
  providers: [QuestRequirementsService],
  exports: [QuestRequirementsService],
})
export class QuestRequirementsModule {}
