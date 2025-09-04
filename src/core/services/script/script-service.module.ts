import { Module } from '@nestjs/common';
import { CacheProviderModule } from '../../cache-provider.module';
import { ScriptService } from './script.service';

@Module({
  imports: [CacheProviderModule],
  providers: [ScriptService],
  exports: [ScriptService],
})
export class ScriptServiceModule {}
