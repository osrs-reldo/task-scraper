import { Command } from 'commander';
import { getCommandInstance } from '../..';
import { ArgumentValidator } from '../../../core/argument-validator';
import { RootCommand } from '../../root-command';
import { StructCommand } from './struct-command';
import { StructCommandModule } from './struct-command.module';

export function addStructCommand(commandName: string, program: RootCommand): void {
  const get = new Command('get')
    .argument('<id>', 'struct id', ArgumentValidator.isNumber)
    .action(async (id: number, _options: any) => {
      const command: StructCommand = await getCommandInstance(StructCommand, StructCommandModule);
      await command.handleGet(id);
    });

    const getMultiple = new Command('get-multiple')
  .description('Fetch multiple Structs by their IDs or from a file')
  .option('-f, --file <path>', 'Path to a file containing struct IDs') // Define the option first
  .argument('[ids...]', 'List of struct IDs (if not using a file)', (val) => {
    if (!Array.isArray(val)) {
      return [Number(val)];
    }
    return val.map(Number);
  })
  .action(async (ids: number[] | undefined, options: { file?: string }) => {
    console.log('CLI Options:', options); // Debugging
    console.log('CLI Arguments:', ids);   // Debugging

    const command: StructCommand = await getCommandInstance(StructCommand, StructCommandModule);

    let structIds: number[] = [];

    if (options.file) {
      console.log(`Reading Struct IDs from file: ${options.file}`);
      structIds = await command.loadStructIdsFromFile(options.file);
    } else if (ids && ids.length > 0) {
      console.log('Using provided Struct IDs from arguments.');
      structIds = ids.filter(id => !isNaN(id)); // Validate and filter IDs
    }

    if (!structIds.length) {
      console.error('No Struct IDs provided or found.');
      return;
    }

    console.log(`Fetching Structs for IDs: ${structIds.slice(0, 5)}... (${structIds.length} total)`);
    await command.handleGetMultiple(structIds);
  });

  const file = new Command('file') 
    .description('Fetch multiple Structs from a file containing Struct IDs')
    .argument('<filePath>', 'Path to a file containing struct IDs')
    .action(async (filePath: string) => {
      const command: StructCommand = await getCommandInstance(StructCommand, StructCommandModule);

      let structIds: number[] = [];
      try {
        structIds = await command.loadStructIdsFromFile(filePath);
      } catch (error) {
        console.error(`Failed to load Struct IDs from file: ${error.message}`);
        return;
      }

      if (!structIds.length) {
        console.error('No valid Struct IDs found in the file.');
        return;
      }

      console.log(`Fetching Structs for IDs: ${structIds.slice(0, 5)}... (${structIds.length} total)`);
      await command.handleGetMultiple(structIds);
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
    .addCommand(get)
    .addCommand(find)
    .addCommand(findByParam)
    .addCommand(file)
    .addCommand(getMultiple);
}

