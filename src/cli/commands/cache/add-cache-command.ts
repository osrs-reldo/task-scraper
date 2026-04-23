import { Command } from 'commander';
import { getCommandInstance } from '../..';
import { RootCommand } from '../../root-command';
import { CacheCommand } from './cache-command';
import { CacheCommandModule } from './cache-command.module';

export function addCacheCommand(commandName: string, program: RootCommand): void {
  const update = new Command('update')
    .action(async () => {
      const globalOptions = program.opts();
      const command: CacheCommand = await getCommandInstance(CacheCommand, CacheCommandModule);
      await command.handleUpdate(globalOptions.commit);
    });

  const status = new Command('status')
    .action(async () => {
      const command: CacheCommand = await getCommandInstance(CacheCommand, CacheCommandModule);
      await command.handleStatus();
    });

  const list = new Command('list')
    .option('-n, --per-page <n>', 'number of commits to show', '30')
    .action(async (options: { perPage: string }) => {
      const command: CacheCommand = await getCommandInstance(CacheCommand, CacheCommandModule);
      await command.handleList(parseInt(options.perPage, 10));
    });

  program.command(commandName)
    .description('operations related to the osrs cache')
    .addCommand(update)
    .addCommand(status)
    .addCommand(list);
}

