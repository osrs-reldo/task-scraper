import { Module } from '@nestjs/common';
import { ScriptServiceModule } from '../../../core/services/script/script-service.module';
import { ScriptCommand } from './script-command';

@Module({
  imports: [ScriptServiceModule],
  providers: [ScriptCommand],
  exports: [ScriptCommand],
})
export class ScriptCommandModule {}
