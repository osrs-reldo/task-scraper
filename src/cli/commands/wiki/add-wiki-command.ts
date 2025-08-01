import { Command } from 'commander';
import { getCommandInstance } from '../..';
import { RootCommand } from '../../root-command';
import { WikiCommand } from './wiki-command';
import { WikiCommandModule } from './wiki-command.module';
export function addWikiCommand(commandName: string, program: RootCommand): void {
  const scrape = new Command('scrape') //
    .option('--json', 'output to json file', false) //
    .action(async (options: any) => {
      const command: WikiCommand = await getCommandInstance(WikiCommand, WikiCommandModule);
      await command.handleWikiTaskTypeExtract(options);
    });

  const append = new Command('append') //
    .argument('<taskJsonFile>', 'path to existing task dump JSON file')
    .option('--json', 'output to json file', false) //
    .action(async (taskJsonFile: string, options: any) => {
      const command: WikiCommand = await getCommandInstance(WikiCommand, WikiCommandModule);
      await command.handleWikiAppend(taskJsonFile, options);
    });

  const appendCombat = new Command('append-combat') //
    .option('--json', 'output to json file', false) //
    .action(async (options: any) => {
      const command: WikiCommand = await getCommandInstance(WikiCommand, WikiCommandModule);
      await command.handleWikiAppendCombat(options);
    });

  program
    .command(commandName) //
    .description('data operations related to wiki') //
    .addCommand(scrape)
    .addCommand(append)
    .addCommand(appendCombat);
}
