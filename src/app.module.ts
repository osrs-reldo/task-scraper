import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EditorController } from './editor/editor.controller';
import { EditorService } from './editor/editor.service';
import { CacheProviderModule } from './core/cache-provider.module';
import { EnumService } from './core/services/enum/enum.service';
import { QuestRequirementsModule } from './core/services/quests/quest-requirements.module';
import { StructService } from './core/services/struct/struct.service';

@Module({
  imports: [CacheProviderModule, QuestRequirementsModule],
  controllers: [AppController, EditorController],
  providers: [AppService, StructService, EnumService, EditorService],
})
export class AppModule {}

