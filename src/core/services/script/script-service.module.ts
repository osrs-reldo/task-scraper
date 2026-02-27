import { Module } from '@nestjs/common';
import { CacheProviderModule } from '../../cache-provider.module';
import { ScriptService } from './script.service';
import { ScriptAnalysisService } from './script-analysis.service';

@Module({
  imports: [CacheProviderModule],
  providers: [ScriptService, ScriptAnalysisService],
  exports: [ScriptService, ScriptAnalysisService],
})
export class ScriptServiceModule {}
