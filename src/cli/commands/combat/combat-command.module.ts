import { Module } from '@nestjs/common';
import { CombatSkillRequirementsModule } from '../../../core/services/combat/combat-skill-requirements.module';
import { EnumServiceModule } from '../../../core/services/enum/enum-service.module';
import { StructServiceModule } from '../../../core/services/struct/struct-service.module';
import { WikiServiceModule } from '../../../core/services/wiki/wiki-service.module';
import { CombatCommand } from './combat-command';

@Module({
  imports: [StructServiceModule, EnumServiceModule, WikiServiceModule, CombatSkillRequirementsModule],
  providers: [CombatCommand],
})
export class CombatCommandModule {}
