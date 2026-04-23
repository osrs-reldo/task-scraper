import { Module } from '@nestjs/common';
import { DBRowServiceModule } from '../../../core/services/dbrow/dbrow-service.module';
import { EnumServiceModule } from '../../../core/services/enum/enum-service.module';
import { StructServiceModule } from '../../../core/services/struct/struct-service.module';
import { WikiServiceModule } from '../../../core/services/wiki/wiki-service.module';
import { ScriptServiceModule } from '../../../core/services/script/script-service.module';
import { InteractiveDbRowTaskService } from './interactive-dbrow-task.service';
import { InteractiveTaskService } from './interactive-task.service';
import { TasksCommand } from './tasks-command';

@Module({
  imports: [StructServiceModule, EnumServiceModule, WikiServiceModule, ScriptServiceModule, DBRowServiceModule],
  providers: [TasksCommand, InteractiveTaskService, InteractiveDbRowTaskService],
})
export class TasksCommandModule {}

