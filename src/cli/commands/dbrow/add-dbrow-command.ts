import { Command } from 'commander';
import { getCommandInstance } from '../..';
import { ArgumentValidator } from '../../../core/argument-validator';
import { RootCommand } from '../../root-command';
import { DBRowCommand } from './dbrow-command';
import { DBRowCommandModule } from './dbrow-command.module';

export function addDBRowCommand(commandName: string, program: RootCommand): void {
  const get = new Command('get')
    .argument('<id>', 'database row id', ArgumentValidator.isNumber)
    .action(async (id: number, _options: any) => {
      const command: DBRowCommand = await getCommandInstance(DBRowCommand, DBRowCommandModule);
      await command.handleGet(id);
    });

  const find = new Command('find')
    .argument('<table-id>', 'database table id', ArgumentValidator.isNumber)
    .argument('<search-string>', 'string to search for in database rows')
    .action(async (tableId: number, searchString: string, _options: any) => {
      const command: DBRowCommand = await getCommandInstance(DBRowCommand, DBRowCommandModule);
      await command.handleFind(tableId, searchString);
    });

  const dumpStrings = new Command('dump-strings')
    .argument('<table-id>', 'database table id', ArgumentValidator.isNumber)
    .argument('<row-id>', 'database row id within the table', ArgumentValidator.isNumber)
    .action(async (tableId: number, rowId: number, _options: any) => {
      const command: DBRowCommand = await getCommandInstance(DBRowCommand, DBRowCommandModule);
      await command.handleDumpStrings(tableId, rowId);
    });

  program
    .command(commandName)
    .description('data operations related to database rows')
    .addCommand(get)
    .addCommand(find)
    .addCommand(dumpStrings);
}
