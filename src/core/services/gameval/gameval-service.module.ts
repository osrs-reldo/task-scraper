import { Module } from '@nestjs/common';
import { CacheProviderModule } from '../../cache-provider.module';
import { GameValService } from './gameval.service';

@Module({
  imports: [CacheProviderModule],
  providers: [GameValService],
  exports: [GameValService],
})
export class GameValServiceModule {}
