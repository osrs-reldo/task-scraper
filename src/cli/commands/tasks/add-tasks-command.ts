import { ParamID } from '@abextm/cache2';
import { Command } from 'commander';
import { getCommandInstance } from '../..';
import { ArgumentValidator } from '../../../core/argument-validator';
import { RootCommand } from '../../root-command';
import { TasksCommand } from './tasks-command';
import { TasksCommandModule } from './tasks-command.module';
import { combatCommand } from './add-combat-command';

export function addTasksCommand(commandName: string, program: RootCommand): void {
  const updateVarps = new Command('update-varps')
    .description('Update task-type with fresh varp extraction from script analysis')
    .option('--type <taskType>', 'Task type name (e.g., COMBAT, DIARY, LEAGUE)')
    .option('--json', 'output to json file', false)
    .action(async (options: any) => {
      const command: TasksCommand = await getCommandInstance(TasksCommand, TasksCommandModule);
      await command.handleUpdateVarps(options);
    });

  const extract = new Command('extract')
    .description('extracts tasks using an interactive prompt, used to find data sources for tasks & task types')
    .option('--task-name <taskName>', 'override prompt for the task name')
    .option('--id-param <idParam>', 'override prompt for the id', ArgumentValidator.isNumber)
    .option('--name-param <nameParam>', 'override prompt for the name', ArgumentValidator.isNumber)
    .option('--description-param <descriptionParam>', 'override prompt for the description', ArgumentValidator.isNumber)
    .option('--tier-param <tierParam>', 'override prompt for the tier', ArgumentValidator.isNumber)
    .option('--addl-params', 'override prompt for additional params')
    .option('--json', 'output to json file')
    .action(async (options: any) => {
      const command: TasksCommand = await getCommandInstance(TasksCommand, TasksCommandModule);
      await command.handleTaskExtract(options);
    });

  const generate = new Command('generate')
    .description('Non-interactively generate raw task list from a DBROW task-type; writes to ./out/. Requires the task type to already exist in task-types.json with taskSourceType=DBROW and dbRowEnumId set.')
    .option('--type <taskType>', 'Task type name (e.g., LEAGUE_6)', 'LEAGUE_6')
    .option('--enum-id <enumId>', 'Override the source enum ID from the task-type definition')
    .option('--json', 'Accepted for pipeline compatibility (output is always written to ./out/)')
    .action(async (options: any) => {
      const command: TasksCommand = await getCommandInstance(TasksCommand, TasksCommandModule);
      await command.handleGenerate(options);
    });

  const generateFrontendTasks = new Command('generate-frontend-tasks')
    .description('Generates a hydrated list of tasks in the form the frontend requires')
    .argument('<task-type-name>', 'extensionless filename for the .json that holds task data in task-json-store')
    .argument('<name-param-id>', "the task structs' string name param id", ArgumentValidator.isNumber)
    .argument('<description-param-id>', "the task structs' string description param id", ArgumentValidator.isNumber)
    .action(async (jsonFilename: string, nameParamId: ParamID, descriptionParamId: ParamID) => {
      const command: TasksCommand = await getCommandInstance(TasksCommand, TasksCommandModule);
      await command.handleGenerateFrontendTasks(jsonFilename, nameParamId, descriptionParamId);
    });
  const extractDbRow = new Command('extract-dbrow')
    .description('extracts tasks from dbrows using an interactive prompt, sourced from a given enum')
    .option('--enum-id <enumId>', 'the enum id containing dbrow ids')
    .option('--json', 'output to json file')
    .action(async (options: any) => {
      const command: TasksCommand = await getCommandInstance(TasksCommand, TasksCommandModule);
      await command.handleDbRowTaskExtract(options);
    });

  const joinLocation = new Command('join-location')
    .description('Joins location data from a .locations.json onto a .min.json that lacks it')
    .option('--type <taskType>', 'Task type name (e.g., LEAGUE_6)', 'LEAGUE_6')
    .option('--input <path>', 'input tasks file (defaults to task-json-store/tasks/{type}.min.json)')
    .option('--locations <path>', 'locations file (defaults to ./out/{type}-locations.json)')
    .option('--json', 'output to json file in ./out/', false)
    .action(async (options: any) => {
      const command: TasksCommand = await getCommandInstance(TasksCommand, TasksCommandModule);
      await command.handleJoinLocation(options);
    });

  const updateWiki = new Command('update-wiki')
    .description('Update completion percent and wiki notes for a task type from the wiki, using the local task-json-store')
    .option('--type <taskType>', 'Task type name (e.g., COMBAT, LEAGUE_6)')
    .option('--input <path>', 'input tasks file (defaults to task-json-store/tasks/{type}.min.json)')
    .option('--wiki-url <url>', 'Wiki URL containing the tasks table')
    .option('--task-id-attribute <attr>', 'The tr attribute that identifies the task id (e.g., data-taskid)', 'data-taskid')
    .option('--completion-column <n>', '0-indexed column index for completion percent')
    .option('--requirements-column <n>', '0-indexed column index for requirements/notes')
    .option('--percent-only', 'only update completionPercent; leave skills and wikiNotes unchanged', false)
    .option('--json', 'output to json file in ./out/', false)
    .action(async (options: any) => {
      const command: TasksCommand = await getCommandInstance(TasksCommand, TasksCommandModule);
      await command.handleUpdateWikiData(options);
    });

  const mapBossKc = new Command('map-boss-kc')
    .description('Derive boss KC VARP mappings from cache and write boss-kc-map.json to ./out/')
    .option('--type <taskType>', 'Task type name (e.g., LEAGUE_6)', 'LEAGUE_6')
    .option('--method <method>', 'Boss KC varp source: ca, clog, or gameval', 'ca')
    .action(async (options: any) => {
      const command: TasksCommand = await getCommandInstance(TasksCommand, TasksCommandModule);
      await command.handleMapBossKc(options);
    });

  const applyBossKc = new Command('apply-boss-kc')
    .description('Apply a boss-kc-map.json from ./out/ onto a tasks min.json')
    .option('--type <taskType>', 'Task type name (e.g., LEAGUE_6)', 'LEAGUE_6')
    .option('--input <path>', 'input tasks file (defaults to task-json-store/tasks/{type}.min.json)')
    .option('--json', 'output to ./out/ instead of stdout', false)
    .action(async (options: any) => {
      const command: TasksCommand = await getCommandInstance(TasksCommand, TasksCommandModule);
      await command.handleApplyBossKc(options);
    });

  const mapVarbitProgress = new Command('map-varbit-progress')
    .description('Interactively map league varbits to tasks; writes varbit-map.json to ./out/')
    .option('--type <taskType>', 'Task type name (e.g., LEAGUE_6)', 'LEAGUE_6')
    .option('--review', 'also write a review list text file to ./out/', false)
    .action(async (options: any) => {
      const command: TasksCommand = await getCommandInstance(TasksCommand, TasksCommandModule);
      await command.handleMapLeagueVarbitProgress(options);
    });

  const applyVarbitProgress = new Command('apply-varbit-progress')
    .description('Apply a varbit-map.json from ./out/ onto a tasks min.json')
    .option('--type <taskType>', 'Task type name (e.g., LEAGUE_6)', 'LEAGUE_6')
    .option('--input <path>', 'input tasks file (defaults to task-json-store/tasks/{type}.min.json)')
    .option('--map <path>', 'varbit-map.json to apply (defaults to ./out/{type}-varbit-map.json)')
    .option('--json', 'output to ./out/ instead of stdout', false)
    .action(async (options: any) => {
      const command: TasksCommand = await getCommandInstance(TasksCommand, TasksCommandModule);
      await command.handleApplyLeagueVarbitProgress(options);
    });

  program
    .command(commandName)
    .description('data operations related to tasks')
    .addCommand(generate)
    .addCommand(updateVarps)
    .addCommand(updateWiki)
    .addCommand(joinLocation)
    .addCommand(combatCommand)
    .addCommand(extract)
    .addCommand(extractDbRow)
    .addCommand(generateFrontendTasks)
    .addCommand(mapBossKc)
    .addCommand(applyBossKc)
    .addCommand(mapVarbitProgress)
    .addCommand(applyVarbitProgress);
}
