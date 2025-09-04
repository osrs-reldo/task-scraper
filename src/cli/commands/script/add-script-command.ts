import { Command } from 'commander';
import { getCommandInstance } from '../..';
import { RootCommand } from '../../root-command';
import { ScriptCommandModule } from './script-command.module';
import { ScriptCommand } from './script-command';

export function addScriptCommand(commandName: string, program: RootCommand): void {
  const scriptCmd = program
    .command(commandName)
    .description('Commands for working with OSRS scripts (ClientScript/rs2asm)');

  // List scripts command
  const list = new Command('list')
    .description('List available scripts')
    .option('--named', 'Show only named scripts')
    .option('--stats', 'Show script statistics instead of list')
    .option('--limit <number>', 'Limit number of scripts shown', (val) => parseInt(val), 20)
    .action(async (options) => {
      try {
        const scriptCommand: ScriptCommand = await getCommandInstance(ScriptCommand, ScriptCommandModule);
        await scriptCommand.handleList(options);
      } catch (error) {
        console.error('Error executing script list command:', error);
        process.exit(1);
      }
    });

  // Show specific script command
  const show = new Command('show')
    .description('Show details of a specific script')
    .argument('<scriptId>', 'Script ID to show')
    .option('--instructions', 'Show script instructions')
    .option('--rs2asm, --asm', 'Show rs2asm assembly output')
    .option('--addresses', 'Include instruction addresses in rs2asm output')
    .option('--raw', 'Show raw data')
    .option('--full', 'Show all details')
    .option('--instruction-limit <number>', 'Limit number of instructions shown', (val) => parseInt(val), 50)
    .action(async (scriptIdStr, options) => {
      try {
        const scriptId = parseInt(scriptIdStr);
        if (isNaN(scriptId)) {
          console.error('❌ Script ID must be a number');
          process.exit(1);
        }

        const scriptCommand: ScriptCommand = await getCommandInstance(ScriptCommand, ScriptCommandModule);
        await scriptCommand.handleShow(scriptId, options);
      } catch (error) {
        console.error('Error executing script show command:', error);
        process.exit(1);
      }
    });

  // Search scripts command
  const search = new Command('search')
    .description('Search scripts by name')
    .argument('<term>', 'Search term')
    .action(async (searchTerm, options) => {
      try {
        const scriptCommand: ScriptCommand = await getCommandInstance(ScriptCommand, ScriptCommandModule);
        await scriptCommand.handleSearch(searchTerm, options);
      } catch (error) {
        console.error('Error executing script search command:', error);
        process.exit(1);
      }
    });

  // List script IDs command
  const ids = new Command('ids')
    .description('List all script IDs')
    .option('--range', 'Show ID range')
    .option('--list', 'Show actual IDs')
    .option('--limit <number>', 'Limit number of IDs shown', (val) => parseInt(val), 100)
    .action(async (options) => {
      try {
        const scriptCommand: ScriptCommand = await getCommandInstance(ScriptCommand, ScriptCommandModule);
        await scriptCommand.handleIds(options);
      } catch (error) {
        console.error('Error executing script ids command:', error);
        process.exit(1);
      }
    });

  // Decompile script command
  const decompile = new Command('decompile')
    .description('Decompile a script to rs2asm assembly format')
    .argument('<scriptId>', 'Script ID to decompile')
    .option('--no-metadata', 'Exclude metadata comments')
    .option('--no-comments', 'Exclude instruction comments')
    .option('--addresses', 'Include instruction addresses')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .action(async (scriptIdStr, options) => {
      try {
        const scriptId = parseInt(scriptIdStr);
        if (isNaN(scriptId)) {
          console.error('❌ Script ID must be a number');
          process.exit(1);
        }

        const scriptCommand: ScriptCommand = await getCommandInstance(ScriptCommand, ScriptCommandModule);
        await scriptCommand.handleDecompile(scriptId, options);
      } catch (error) {
        console.error('Error executing script decompile command:', error);
        process.exit(1);
      }
    });

  scriptCmd.addCommand(list);
  scriptCmd.addCommand(show);
  scriptCmd.addCommand(search);
  scriptCmd.addCommand(ids);
  scriptCmd.addCommand(decompile);
}
