import { DBRow, ParamID } from "@abextm/cache2";
import { Injectable } from "@nestjs/common";
import { DBRowService } from "src/core/services/dbrow/dbrow.service";
import { GameValService } from "src/core/services/gameval/gameval.service";
import { ScriptService } from "src/core/services/script/script.service";
import { StructService } from "src/core/services/struct/struct.service";

export type BossKcMapEntry = { varpId: number; target: number; dbRowId: number };
export type BossKcMapResult = { mapEntries: BossKcMapEntry[]; skipped: number };

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

const kcPattern = /\b(\d+)\s+time/i;
const defeatPattern = /\b(defeat|kill)\b/i;

@Injectable()
export class BossKcVarpsCommand {
    constructor(
        private structService: StructService,
        private scriptService: ScriptService,
        private dbrowService: DBRowService,
        private gameValService: GameValService
    ) { }

    public async getBossKcVarps(tasks: any[], method: string): Promise<BossKcMapResult> {
        const mapEntries: BossKcMapEntry[] = [];
        const bossKcVarps =
            method === 'clog' ? await this.deriveBossKcVarpsFromClog() :
                method === 'gameval' ? await this.deriveBossKcVarpsFromGameVals() :
                    await this.deriveBossKcVarps();
        console.log(`   Found ${bossKcVarps.size} boss→varp mappings (method: ${method})`);

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
        return { mapEntries, skipped };
    }

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
}