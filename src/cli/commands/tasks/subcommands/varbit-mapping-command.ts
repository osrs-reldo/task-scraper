import { DBRow } from "@abextm/cache2";
import { Injectable } from "@nestjs/common";
import { mkdirSync, writeFileSync } from "fs";
import { InteractivePrompt } from "src/cli/interactive-prompt.util";
import { GameValService } from "src/core/services/gameval/gameval.service";

export type VarbitMapEntry = { varbitName: string; varbitId: number; target: number; dbRowId: number };

@Injectable()
export class VarbitMappingCommand {
    constructor(
        private gameValService: GameValService,
        private dbrowService: any,
    ) { }

    public async mapVarbits(tasks: any[], taskTypeName: string, toReview: boolean = false): Promise<VarbitMapEntry[]> {
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
        if (toReview && needsReview.length > 0) {
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
        return mapEntries;
    }
}