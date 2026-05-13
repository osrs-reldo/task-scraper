import { Command } from 'commander';
import { getCommandInstance } from '../..';
import { ArgumentValidator } from '../../../core/argument-validator';
import { RootCommand } from '../../root-command';
import { DBTableCommand } from './dbtable-command';
import { DBTableCommandModule } from './dbtable-command.module';

export function addDBTableCommand(commandName: string, program: RootCommand): void {
  const get = new Command('get')
    .argument('<id>', 'database table id', ArgumentValidator.isNumber)
    .action(async (id: number, _options: any) => {
      const command: DBTableCommand = await getCommandInstance(DBTableCommand, DBTableCommandModule);
      await command.handleGet(id);
    });

  program
    .command(commandName)
    .description('data operations related to database tables')
    .addCommand(get);
}
