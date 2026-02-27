import { Module } from '@nestjs/common';
import { DBRowServiceModule } from '../../../core/services/dbrow/dbrow-service.module';
import { DBRowCommand } from './dbrow-command';

@Module({
  imports: [DBRowServiceModule],
  providers: [DBRowCommand],
})
export class DBRowCommandModule {}
