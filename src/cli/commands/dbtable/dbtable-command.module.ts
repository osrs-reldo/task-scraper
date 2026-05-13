import { Module } from '@nestjs/common';
import { DBTableServiceModule } from '../../../core/services/dbtable/dbtable-service.module';
import { DBTableCommand } from './dbtable-command';

@Module({
  imports: [DBTableServiceModule],
  providers: [DBTableCommand],
})
export class DBTableCommandModule {}
