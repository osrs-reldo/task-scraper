import { Command } from 'commander';
import { getCommandInstance } from '../..';
import { ArgumentValidator } from '../../../core/argument-validator';
import { RootCommand } from '../../root-command';
import { StructCommand } from './struct-command';
import { StructCommandModule } from './struct-command.module';

export function addStructCommand(commandName: string, program: RootCommand): void {
  const list = new Command('list')
    .description('list all structs with their IDs and param counts')
    .action(async (_options: any) => {
      const command: StructCommand = await getCommandInstance(StructCommand, StructCommandModule);
      await command.handleList();
    });

  const get = new Command('get')
    .argument('<id>', 'struct id', ArgumentValidator.isNumber)
    .action(async (id: number, _options: any) => {
      const command: StructCommand = await getCommandInstance(StructCommand, StructCommandModule);
      await command.handleGet(id);
    });

  const find = new Command('find')
    .argument('<search-string>', 'string to search for in all structs')
    .action(async (searchString: string, _options: any) => {
      const command: StructCommand = await getCommandInstance(StructCommand, StructCommandModule);
      await command.handleFind(searchString);
    });

  const findByParam = new Command('find-by-param')
    .argument('<param-key>', 'parameter key to check value', ArgumentValidator.isNumberOrString)
    .argument('[param-value]', 'parameter value to check', ArgumentValidator.isNumberOrString)
    .action(async (paramKey: number | string, paramValue: number | string) => {
      const command: StructCommand = await getCommandInstance(StructCommand, StructCommandModule);
      await command.handleFindByParam(paramKey, paramValue);
    });

  program
    .command(commandName)
    .description('data operations related to structs')
    .addCommand(list)
    .addCommand(get)
    .addCommand(find)
    .addCommand(findByParam);
}

