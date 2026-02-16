import { Module } from '@nestjs/common';
import { CacheProviderModule } from '../../cache-provider.module';
import { DBRowService } from './dbrow.service';

@Module({
  imports: [CacheProviderModule],
  providers: [DBRowService],
  exports: [DBRowService],
})
export class DBRowServiceModule {}
