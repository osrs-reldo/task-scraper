import { Module } from '@nestjs/common';
import { CacheProviderModule } from '../../cache-provider.module';
import { DBTableService } from './dbtable.service';

@Module({
  imports: [CacheProviderModule],
  providers: [DBTableService],
  exports: [DBTableService],
})
export class DBTableServiceModule {}
