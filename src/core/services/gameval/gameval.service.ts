import { CacheProvider, GameVal, Reader } from '@abextm/cache2';
import { Inject, Injectable } from '@nestjs/common';

// GAMEVALS index (24), archive IDs from GameValLoader.java
const GAMEVAL_INDEX = 24;
const GAMEVAL_VARPS_ARCHIVE = 3;
const GAMEVAL_VARBITS_ARCHIVE = 4;

// Varbit config: index 2 (configs), archive 14 (Js5ConfigGroup.VARBIT)
const CONFIG_INDEX = 2;
const VARBIT_CONFIG_ARCHIVE = 14;

export interface VarpDefinition {
  id: number;
  name: string | undefined;
}

export interface VarbitDefinition {
  id: number;
  name: string | undefined;
  baseVarpId: number;
  lsb: number;
  msb: number;
  /** msb - lsb + 1 */
  bitLength: number;
  /** 2^bitLength - 1 */
  maxValue: number;
}

@Injectable()
export class GameValService {
  constructor(@Inject('CacheProvider') private readonly cacheProvider: CacheProvider) {}

  // ── Varps ──────────────────────────────────────────────────────────────────

  public async getAllVarps(): Promise<VarpDefinition[]> {
    const gameVals = await GameVal.all(this.cacheProvider, GAMEVAL_VARPS_ARCHIVE as any);
    if (!gameVals) return [];
    const result: VarpDefinition[] = [];
    for (const [id, gv] of gameVals) {
      result.push({ id, name: gv.name || undefined });
    }
    return result.sort((a, b) => a.id - b.id);
  }

  public async getVarpsByNamePrefix(prefix: string): Promise<VarpDefinition[]> {
    const lower = prefix.toLowerCase();
    return (await this.getAllVarps()).filter(v => v.name?.toLowerCase().startsWith(lower));
  }

  public async getVarpNameMap(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    for (const v of await this.getAllVarps()) {
      if (v.name) map.set(v.name, v.id);
    }
    return map;
  }

  // ── Varbits ────────────────────────────────────────────────────────────────

  public async getAllVarbits(): Promise<VarbitDefinition[]> {
    const [nameMap, configArchive] = await Promise.all([
      this.loadVarbitNames(),
      this.cacheProvider.getArchive(CONFIG_INDEX, VARBIT_CONFIG_ARCHIVE),
    ]);

    if (!configArchive) {
      throw new Error(`Could not load varbit config archive (index=${CONFIG_INDEX}, archive=${VARBIT_CONFIG_ARCHIVE})`);
    }

    const result: VarbitDefinition[] = [];
    for (const [fileId, file] of configArchive.getFiles()) {
      const def = this.decodeVarbit(fileId, file.data);
      if (def) {
        def.name = nameMap.get(fileId);
        result.push(def);
      }
    }
    return result.sort((a, b) => a.id - b.id);
  }

  public async getVarbitsByNamePrefix(prefix: string): Promise<VarbitDefinition[]> {
    const lower = prefix.toLowerCase();
    return (await this.getAllVarbits()).filter(v => v.name?.toLowerCase().startsWith(lower));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async loadVarbitNames(): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    const gameVals = await GameVal.all(this.cacheProvider, GAMEVAL_VARBITS_ARCHIVE as any);
    if (gameVals) {
      for (const [id, gv] of gameVals) {
        if (gv.name) map.set(id, gv.name);
      }
    }
    return map;
  }

  /**
   * Decodes a varbit config entry (mirrors VarbitLoader.java):
   *   opcode 1 → u16 (baseVarpId), u8 (lsb), u8 (msb)
   *   opcode 0 → end
   */
  private decodeVarbit(id: number, data: Uint8Array): VarbitDefinition | null {
    const r = new Reader(data);
    let baseVarpId = 0;
    let lsb = 0;
    let msb = 0;

    for (;;) {
      const opcode = r.u8();
      if (opcode === 0) break;
      if (opcode === 1) {
        baseVarpId = r.u16();
        lsb = r.u8();
        msb = r.u8();
      }
    }

    const bitLength = msb - lsb + 1;
    return { id, name: undefined, baseVarpId, lsb, msb, bitLength, maxValue: (1 << bitLength) - 1 };
  }
}
