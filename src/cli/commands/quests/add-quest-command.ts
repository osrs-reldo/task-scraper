import { Command } from 'commander';
import { getCommandInstance } from '../..';
import { RootCommand } from '../../root-command';
import { QuestCommand } from './quest-command';
import { QuestCommandModule } from './quest-command.module';

export function addQuestCommand(commandName: string, program: RootCommand): void {
  const list = new Command('list')
    .description('list quests with ids')
    .action(async () => {
      const command: QuestCommand = await getCommandInstance(QuestCommand, QuestCommandModule);
      await command.handleQuestListIds();
    });

  const skills = new Command('skills')
    .description('get full skill requirements by quest id')
    .argument('<questId>', 'quest id to traverse')
    .action(async (questId: string) => {
      const command: QuestCommand = await getCommandInstance(QuestCommand, QuestCommandModule);
      await command.handleQuestRollup(Number(questId));
    });

  const requirements = new Command('requirements')
    .description('dump quest requirements from cache dbrow')
    .argument('<questId>', 'quest id to dump requirements for')
    .action(async (questId: string) => {
      const command: QuestCommand = await getCommandInstance(QuestCommand, QuestCommandModule);
      await command.handleQuestRequirementsDump(Number(questId));
    });

  const requirementsAll = new Command('requirements-all')
    .description('dump all quest requirements')
    .option('--json', 'save output to /out/quests-dbrow.json instead of console')
    .action(async (options: { json?: boolean }) => {
      const command: QuestCommand = await getCommandInstance(QuestCommand, QuestCommandModule);
      await command.handleQuestRequirementsDumpAll(options.json);
    });

  program
    .command(commandName)
    .description('data operations related to quests')
    .addCommand(list)
    .addCommand(skills)
    .addCommand(requirements)
    .addCommand(requirementsAll);
}
