import { Body, Controller, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { EditorService } from './editor.service';

@Controller()
/**
 * Hosts the in-browser task editor and its HTTP API.
 *
 * The editor lets you browse task types, inspect task metadata/params/enums,
 * and edit custom-data (skills/quests/notes) stored in task-json-store. This
 * controller serves the editor HTML and exposes JSON endpoints for task data,
 * custom columns, wiki summaries, quest lists, and wizard state.
 */
export class EditorController {
  constructor(private readonly editorService: EditorService) {}

  @Get('editor')
  public async getEditor(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/html');
    res.send(await this.getEditorHtml());
  }

  @Get('api/task-types')
  public async getTaskTypes(): Promise<any[]> {
    return this.editorService.getTaskTypes();
  }

  @Get('api/tasks/:taskJsonName')
  public async getTasks(@Param('taskJsonName') taskJsonName: string): Promise<any> {
    const taskType = await this.editorService.getTaskType(taskJsonName);
    const tasks = await this.editorService.getTasks(taskJsonName);
    const customColumns = await this.editorService.getCustomColumns(taskJsonName);
    return { taskType, tasks, customColumns };
  }

  @Post('api/custom-columns/:taskJsonName')
  public async createCustomColumn(
    @Param('taskJsonName') taskJsonName: string,
    @Body() body: { key: string; label: string; valueType: 'string' | 'number' | 'boolean' | 'skills' | 'quests' },
  ): Promise<any> {
    return this.editorService.createCustomColumn(taskJsonName, body);
  }

  @Put('api/custom-columns/:taskJsonName/:columnKey')
  public async saveCustomColumn(
    @Param('taskJsonName') taskJsonName: string,
    @Param('columnKey') columnKey: string,
    @Body()
    body: {
      values: Record<string, string | number | boolean | null | { skill: string; level: number }[] | string[]>;
    },
  ): Promise<any> {
    return this.editorService.saveCustomColumnValues(taskJsonName, columnKey, body.values);
  }

  @Put('api/tasks/:taskJsonName/:structId/skills')
  public async updateTaskSkills(
    @Param('taskJsonName') taskJsonName: string,
    @Param('structId') structId: string,
    @Body() body: { skills: { skill: string; level: number }[] },
  ): Promise<void> {
    await this.editorService.updateTaskSkills(taskJsonName, Number(structId), body.skills || []);
  }

  @Get('api/wiki-summary')
  public async getWikiSummary(@Query('title') title: string): Promise<{ summary: string | null }> {
    const summary = await this.editorService.getWikiSummary(title);
    return { summary };
  }

  @Get('api/wizard-state')
  public async getWizardState(
    @Query('taskJsonName') taskJsonName: string,
    @Query('columnKey') columnKey: string,
  ): Promise<{ index: number | null }> {
    const state = await this.editorService.getWizardState(taskJsonName, columnKey);
    return { index: state?.index ?? null };
  }

  @Put('api/wizard-state')
  public async saveWizardState(
    @Body() body: { taskJsonName: string; columnKey: string; index: number },
  ): Promise<void> {
    await this.editorService.saveWizardState(body.taskJsonName, body.columnKey, body.index);
  }

  @Get('api/quests')
  public async getQuests(): Promise<{ quests: any[] }> {
    return this.editorService.getQuests();
  }

  private async getEditorHtml(): Promise<string> {
    const candidates = [
      path.resolve(process.cwd(), 'src', 'editor', 'editor.html'),
      path.resolve(process.cwd(), 'task-scraper', 'src', 'editor', 'editor.html'),
      path.resolve(__dirname, 'editor.html'),
    ];
    for (const candidate of candidates) {
      try {
        const data = await fs.readFile(candidate, 'utf-8');
        return data;
      } catch {
        // try next
      }
    }
    throw new Error('Unable to locate editor.html');
  }
}
