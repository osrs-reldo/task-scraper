import { confirm, input, select } from '@inquirer/prompts';
import { readdirSync } from 'fs-extra';
import { ISelectOption } from './select-option.interface';

export class InteractivePrompt {
  public static async select<T>(message: string, choices: ISelectOption<T>[], defaultValue?: T): Promise<T> {
    const answers = await select({
      message,
      choices,
      loop: false,
      default: defaultValue
    });

    return answers;
  }

  public static async confirm(message: string, defaultValue: boolean = true): Promise<boolean> {
    const answers = await confirm({
      message,
      default: defaultValue,
    });

    return answers;
  }

  public static async input(message: string, defaultValue?: string): Promise<string> {
    const result = await input({
      message,
      default: defaultValue,
    });

    return result;
  }

  public static async interactivePromptSelectFile(): Promise<{ fileName: string; timestamp: number; logId: string }> {
    function getTimestampNameAndLogIdFromFilename(fileName: string): {
      timestamp: number;
      name: string;
      logId: string;
    } {
      const [_label, logId, timestampSrc] = fileName.replace('.json', '').split('-');
      const timestamp = Number.parseInt(timestampSrc);
      const date: Date = new Date(timestamp);
      const name = `${logId} ${date.toLocaleString()}`;

      return { timestamp, name, logId };
    }

    function findFilesByPattern(directory: string, pattern: RegExp) {
      const files = readdirSync(directory);
      const matchingFiles = files.filter((file) => file.match(pattern));
      return matchingFiles;
    }

    const filePattern = /omnotron-(\w+)-(\d+)\.json/;
    const reports = findFilesByPattern('./out', filePattern);

    const choices = reports
      .sort((a, b) => {
        const aTimestamp = getTimestampNameAndLogIdFromFilename(a).timestamp;
        const bTimestamp = getTimestampNameAndLogIdFromFilename(b).timestamp;
        return bTimestamp - aTimestamp;
      })
      .map((fileName) => {
        const { timestamp, name, logId } = getTimestampNameAndLogIdFromFilename(fileName);
        return {
          name,
          value: {
            fileName,
            logId,
            timestamp,
          },
        };
      });

    const answers: { fileName: string; timestamp: number; logId: string } = await select({
      loop: true,
      message: 'Select a log',
      choices,
    });

    console.log(`Selected file: ${answers.fileName}`);

    return answers;
  }
}
