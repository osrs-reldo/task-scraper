import { DBRow, ParamID, Struct } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { DBRowService } from '../../../core/services/dbrow/dbrow.service';
import { EnumService } from '../../../core/services/enum/enum.service';
import { StructService } from '../../../core/services/struct/struct.service';
import { GameValService } from '../../../core/services/gameval/gameval.service';
import { ScriptAnalysisService } from '../../../core/services/script/script-analysis.service';
import { ScriptService } from '../../../core/services/script/script.service';
import { WikiService } from '../../../core/services/wiki/wiki.service';
import { IColumnDefinitions } from '../../../core/services/wiki/column-definitions.interface';
import { ITask, ITaskSkill } from '../../../core/types/task-mockup.interface';
import { ITaskType } from '../../../core/types/task-type-mockup.interface';
import { IInteractiveTaskExtractResult } from './interactive-task-extract-result.interface';
import { InteractiveDbRowTaskService } from './interactive-dbrow-task.service';
import { InteractiveTaskService } from './interactive-task.service';
import { InteractivePrompt } from '../../interactive-prompt.util';

// CA killcount script ID: [proc,ca_specific_killcount] reads the permanent KC varp for each boss
const CA_KILLCOUNT_SCRIPT_ID = 4778;
// Struct param IDs for CA boss structs (ca_boss.if3 / ca_bosses.if3)
const PARAM_CA_BOSS_NAME = 1313 as ParamID;      // boss display name (e.g. "Abyssal Sire")
const PARAM_CA_KILLCOUNT_INDEX = 1315 as ParamID; // index passed to ca_specific_killcount
// Struct param IDs for collection log category structs (collection.if3)
const PARAM_CLOG_BOSS_NAME = 689 as ParamID;      // boss/category name shown in the log header

// Task text → CA struct boss name aliases.
// CA struct names that differ from how they appear in task text.
const BOSS_KC_NAME_ALIASES: Record<string, string> = {
  'Sol Heredit': 'Fortis Colosseum',          // CA page calls it "Fortis Colosseum"
  "Phosani's Nightmare": 'Phosanis Nightmare', // CA struct omits the apostrophe
  'The Gauntlet': 'Crystalline Hunllef',       // Gauntlet boss = Crystalline Hunllef
  'Corrupted Gauntlet': 'Corrupted Hunllef',   // Corrupted Gauntlet boss = Corrupted Hunllef
};

// Collection log boss name → CA struct boss name, for the few cases where they differ.
// Most clog names (param_689) match CA names (param_1313) exactly; only exceptions listed.
const CLOG_TO_CA_NAME_OVERRIDES: Record<string, string> = {
  'Sol Heredit': 'Fortis Colosseum',    // clog: "Sol Heredit", CA: "Fortis Colosseum"
  'The Gauntlet': 'Crystalline Hunllef',
  'Corrupted Gauntlet': 'Corrupted Hunllef',
};

@Injectable()
export class TasksCommand {
  constructor(
    private structService: StructService,
    private interactivetaskService: InteractiveTaskService,
    private interactiveDbRowTaskService: InteractiveDbRowTaskService,
    private scriptAnalysisService: ScriptAnalysisService,
    private scriptService: ScriptService,
    private wikiService: WikiService,
    private dbrowService: DBRowService,
    private enumService: EnumService,
    private gameValService: GameValService,
  ) {}

  /**
   * Parse [proc,ca_specific_killcount] (script 4778) and return a map of
   * CA killcount case index → KC varp ID. Shared by both derivation methods.
   */
  private async buildCaKillcountCaseMap(): Promise<Map<number, number>> {
    const parsed = await this.scriptService.getParsedScript(CA_KILLCOUNT_SCRIPT_ID);
    if (!parsed) throw new Error(`Script ${CA_KILLCOUNT_SCRIPT_ID} not found in cache`);

    const instrByAddress = new Map(parsed.instructions.map(i => [i.address, i]));
    const caseToVarpId = new Map<number, number>();

    for (const instr of parsed.instructions) {
      if (instr.opcode !== 60) continue; // SWITCH opcode
      if (!Array.isArray(instr.operand)) continue;
      for (const { value, target } of instr.operand as { value: number; target: number }[]) {
        // Switch case offsets land on the instruction BEFORE the case body (cs2 branch semantics),
        // so the actual push_var is at target+1.
        const targetInstr = instrByAddress.get(target + 1);
        if (targetInstr && targetInstr.opcode === 1) {
          const varpId: number = targetInstr.operand?.var ?? targetInstr.operand;
          if (typeof varpId === 'number') caseToVarpId.set(value, varpId);
        }
      }
      break; // only one switch in this script
    }

    return caseToVarpId;
  }

  /**
   * Method A — Combat Achievements.
   * Derives boss name → KC varp from CA boss structs (param_1313 = name, param_1315 = case index)
   * cross-referenced with [proc,ca_specific_killcount] (script 4778).
   */
  private async deriveBossKcVarps(): Promise<Map<string, number>> {
    const caseToVarpId = await this.buildCaKillcountCaseMap();
    const caStructs = await this.structService.findByParam(PARAM_CA_KILLCOUNT_INDEX);

    const result = new Map<string, number>();
    for (const struct of caStructs) {
      const bossName = struct.params.get(PARAM_CA_BOSS_NAME);
      const caseIndex = struct.params.get(PARAM_CA_KILLCOUNT_INDEX);
      if (typeof bossName !== 'string' || typeof caseIndex !== 'number') continue;
      const varpId = caseToVarpId.get(caseIndex);
      if (varpId !== undefined) result.set(bossName, varpId);
    }

    // Aliases for task text names that differ from CA struct names
    for (const [alias, caName] of Object.entries(BOSS_KC_NAME_ALIASES)) {
      const varpId = result.get(caName);
      if (varpId !== undefined) result.set(alias, varpId);
    }

    return result;
  }

  /**
   * Method B — Collection Log.
   * Enumerates bosses via collection log category structs (param_689 = boss name shown in the
   * clog header, e.g. "Sol Heredit") and derives their KC varps by cross-referencing with the
   * CA killcount chain (still uses script 4778 + CA structs as the varp source).
   *
   * Advantage over Method A: clog names match task text more closely in several cases
   * (e.g. clog has "Sol Heredit" directly, while CA uses "Fortis Colosseum").
   */
  private async deriveBossKcVarpsFromClog(): Promise<Map<string, number>> {
    // Build CA name → varp lookup (same script chain as Method A)
    const caseToVarpId = await this.buildCaKillcountCaseMap();
    const caStructs = await this.structService.findByParam(PARAM_CA_KILLCOUNT_INDEX);
    const caNameToVarpId = new Map<string, number>();
    for (const struct of caStructs) {
      const name = struct.params.get(PARAM_CA_BOSS_NAME);
      const caseIndex = struct.params.get(PARAM_CA_KILLCOUNT_INDEX);
      if (typeof name !== 'string' || typeof caseIndex !== 'number') continue;
      const varpId = caseToVarpId.get(caseIndex);
      if (varpId !== undefined) caNameToVarpId.set(name, varpId);
    }

    // Enumerate collection log category structs; param_689 holds the boss/category display name
    const clogStructs = await this.structService.findByParam(PARAM_CLOG_BOSS_NAME);
    const result = new Map<string, number>();

    for (const struct of clogStructs) {
      const clogName = struct.params.get(PARAM_CLOG_BOSS_NAME);
      if (typeof clogName !== 'string') continue;

      // Try exact match against CA names first
      let varpId = caNameToVarpId.get(clogName);

      if (varpId === undefined) {
        // Try substring match for partial name differences (e.g. CA "Barrows" ↔ clog "Barrows Chests")
        for (const [caName, id] of caNameToVarpId) {
          if (clogName.toLowerCase().includes(caName.toLowerCase()) ||
              caName.toLowerCase().includes(clogName.toLowerCase())) {
            varpId = id;
            break;
          }
        }
      }

      if (varpId !== undefined) result.set(clogName, varpId);
    }

    // Overrides for clog names with no matching CA name (e.g. "Sol Heredit" vs "Fortis Colosseum")
    for (const [clogName, caName] of Object.entries(CLOG_TO_CA_NAME_OVERRIDES)) {
      const varpId = caNameToVarpId.get(caName);
      if (varpId !== undefined) result.set(clogName, varpId);
    }

    return result;
  }

  /**
   * Method C — GAMEVALS.
   * Loads all named varps directly from the cache's GAMEVALS index (archive 3).
   * Filters to varps whose name contains "boss_kc" (the conventional naming pattern),
   * then converts the snake_case name to a display name for fuzzy matching against task text.
   * e.g. "boss_kc_abyssal_sire" → "Abyssal Sire"
   */
  private async deriveBossKcVarpsFromGameVals(): Promise<Map<string, number>> {
    const varps = await this.gameValService.getAllVarps();
    const result = new Map<string, number>();

    for (const varp of varps) {
      if (!varp.name) continue;
      const lower = varp.name.toLowerCase();

      // Match any varp with "boss_kc" in its name
      const kcIdx = lower.indexOf('boss_kc_');
      if (kcIdx === -1) continue;

      // Strip everything up to and including "boss_kc_" to get the boss slug
      const slug = varp.name.slice(kcIdx + 'boss_kc_'.length);
      // Convert snake_case → Title Case
      const bossName = slug
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

      result.set(bossName, varp.id);
    }

    return result;
  }

  public async handleMapLeagueVarbitProgress(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypeName: string = options.type ?? 'LEAGUE_6';
    const tasksPath = path.join(taskJsonStoreDir, 'tasks', `${taskTypeName}.min.json`);

    if (!existsSync(tasksPath)) {
      throw new Error(`Tasks file not found: ${tasksPath}`);
    }

    const tasks: any[] = JSON.parse(readFileSync(tasksPath, 'utf-8'));

    console.log('🔍 Loading league task varbits from cache...');
    const allVarbits = await this.gameValService.getAllVarbits();
    const getVarbitSlug = (name: string): string =>
      name.startsWith('league_task_') ? name.slice('league_task_'.length) : name.slice('league_'.length);
    const leagueVarbits = allVarbits.filter(v =>
      v.name?.toLowerCase().startsWith('league_') && v.bitLength > 1,
    );
    console.log(`   Found ${leagueVarbits.length} multi-bit league_ varbits`);

    const SYNONYMS: Record<string, string> = {
      defeat: 'kill', slay: 'kill', killed: 'kill', destroyed: 'kill',
      caught: 'catch', capture: 'catch',
      obtained: 'get', collected: 'get',
      shot: 'shoot',
      make: 'create',
      chop: 'cut', chopped: 'cut',
      fished: 'fish',
      filled: 'fill',
      rocks: 'ore',
      successes: 'times',
      consecutive: 'streak',
    };
    const syn = (w: string): string => SYNONYMS[w] ?? w;

    const varbitEntries = leagueVarbits.map(v => ({
      varbit: v,
      words: getVarbitSlug(v.name!.toLowerCase()).split('_').filter(w => w.length > 0).map(syn),
    }));

    const normalize = (name: string): string =>
      name.toLowerCase()
        .replace(/[\u2019']/g, '')
        .replace(/-/g, '')
        .replace(/\+/g, ' plus')
        .replace(/,/g, '');

    const toTokens = (s: string): Set<string> =>
      new Set(s.split(/\s+/).filter(w => w.length > 0).map(syn));

    const scoreAgainst = (words: string[], tokens: Set<string>): number =>
      words.filter(w => tokens.has(w)).length;

    // Load all task names in parallel
    type TaskItem = { index: number; task: any; name: string; tokens: Set<string> };
    const allTaskData: TaskItem[] = await Promise.all(
      tasks.map(async (task, index) => {
        const dbrow: DBRow = await this.dbrowService.getDBRow(task.dbRowId);
        const name: string = (dbrow?.values[1]?.[0] as string) ?? '';
        return { index, task, name, tokens: toTokens(normalize(name)) };
      }),
    );
    // allNamedTasks = every task with a name (including already-mapped ones, since a varbit can map to multiple tasks)
    const allNamedTasks = allTaskData.filter(t => t.name);

    const extractNumbers = (s: string): number[] => {
      const matches = s.match(/\d[\d,]*/g) ?? [];
      return [...new Set(matches.map(m => parseInt(m.replace(/,/g, ''), 10)).filter(n => !isNaN(n) && n > 0))].sort((a, b) => a - b);
    };

    // For pass 1 auto: pick largest extracted number <= maxValue, or 1 if none found
    const autoTarget = (name: string, maxValue: number): number => {
      const nums = extractNumbers(name).filter(n => n <= maxValue);
      return nums.length > 0 ? Math.max(...nums) : 1;
    };

    const promptTarget = async (itemName: string, varbitMaxValue: number): Promise<number> => {
      const nums = extractNumbers(itemName);
      if (nums.length === 1) {
        if (nums[0] > varbitMaxValue) console.log(`  ⚠ Warning: ${nums[0]} exceeds varbit max (${varbitMaxValue})`);
        return nums[0];
      }
      console.log(`  Target? (varbit max: ${varbitMaxValue})`);
      nums.forEach((n, i) => console.log(`  ${i + 1}) ${n}`));
      console.log(`  C) Enter value`);
      while (true) {
        const k = (await InteractivePrompt.input('Target:')).trim().toLowerCase();
        const byKey = new Map(nums.map((n, i) => [String(i + 1), n]));
        let chosen: number | null = null;
        if (byKey.has(k)) {
          chosen = byKey.get(k)!;
        } else if (k === 'c') {
          const raw = (await InteractivePrompt.input('Value:')).trim();
          const parsed = parseInt(raw.replace(/,/g, ''), 10);
          if (!isNaN(parsed) && parsed > 0) chosen = parsed;
        }
        if (chosen !== null) {
          if (chosen > varbitMaxValue) {
            console.log(`  ⚠ Warning: ${chosen} exceeds varbit max (${varbitMaxValue})`);
          }
          return chosen;
        }
      }
    };

    type VarbitMapEntry = { varbitName: string; varbitId: number; target: number; dbRowId: number };
    const mapEntries: VarbitMapEntry[] = [];
    const matchedVarbitIds = new Set<number>();

    type VarbitEntry = typeof varbitEntries[number];
    const needsReview: VarbitEntry[] = [];

    const VARBIT_SKIP_PATTERNS = [
      // existing
      'filter', 'total_tasks', '_selection',
      // league UI / state — not task progress
      'league_bankers_',
      'league_type',
      '_tutorial',
      '_last_viewed',
      '_shopselection',
      '_teleport_type',
      '_stored_stat_',
      'league_combat_mastery_',
      'league_echo_killcount_',
      'league_echo_pb_',
      'league_culling_spree_rolled_master',
      '_points_buffer',
      'league_3_fragment_',
      '_free_fragment_tracker',
      'league_3_magic_book_',
      'league_3_set_effect_key_area_',
      'league_3_quest_',
      '_rank_notification',
      '_message_buffer',
      '_tob_mode',
      '_last_style',
      'league_trailblazer_tool_toggle_',
      'league_mastery_',
      '_messaging_buffer',
    ];

    // Pass 1: for each varbit, auto-apply if exactly one task is a perfect match
    for (const entry of varbitEntries) {
      if (entry.words.length === 0) continue;
      if (VARBIT_SKIP_PATTERNS.some(p => entry.varbit.name!.toLowerCase().includes(p))) continue;
      const perfect = allNamedTasks.filter(
        t => scoreAgainst(entry.words, t.tokens) === entry.words.length,
      );
      if (perfect.length === 1) {
        const item = perfect[0];
        const v = entry.varbit;
        matchedVarbitIds.add(v.id);
        const target = autoTarget(item.name, v.maxValue);
        console.log(`  ✔ [${v.id}] ${v.name}  →  ${item.task.dbRowId}: "${item.name}" (target: ${target})`);
        mapEntries.push({ varbitName: v.name!, varbitId: v.id, target, dbRowId: item.task.dbRowId });
      } else {
        needsReview.push(entry);
      }
    }

    // Write review list to file before starting interactive pass
    if (options.review && needsReview.length > 0) {
      mkdirSync('./out', { recursive: true });
      const reviewListPath = `./out/${taskTypeName}-review.txt`;
      const reviewLines = needsReview.map((entry, i) => {
        const v = entry.varbit;
        return `[${i + 1}/${needsReview.length}] [${v.id}] ${v.name}  (words: ${entry.words.join(', ')})`;
      });
      writeFileSync(reviewListPath, reviewLines.join('\n') + '\n');
      console.log(`📝 Review list written to ${reviewListPath}`);
    }

    // Pass 2: interactive review for varbits with 0 or multiple perfect matches
    if (needsReview.length > 0) {
      console.log(`\n🤔 ${needsReview.length} varbits need review:`);
      for (let reviewIdx = 0; reviewIdx < needsReview.length; reviewIdx++) {
        const entry = needsReview[reviewIdx];
        const v = entry.varbit;
        const top3 = allNamedTasks
          .map(t => ({ ...t, score: scoreAgainst(entry.words, t.tokens) }))
          .filter(t => t.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        console.log(`\n[${reviewIdx + 1}/${needsReview.length}] Varbit [${v.id}] ${v.name}  (words: ${entry.words.join(', ')})`);
        if (top3.length > 0) {
          top3.forEach((t, i) =>
            console.log(`  ${i + 1}) [${t.task.dbRowId}] "${t.name}"  (${t.score}/${entry.words.length} tokens)`),
          );
        } else {
          console.log('  (no scored candidates)');
        }
        console.log('  M) Multi-select...');
        console.log('  F) Find other...');
        console.log('  X) Skip');

        let chosenItems: TaskItem[] = [];
        let decided = false;

        while (!decided) {
          const key = (await InteractivePrompt.input('Choice:')).trim().toLowerCase();
          const topByKey = new Map(top3.map((t, i) => [String(i + 1), t]));

          if (topByKey.has(key)) {
            chosenItems = [topByKey.get(key)!];
            decided = true;
          } else if (key === 'x') {
            decided = true;
          } else if (key === 'm') {
            const top9 = allNamedTasks
              .map(t => ({ ...t, score: scoreAgainst(entry.words, t.tokens) }))
              .filter(t => t.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 9);
            top9.forEach((t, i) =>
              console.log(`  ${i + 1}) [${t.task.dbRowId}] "${t.name}"  (${t.score}/${entry.words.length} tokens)`),
            );
            console.log('  X) Cancel (back)');
            const nums = (await InteractivePrompt.input('Numbers (space or comma separated):')).trim().toLowerCase();
            if (nums !== 'x' && nums !== '') {
              const indices = nums.split(/[\s,]+/).map(n => parseInt(n, 10) - 1).filter(i => !isNaN(i) && i >= 0 && i < top9.length);
              chosenItems = indices.map(i => top9[i]);
              decided = true;
            }
            // else: loop back to main choice
          } else if (key === 'f') {
            const search = await InteractivePrompt.input('Search task names:');
            const lower = search.toLowerCase();
            const filtered = allNamedTasks.filter(t => t.name.toLowerCase().includes(lower)).slice(0, 9);
            if (filtered.length === 0) {
              console.log('  (no results)');
              // loop back
            } else {
              filtered.forEach((t, i) =>
                console.log(`  ${i + 1}) [${t.task.dbRowId}] "${t.name}"`),
              );
              console.log('  M) Multi-select from these results');
              console.log('  X) Cancel (back)');
              const k = (await InteractivePrompt.input('Choice:')).trim().toLowerCase();
              const filteredByKey = new Map(filtered.map((t, i) => [String(i + 1), t]));
              if (filteredByKey.has(k)) {
                chosenItems = [filteredByKey.get(k)!];
                decided = true;
              } else if (k === 'm') {
                const nums = (await InteractivePrompt.input('Numbers (space or comma separated):')).trim().toLowerCase();
                if (nums !== 'x' && nums !== '') {
                  const indices = nums.split(/[\s,]+/).map(n => parseInt(n, 10) - 1).filter(i => !isNaN(i) && i >= 0 && i < filtered.length);
                  chosenItems = indices.map(i => filtered[i]);
                  decided = true;
                }
                // else: loop back
              }
              // else (x or unrecognised): loop back
            }
          }
          // unrecognised key: loop back
        }

        for (const item of chosenItems) {
          matchedVarbitIds.add(v.id);
          console.log(`  ✔ [${v.id}] ${v.name}  →  ${item.task.dbRowId}: "${item.name}"`);
          const target = await promptTarget(item.name, v.maxValue);
          mapEntries.push({ varbitName: v.name!, varbitId: v.id, target, dbRowId: item.task.dbRowId });
        }
      }
    }

    console.log(`\n✅ Mapped ${mapEntries.length} varbit→task entries`);
    mkdirSync('./out', { recursive: true });
    const outPath = `./out/${taskTypeName}-varbit-map.json`;
    writeFileSync(outPath, JSON.stringify(mapEntries, null, 2));
    console.log(`💾 Written to ${outPath}`);

    const mappedDataPath = path.join(taskJsonStoreDir, 'mapped-data', taskTypeName, 'varbit-map.json');
    mkdirSync(path.dirname(mappedDataPath), { recursive: true });
    writeFileSync(mappedDataPath, JSON.stringify(mapEntries, null, 2));
    console.log(`💾 Also written to ${mappedDataPath}`);
  }

  public async handleApplyLeagueVarbitProgress(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypeName: string = options.type ?? 'LEAGUE_6';
    const tasksPath = options.input
      ? path.resolve(process.cwd(), options.input)
      : path.join(taskJsonStoreDir, 'tasks', `${taskTypeName}.min.json`);
    const mapPath = options.map
      ? path.resolve(process.cwd(), options.map)
      : path.join(process.cwd(), 'out', `${taskTypeName}-varbit-map.json`);

    if (!existsSync(tasksPath)) throw new Error(`Tasks file not found: ${tasksPath}`);
    if (!existsSync(mapPath)) throw new Error(`Varbit map not found: ${mapPath} — run map-varbit-progress first or pass --map`);

    const tasks: any[] = JSON.parse(readFileSync(tasksPath, 'utf-8'));
    type VarbitMapEntry = { varbitName: string; varbitId: number; target: number; dbRowId: number };
    const varbitMap: VarbitMapEntry[] = JSON.parse(readFileSync(mapPath, 'utf-8'));

    const mapByDbRowId = new Map<number, VarbitMapEntry[]>();
    for (const e of varbitMap) {
      const arr = mapByDbRowId.get(e.dbRowId) ?? [];
      arr.push(e);
      mapByDbRowId.set(e.dbRowId, arr);
    }
    const updated = tasks.map(task => {
      const entries = mapByDbRowId.get(task.dbRowId);
      if (!entries) return task;
      return { ...task, progress: entries.map(e => ({ type: 'VARBIT', id: e.varbitId, target: e.target })) };
    });

    const patched = updated.filter((t, i) => t !== tasks[i]).length;
    console.log(`✅ Applied ${patched} varbit progress entries (${varbitMap.length} entries in map)`);

    if (options.json) {
      mkdirSync('./out', { recursive: true });
      const outPath = `./out/${taskTypeName}.min.json`;
      writeFileSync(outPath, JSON.stringify(updated));
      console.log(`💾 Written to ${outPath}`);
    } else {
      console.log(JSON.stringify(updated, null, 2));
    }
  }

  public async handleTaskExtract(options: any): Promise<IInteractiveTaskExtractResult> {
    const results: IInteractiveTaskExtractResult = await this.interactivetaskService.promptTaskExtraction(options);
    if (options.json) {
      mkdirSync('./out', { recursive: true });
      writeFileSync(`./out/${results.taskType.taskJsonName}.json`, JSON.stringify(results.tasks, null, 2));
      writeFileSync(`./out/${results.taskType.taskJsonName}-tasktype.json`, JSON.stringify(results.taskType, null, 2));
    } else {
      console.log(results);
    }
    return results;
  }

  public async handleGenerate(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypesPath = path.join(taskJsonStoreDir, 'task-types.json');

    if (!existsSync(taskTypesPath)) {
      throw new Error(`task-types.json not found at ${taskTypesPath}. Run from task-scraper/ directory.`);
    }

    const taskTypes: ITaskType[] = JSON.parse(readFileSync(taskTypesPath, 'utf-8'));
    const taskTypeName: string = options.type;
    if (!taskTypeName) {
      console.log('Available task types:');
      taskTypes.forEach(tt => console.log(`  - ${tt.taskJsonName}`));
      throw new Error('Please specify a task type with --type');
    }
    const taskTypeDefinition = taskTypes.find(
      (tt) => tt.taskJsonName.toLowerCase() === taskTypeName.toLowerCase(),
    );
    if (!taskTypeDefinition) {
      throw new Error(`Task type "${taskTypeName}" not found in task-types.json`);
    }

    if (taskTypeDefinition.taskSourceType !== 'DBROW') {
      throw new Error(`tasks generate only supports DBROW task types (got: ${taskTypeDefinition.taskSourceType ?? 'unset'})`);
    }

    const enumId = taskTypeDefinition.dbRowEnumId;
    if (!enumId) {
      throw new Error(`No dbRowEnumId in task-type definition`);
    }

    console.log(`📦 Loading enum ${enumId} for task type "${taskTypeDefinition.taskJsonName}"...`);
    const sourceEnum = await this.enumService.getEnum(enumId);
    if (!sourceEnum?.map?.size) {
      throw new Error(`Enum ${enumId} not found or empty`);
    }

    const tasks: ITask[] = [];
    let sortId = 0;
    for (const value of sourceEnum.map.values()) {
      if (typeof value === 'number') {
        tasks.push({ dbRowId: value, sortId: sortId++ } as any);
      }
    }

    console.log(`✅ Generated ${tasks.length} tasks from enum ${enumId}`);
    mkdirSync('./out', { recursive: true });
    const outPath = `./out/${taskTypeDefinition.taskJsonName}.min.json`;
    writeFileSync(outPath, JSON.stringify(tasks));
    console.log(`💾 Written to ${outPath}`);
  }

  public async handleDbRowTaskExtract(options: any): Promise<IInteractiveTaskExtractResult> {
    const results: IInteractiveTaskExtractResult = await this.interactiveDbRowTaskService.promptTaskExtraction(options);
    if (options.json) {
      mkdirSync('./out', { recursive: true });
      writeFileSync(`./out/${results.taskType.taskJsonName}.json`, JSON.stringify(results.tasks, null, 2));
      writeFileSync(`./out/${results.taskType.taskJsonName}-tasktype.json`, JSON.stringify(results.taskType, null, 2));
    } else {
      console.log(results);
    }
    return results;
  }

  public async handleGenerateFrontendTasks(jsonFilename: string, nameParamId: ParamID, descriptionParamId: ParamID) {
    interface IFrontendTask {
      id: string;
      label: string;
      description: string;
      skillReqs: { skill: string; level: number }[];
      regions: string[];
      difficulty: null; // placeholders
      category: null; // placeholders
      subcategory: null; // placeholders
      prerequisite: null; // placeholders
    }

    const jsonResponse = await axios.get(
      `https://raw.githubusercontent.com/osrs-reldo/task-json-store/refs/heads/main/tasks/${jsonFilename}.min.json`,
    );
    const taskStructData: ITask[] = jsonResponse.data;

    const transformSkills = (taskSkills: ITaskSkill[]): { skill: string; level: number }[] =>
      taskSkills.map((taskSkill) => ({
        skill: taskSkill.skill.charAt(0).toUpperCase() + taskSkill.skill.slice(1).toLowerCase(),
        level: taskSkill.level,
      }));

    const frontendTasks: Record<string, IFrontendTask> = {};
    for (const taskData of taskStructData) {
      const struct: Struct = await this.structService.getStruct(taskData.structId);
      const name: string = struct.params.get(nameParamId).toString();
      const description: string = struct.params.get(descriptionParamId).toString();
      const frontendTask: IFrontendTask = {
        id: String(taskData.sortId),
        label: name,
        description: description,
        skillReqs: taskData.skills ? transformSkills(taskData.skills) : [],
        regions: [],
        difficulty: null,
        category: null,
        subcategory: null,
        prerequisite: null,
      };
      frontendTasks[frontendTask.id] = frontendTask;
    }

    console.log(JSON.stringify(frontendTasks, null, 2));
  }

  public async handleUpdateVarps(options: any): Promise<ITaskType> {
    console.log('🔧 Updating task varps...');
    
    const taskTypesUrl = 'https://raw.githubusercontent.com/osrs-reldo/task-json-store/refs/heads/main/task-types.json';
    
    // Load task-type definitions from GitHub
    console.log(`📡 Fetching task-types from ${taskTypesUrl}...`);
    const response = await axios.get(taskTypesUrl);
    const taskTypes: ITaskType[] = response.data;
    
    let taskTypeDefinition: ITaskType | undefined;
    
    // If --type provided, find it. Otherwise, show interactive selection
    if (options.type) {
      taskTypeDefinition = taskTypes.find(tt => 
        tt.taskJsonName.toLowerCase() === options.type.toLowerCase() ||
        tt.name.toLowerCase() === options.type.toLowerCase()
      );
      
      if (!taskTypeDefinition) {
        console.error(`❌ Could not find task-type matching "${options.type}"`);
        console.log(`Available task types: ${taskTypes.map(tt => tt.taskJsonName).join(', ')}`);
        throw new Error(`Task type "${options.type}" not found`);
      }
    } else {
      // Interactive selection
      const choices = taskTypes
        .filter(tt => tt.taskCompletedScriptId) // Only show task types with a script ID
        .map(tt => ({
          name: `${tt.name} (${tt.taskJsonName}) - Script ${tt.taskCompletedScriptId}`,
          value: tt,
        }));
      
      if (choices.length === 0) {
        throw new Error('No task types with taskCompletedScriptId found');
      }
      
      taskTypeDefinition = await InteractivePrompt.select(
        'Select a task type to update:',
        choices
      );
    }
    
    console.log(`📄 Selected task-type: "${taskTypeDefinition.name}" (${taskTypeDefinition.taskJsonName})`);
    
    if (!taskTypeDefinition.taskCompletedScriptId) {
      throw new Error(`Task type "${taskTypeDefinition.name}" does not have a taskCompletedScriptId defined`);
    }
    
    const taskCompletedScriptId = taskTypeDefinition.taskCompletedScriptId;
    console.log(`📊 Analyzing script ${taskCompletedScriptId} to extract task varps...`);
    
    // Use ScriptAnalysisService to automatically extract varps
    const taskVarps = await this.scriptAnalysisService.generateTaskVarps(taskCompletedScriptId);
    console.log(`✅ Extracted ${taskVarps.length} task varps: ${taskVarps.slice(0, 5).join(', ')}${taskVarps.length > 5 ? '...' : ''}`);
    
    // Update the taskVarps with freshly extracted ones
    const oldVarpsCount = taskTypeDefinition.taskVarps.length;
    taskTypeDefinition.taskVarps = taskVarps;
    
    console.log(`🔄 Updated taskVarps: ${oldVarpsCount} → ${taskVarps.length} varps`);
    
    if (options.json) {
      // Ensure out directory exists
      mkdirSync('./out', { recursive: true });
      const filename = `./out/${taskTypeDefinition.taskJsonName.toLowerCase()}-tasktype.json`;
      writeFileSync(filename, JSON.stringify(taskTypeDefinition, null, 2));
      console.log(`💾 Updated task-type written to ${filename}`);
    } else {
      console.log(JSON.stringify(taskTypeDefinition, null, 2));
    }

    console.log('✨ Task varp update complete!');
    return taskTypeDefinition;
  }

  public async handleUpdateWikiData(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypesPath = path.join(taskJsonStoreDir, 'task-types.json');

    if (!existsSync(taskTypesPath)) {
      throw new Error(`task-types.json not found at ${taskTypesPath}. Run from task-scraper/ directory.`);
    }

    const taskTypes: ITaskType[] = JSON.parse(readFileSync(taskTypesPath, 'utf-8'));

    let taskTypeDefinition: ITaskType | undefined;
    if (options.type) {
      taskTypeDefinition = taskTypes.find(
        (tt) =>
          tt.taskJsonName.toLowerCase() === options.type.toLowerCase() ||
          tt.name.toLowerCase() === options.type.toLowerCase(),
      );
      if (!taskTypeDefinition) {
        console.error(`❌ Could not find task-type matching "${options.type}"`);
        console.log(`Available task types: ${taskTypes.map((tt) => tt.taskJsonName).join(', ')}`);
        throw new Error(`Task type "${options.type}" not found`);
      }
    } else {
      const choices = taskTypes.map((tt) => ({
        name: `${tt.name} (${tt.taskJsonName})`,
        value: tt,
      }));
      taskTypeDefinition = await InteractivePrompt.select('Select a task type to update wiki data for:', choices);
    }

    console.log(`📄 Selected task-type: "${taskTypeDefinition.name}" (${taskTypeDefinition.taskJsonName})`);

    const taskFilePath = options.input
      ? path.resolve(process.cwd(), options.input)
      : path.join(taskJsonStoreDir, 'tasks', `${taskTypeDefinition.taskJsonName}.min.json`);
    if (!existsSync(taskFilePath)) {
      throw new Error(`Task file not found: ${taskFilePath}`);
    }
    console.log(`📂 Reading tasks from ${taskFilePath}...`);
    const tasks: ITask[] = JSON.parse(readFileSync(taskFilePath, 'utf-8'));
    console.log(`✅ Loaded ${tasks.length} tasks`);

    const wikiUrl: string =
      options.wikiUrl ??
      taskTypeDefinition.wikiConfig?.url ??
      (await InteractivePrompt.input(
        'Enter the wiki URL with all tasks on it',
        'https://oldschool.runescape.wiki/w/Combat_Achievements/All_tasks',
      ));

    const taskIdAttribute: string =
      options.taskIdAttribute ??
      taskTypeDefinition.wikiConfig?.taskIdAttribute ??
      (await InteractivePrompt.input('Enter the task id attribute (from the tr elements)', 'data-taskid'));

    const hasCompletionFromType = taskTypeDefinition.wikiConfig?.completionColumnId !== undefined;
    const hasRequirementsFromType = taskTypeDefinition.wikiConfig?.requirementsColumnId !== undefined;

    const completionColumnRaw: string =
      options.completionColumn !== undefined
        ? options.completionColumn
        : hasCompletionFromType
          ? String(taskTypeDefinition.wikiConfig.completionColumnId ?? '')
          : (await InteractivePrompt.input('0-indexed completion percent column (leave blank to skip)', ''));

    const requirementsColumnRaw: string = options.percentOnly
      ? ''
      : options.requirementsColumn !== undefined
        ? options.requirementsColumn
        : hasRequirementsFromType
          ? String(taskTypeDefinition.wikiConfig.requirementsColumnId ?? '')
          : (await InteractivePrompt.input('0-indexed requirements/notes column (leave blank to skip)', ''));

    const completionColumnId = completionColumnRaw !== '' ? Number.parseInt(completionColumnRaw) : null;
    const requirementsColumnId = requirementsColumnRaw !== '' ? Number.parseInt(requirementsColumnRaw) : null;

    const columnDefinitions: IColumnDefinitions = {
      nameColumnId: 0,
      descriptionColumnId: 0,
      requirementsColumnId,
      pointsColumnId: null,
      completionColumnId,
    };

    console.log(`🌐 Scraping wiki data from ${wikiUrl}...`);
    const updatedTasks = await this.wikiService.extractAndAppendDataBySortId(tasks, wikiUrl, taskIdAttribute, columnDefinitions);

    if (options.percentOnly) {
      const originalBySort = new Map(tasks.map((t) => [t.sortId, t]));
      for (const task of updatedTasks) {
        const original = originalBySort.get(task.sortId);
        if (!original) continue;
        task.skills = original.skills;
        task.wikiNotes = original.wikiNotes;
      }
    }

    console.log(`✅ Wiki data merged`);

    if (options.json) {
      mkdirSync('./out', { recursive: true });
      const outPath = `./out/${taskTypeDefinition.taskJsonName}.min.json`;
      writeFileSync(outPath, JSON.stringify(updatedTasks));
      console.log(`💾 Written to ${outPath}`);
    } else {
      console.log(JSON.stringify(updatedTasks, null, 2));
    }

    console.log('✨ Wiki data update complete!');
  }

  public async handleJoinLocation(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypeName: string = options.type ?? 'LEAGUE_6';

    const tasksPath = options.input
      ? path.resolve(process.cwd(), options.input)
      : path.join(taskJsonStoreDir, 'tasks', `${taskTypeName}.min.json`);
    const locationsPath = options.locations
      ? path.resolve(process.cwd(), options.locations)
      : path.join(process.cwd(), 'out', `${taskTypeName}-locations.json`);

    if (!existsSync(tasksPath)) {
      throw new Error(`Tasks file not found: ${tasksPath}`);
    }
    if (!existsSync(locationsPath)) {
      throw new Error(`Locations file not found: ${locationsPath} — run map-location first (or place the file in ./out/)`);
    }

    const tasks: any[] = JSON.parse(readFileSync(tasksPath, 'utf-8'));
    const locationEntries: { dbRowId: number; location: { x: number; y: number; plane: number } }[] =
      JSON.parse(readFileSync(locationsPath, 'utf-8'));

    const locationByDbRowId = new Map(locationEntries.map((l) => [l.dbRowId, l.location]));

    const merged = tasks.map((task) => {
      const location = locationByDbRowId.get(task.dbRowId);
      return location ? { ...task, location } : task;
    });

    const matched = merged.filter((t) => t.location).length;
    console.log(`✅ Joined location data onto ${matched} / ${merged.length} tasks`);

    if (options.json) {
      mkdirSync('./out', { recursive: true });
      const outPath = `./out/${taskTypeName}.min.json`;
      writeFileSync(outPath, JSON.stringify(merged));
      console.log(`💾 Written to ${outPath}`);
    } else {
      console.log(JSON.stringify(merged, null, 2));
    }
  }

  public async handleMapBossKc(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypeName: string = options.type ?? 'LEAGUE_6';
    const tasksPath = path.join(taskJsonStoreDir, 'tasks', `${taskTypeName}.min.json`);

    if (!existsSync(tasksPath)) {
      throw new Error(`Tasks file not found: ${tasksPath}`);
    }

    const tasks: any[] = JSON.parse(readFileSync(tasksPath, 'utf-8'));
    const kcPattern = /\b(\d+)\s+time/i;
    const defeatPattern = /\b(defeat|kill)\b/i;

    console.log('🔍 Deriving boss KC varps from cache...');
    const method: string = options.method ?? 'ca';
    const bossKcVarps =
      method === 'clog' ? await this.deriveBossKcVarpsFromClog() :
      method === 'gameval' ? await this.deriveBossKcVarpsFromGameVals() :
      await this.deriveBossKcVarps();
    console.log(`   Found ${bossKcVarps.size} boss→varp mappings (method: ${method})`);

    type BossKcMapEntry = { varpId: number; target: number; dbRowId: number };
    const mapEntries: BossKcMapEntry[] = [];
    let skipped = 0;

    await Promise.all(
      tasks.map(async (task) => {
        const dbrow: DBRow = await this.dbrowService.getDBRow(task.dbRowId);
        if (!dbrow?.values) return;

        const name: string = (dbrow.values[1]?.[0] as string) ?? '';
        if (!defeatPattern.test(name)) { skipped++; return; }

        const kcMatch = kcPattern.exec(name);
        const target = kcMatch ? parseInt(kcMatch[1], 10) : null;
        if (!target) { skipped++; return; }

        let matchedBoss: string | null = null;
        let varpId: number | null = null;
        for (const [boss, id] of bossKcVarps) {
          if (name.toLowerCase().includes(boss.toLowerCase())) {
            matchedBoss = boss;
            varpId = id;
            break;
          }
        }
        if (!matchedBoss || varpId === null) { skipped++; return; }

        console.log(`  ✔ ${task.dbRowId}  [${matchedBoss} varp=${varpId} target=${target}]  ${name}`);
        mapEntries.push({ varpId, target, dbRowId: task.dbRowId });
      }),
    );

    console.log(`\n✅ Mapped ${mapEntries.length} boss KC entries  (${skipped} skipped — no boss match or no target)`);
    mkdirSync('./out', { recursive: true });
    const outPath = `./out/${taskTypeName}-boss-kc-map.json`;
    writeFileSync(outPath, JSON.stringify(mapEntries, null, 2));
    console.log(`💾 Written to ${outPath}`);
  }

  public async handleApplyBossKc(options: any): Promise<void> {
    const taskJsonStoreDir = path.resolve(process.cwd(), '../task-json-store');
    const taskTypeName: string = options.type ?? 'LEAGUE_6';
    const tasksPath = options.input
      ? path.resolve(process.cwd(), options.input)
      : path.join(taskJsonStoreDir, 'tasks', `${taskTypeName}.min.json`);
    const mapPath = path.join(process.cwd(), 'out', `${taskTypeName}-boss-kc-map.json`);

    if (!existsSync(tasksPath)) throw new Error(`Tasks file not found: ${tasksPath}`);
    if (!existsSync(mapPath)) throw new Error(`Boss KC map not found: ${mapPath} — run map-boss-kc first`);

    const tasks: any[] = JSON.parse(readFileSync(tasksPath, 'utf-8'));
    type BossKcMapEntry = { varpId: number; target: number; dbRowId: number };
    const bossKcMap: BossKcMapEntry[] = JSON.parse(readFileSync(mapPath, 'utf-8'));

    const mapByDbRowId = new Map(bossKcMap.map(e => [e.dbRowId, e]));
    const updated = tasks.map(task => {
      const entry = mapByDbRowId.get(task.dbRowId);
      if (!entry) return task;
      return { ...task, progress: [{ type: 'VARP', id: entry.varpId, target: entry.target }] };
    });

    const patched = updated.filter((t, i) => t !== tasks[i]).length;
    console.log(`✅ Applied ${patched} boss KC progress entries (${bossKcMap.length} entries in map)`);

    if (options.json) {
      mkdirSync('./out', { recursive: true });
      const outPath = `./out/${taskTypeName}.min.json`;
      writeFileSync(outPath, JSON.stringify(updated));
      console.log(`💾 Written to ${outPath}`);
    } else {
      console.log(JSON.stringify(updated, null, 2));
    }
  }
}
