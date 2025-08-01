import { CacheService } from '../core/services/cache/cache.service';
import { addCacheCommand } from './commands/cache/add-cache-command';
import { CacheCommand } from './commands/cache/cache-command';
import { addEnumCommand } from './commands/enum/add-enum-command';
import { addStructCommand } from './commands/struct/add-struct-command';
import { addTasksCommand } from './commands/tasks/add-tasks-command';
import { addWikiCommand } from './commands/wiki/add-wiki-command';
import { CustomNestFactory } from './custom-nest-factory';
import { RootCommand } from './root-command';

export async function getCommandInstance<TModule>(command: any, module: TModule): Promise<any> {
  const app = await CustomNestFactory.createApplicationContext(module);

  const cacheService = app.get(CacheService);
  const rootOptions = program.opts();
  
  // Only update cache for non-cache commands (to avoid recursion)
  if (command === CacheCommand) {
    console.info('Running cache command, skipping cache update.');
    return app.get(command);
  }
  
  const targetCommit = rootOptions.commit ?? await cacheService.getLatestCommitHash();
  const currentLocalCommit = cacheService.getLocalCommitHash();
  console.info(`Current local cache commit: ${currentLocalCommit}`);
  console.info(`Target commit for cache update: ${targetCommit}`);

  if (currentLocalCommit === targetCommit) {
    console.info('Cache is already up to date with the specified commit.');
    return app.get(command);
  }

  const isValidCommit = await cacheService.validateCommitHash(targetCommit);
  if (!isValidCommit) {
    console.error(`Invalid commit hash: ${targetCommit}. Commit not found in repository.`);
    process.exit(1);
  }
  console.log(`Updating cache to commit ${targetCommit}...`);
  await cacheService.updateCache(targetCommit);
  console.log('Cache update complete. Continuing with command...');

  return app.get(command);
}

const version = '0.0.1';

const program = new RootCommand()
  .name('task-scraper') //
  .description('CLI to perform task-scraper actions') //
  .version(version);

addStructCommand('struct', program);
addTasksCommand('tasks', program);
addEnumCommand('enum', program);
addCacheCommand('cache', program);
addWikiCommand('wiki', program);

(async () => {
  try {
    await program.parseAsync(process.argv);
  } catch (e) {
    console.error(e);
  }
})();

