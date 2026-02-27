import { CacheProvider } from '@abextm/cache2';
import { Inject, Injectable } from '@nestjs/common';
import { Reader } from '@abextm/cache2';
import { 
  OpcodeRegistry, 
  ScriptInstruction
} from './commands';
import { Rs2asmFormatter, Rs2asmFormatOptions } from './rs2asm-formatter';

export interface ScriptMetadata {
  id: number;
  name?: string;
  localCountInt: number;
  localCountObject: number;
  argumentCountInt: number;
  argumentCountObject: number;
  codeLength: number;
  rawData: Uint8Array;
  switchData?: SwitchData[];
}

export interface SwitchData {
  switchIndex: number;
  cases: SwitchCase[];
}

export interface SwitchCase {
  value: number;
  offset: number;
}

export interface ParsedScript {
  metadata: ScriptMetadata;
  instructions: ScriptInstruction[];
}

@Injectable()
export class ScriptService {
  private static readonly CLIENTSCRIPTS_ARCHIVE_ID = 12;
  // This should be determined from cache version, but we'll use a reasonable default
  private static readonly CACHE_VERSION = 233; // Current live version as of latest update

  constructor(@Inject('CacheProvider') private readonly cacheProvider: CacheProvider) {}

  /**
   * Get all available script IDs
   */
  public async getAllScriptIds(): Promise<number[]> {
    try {
      const archives = await this.cacheProvider.getArchives(ScriptService.CLIENTSCRIPTS_ARCHIVE_ID);
      return archives || [];
    } catch (error) {
      console.error('Error getting script IDs:', error);
      return [];
    }
  }

  /**
   * Get raw script data by ID
   */
  public async getScriptData(scriptId: number): Promise<Uint8Array | null> {
    try {
      const archive = await this.cacheProvider.getArchive(ScriptService.CLIENTSCRIPTS_ARCHIVE_ID, scriptId);
      if (!archive) {
        return null;
      }

      const file = archive.getFile(0); // Scripts typically have a single file with ID 0
      return file?.data || null;
    } catch (error) {
      console.error(`Error getting script data for ID ${scriptId}:`, error);
      return null;
    }
  }

  /**
   * Parse script metadata from raw data (updated to match Java CompiledScript.decode)
   */
  public parseScriptMetadata(scriptId: number, data: Uint8Array): ScriptMetadata {
    const reader = new Reader(data);
    
    // Calculate header size based on cache version
    let headerSize = 12; // Base header: 4 bytes code length + 4*2 bytes counts
    let switchData: SwitchData[] | undefined;
    
    // For version >= 140, there's additional switch data at the end
    if (ScriptService.CACHE_VERSION >= 140) {
      reader.offset = data.length - 2;
      const switchDataSize = reader.u16();
      headerSize += 2 + switchDataSize; // 2 bytes for the size + the actual switch data
    }
    
    const headerPos = data.length - headerSize;
    
    if (headerPos < 0 || headerPos >= data.length) {
      throw new Error(`Invalid header position for script ${scriptId}: ${headerPos}, data length: ${data.length}, header size: ${headerSize}`);
    }
    
    // Read the header from the calculated position
    reader.offset = headerPos;
    
    const codeLength = reader.i32(); // This is actually the instruction count, not byte length
    const localCountInt = reader.u16();
    const localCountObject = reader.u16();
    const argumentCountInt = reader.u16();
    const argumentCountObject = reader.u16();

    // Read switch data if present (version >= 140)
    if (ScriptService.CACHE_VERSION >= 140) {
      const switchCount = reader.u8();
      switchData = [];
      
      for (let i = 0; i < switchCount; i++) {
        const caseCount = reader.u16();
        const cases: SwitchCase[] = [];
        
        for (let j = 0; j < caseCount; j++) {
          const value = reader.i32();
          const offset = reader.i32();
          cases.push({ value, offset });
        }
        
        switchData.push({ switchIndex: i, cases });
      }
    }

    // Validate the parsed values
    if (codeLength < 0 || codeLength > 100000) {
      throw new Error(`Invalid code length for script ${scriptId}: ${codeLength}`);
    }
    
    if (localCountInt > 1000 || localCountObject > 1000) {
      throw new Error(`Invalid local counts for script ${scriptId}: int=${localCountInt}, object=${localCountObject}`);
    }

    if (argumentCountInt > 1000 || argumentCountObject > 1000) {
      throw new Error(`Invalid argument counts for script ${scriptId}: int=${argumentCountInt}, object=${argumentCountObject}`);
    }

    // Read script name from the beginning (using gjstrnull equivalent)
    reader.offset = 0;
    let name: string | undefined;
    try {
      // Read first byte to check if name exists
      const firstByte = reader.u8();
      if (firstByte === 0) {
        // No name present
        name = undefined;
        reader.offset = 1; // Move past the null byte
      } else {
        // Name present, reset and read it
        reader.offset = 0;
        const nameBytes: number[] = [];
        let byte: number;
        
        while (reader.offset < headerPos && (byte = reader.u8()) !== 0) {
          nameBytes.push(byte);
        }
        
        if (nameBytes.length > 0 && nameBytes.length <= 100) {
          // Convert bytes to string (assuming CP1252/ASCII)
          name = String.fromCharCode(...nameBytes);
          // Validate the name
          if (name.includes('\uFFFD') || !/^[a-zA-Z0-9_\-\/]+$/.test(name)) {
            name = undefined;
          }
        }
      }
    } catch (error) {
      // If we can't read a string, there's probably no name
      name = undefined;
    }

    return {
      id: scriptId,
      name,
      localCountInt,
      localCountObject,
      argumentCountInt,
      argumentCountObject,
      codeLength,
      rawData: data,
      switchData,
    };
  }

  /**
   * Get basic script metadata without full parsing
   */
  public async getScriptMetadata(scriptId: number): Promise<ScriptMetadata | null> {
    const data = await this.getScriptData(scriptId);
    if (!data) {
      return null;
    }

    return this.parseScriptMetadata(scriptId, data);
  }

  /**
   * Get metadata for all scripts
   */
  public async getAllScriptMetadata(): Promise<ScriptMetadata[]> {
    const scriptIds = await this.getAllScriptIds();
    const metadata: ScriptMetadata[] = [];

    for (const scriptId of scriptIds) {
      try {
        const meta = await this.getScriptMetadata(scriptId);
        if (meta) {
          metadata.push(meta);
        }
      } catch (error) {
        console.warn(`Error getting metadata for script ${scriptId}:`, error.message);
        // Continue processing other scripts
      }
    }

    return metadata.sort((a, b) => a.id - b.id);
  }

  /**
   * Search scripts by name
   */
  public async findScriptsByName(searchTerm: string): Promise<ScriptMetadata[]> {
    const allMetadata = await this.getAllScriptMetadata();
    return allMetadata.filter(script => 
      script.name && script.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  /**
   * Parse instructions from script data (updated to match Java implementation)
   */
  public parseInstructions(metadata: ScriptMetadata): ScriptInstruction[] {
    const reader = new Reader(metadata.rawData);
    const instructions: ScriptInstruction[] = [];

    // Skip script name using gjstrnull equivalent
    reader.offset = 0;
    const scriptName = this.readNullTerminatedString(reader, metadata);
    
    // Calculate code end position
    const headerSize = this.calculateHeaderSize(metadata.rawData);
    const headerPos = metadata.rawData.length - headerSize;
    
    let instructionIndex = 0;
    while (reader.offset < headerPos && instructionIndex < metadata.codeLength) {
      try {
        const currentOffset = reader.offset;
        
        // Check if we have enough bytes for an opcode
        if (reader.offset + 2 > headerPos) {
          break;
        }
        
        const opcode = reader.u16();
        const opcodeName = OpcodeRegistry.getOpcodeName(opcode);
        
        if (!OpcodeRegistry.getOpcode(opcode)) {
          console.warn(`Unknown opcode ${opcode} at offset ${currentOffset} in script ${metadata.id}`);
          // Try to continue by advancing past this opcode
          continue;
        }

        const instruction: ScriptInstruction = {
          opcode,
          name: opcodeName,
          address: instructionIndex,
        };

        // Parse operand based on opcode using updated logic
        instruction.operand = this.parseOperand(reader, opcode, instructionIndex, metadata.switchData, headerPos);

        instructions.push(instruction);
        instructionIndex++;
        
        // Safety check to prevent infinite loops
        if (instructionIndex > 100000) {
          console.warn(`Too many instructions parsed for script ${metadata.id}, stopping at ${instructionIndex}`);
          break;
        }
      } catch (error) {
        console.warn(`Error parsing instruction at offset ${reader.offset} for script ${metadata.id}:`, error.message);
        break;
      }
    }

    console.log(`Script ${metadata.id}: parsed ${instructions.length} instructions (expected ${metadata.codeLength})`);
    return instructions;
  }

  /**
   * Read null-terminated string (gjstrnull equivalent)
   */
  private readNullTerminatedString(reader: Reader, metadata: ScriptMetadata): string | null {
    const headerSize = this.calculateHeaderSize(metadata.rawData);
    const headerPos = metadata.rawData.length - headerSize;
    
    if (metadata.rawData[reader.offset] === 0) {
      reader.offset++; // Skip null byte
      return null;
    }
    
    const nameBytes: number[] = [];
    while (reader.offset < headerPos) {
      const byte = reader.u8();
      if (byte === 0) break;
      nameBytes.push(byte);
    }
    
    if (nameBytes.length === 0) return null;
    return String.fromCharCode(...nameBytes);
  }

  /**
   * Parse operand for a specific command (updated to match Java CompiledScript.decodeOperand)
   */
  private parseOperand(reader: Reader, opcode: number, instructionIndex: number, switchData?: SwitchData[], codeEndPos?: number): any {
    if (codeEndPos && reader.offset >= codeEndPos) {
      return undefined;
    }

    try {
      // Follow the exact same logic as the Java implementation
      if (opcode === 0) { // PUSH_CONSTANT_INT
        return reader.i32(); // g4s()
      } else if (opcode === 1 || opcode === 2) { // PUSH_VAR || POP_VAR
        return { var: reader.i32() }; // g4s() -> VarPlayerReference
      } else if (opcode === 25 || opcode === 27) { // PUSH_VARBIT || POP_VARBIT
        return { var: reader.i32() }; // g4s() -> VarPlayerBitReference
      } else if (opcode === 42 || opcode === 43 || opcode === 49 || opcode === 50) { // PUSH_VARC_INT || POP_VARC_INT || PUSH_VARC_STRING || POP_VARC_STRING
        return { var: reader.i32(), isString: opcode === 49 || opcode === 50 }; // g4s() -> VarClientReference
      } else if (opcode === 47 || opcode === 48) { // PUSH_VARC_STRING_OLD || POP_VARC_STRING_OLD
        return { var: reader.i32() }; // g4s() -> VarClientStringReference
      } else if (opcode === 74) { // PUSH_VARCLANSETTING
        return reader.i32(); // g4s()
      } else if (opcode === 76) { // PUSH_VARCLAN
        return reader.i32(); // g4s()
      } else if (opcode === 3) { // PUSH_CONSTANT_STRING
        return reader.string(); // gjstr()
      } else if (opcode === 6 || opcode === 7 || opcode === 8 || opcode === 9 || opcode === 10 || opcode === 31 || opcode === 32) { // BRANCH commands
        return instructionIndex + reader.i32(); // g4s() for branch target (adjusted by current index)
      } else if (opcode === 33 || opcode === 34 || opcode === 35 || opcode === 36) { // Local variable commands
        return { domain: opcode === 33 || opcode === 34 ? 'integer' : 'string', local: reader.i32() }; // g4s() -> LocalReference
      } else if (opcode === 37) { // JOIN_STRING
        return reader.i32(); // g4s() - count
      } else if (opcode === 40) { // GOSUB_WITH_PARAMS
        return reader.i32(); // g4s() - script
      } else if (opcode === 44 || opcode === 45 || opcode === 46) { // DEFINE_ARRAY || PUSH_ARRAY_INT || POP_ARRAY_INT
        return reader.i32(); // g4s() - array
      } else if (opcode === 60) { // SWITCH
        const switchIndex = reader.i32(); // g4s() - switch index
        
        // Find the corresponding switch data
        if (switchData && switchData[switchIndex]) {
          const cases = switchData[switchIndex].cases.map(switchCase => ({
            value: switchCase.value,
            target: instructionIndex + switchCase.offset
          }));
          return cases; // Return array of value-target pairs
        }
        
        return switchIndex; // Fallback if no switch data available
      } else {
        // Default case uses g1() (8-bit unsigned)
        return reader.u8();
      }
    } catch (error) {
      console.warn(`Error parsing operand for opcode ${opcode}:`, error.message);
      return undefined;
    }
  }

  /**
   * Calculate header size including switch data (updated to match Java logic)
   */
  private calculateHeaderSize(data: Uint8Array): number {
    let headerSize = 12; // Base header: 4 bytes instruction count + 4*2 bytes counts
    
    if (ScriptService.CACHE_VERSION >= 140) {
      const reader = new Reader(data);
      reader.offset = data.length - 2;
      const switchDataSize = reader.u16();
      headerSize += 2 + switchDataSize; // Size field + switch data
    }
    
    return headerSize;
  }

  /**
   * Get fully parsed script (metadata + instructions)
   */
  public async getParsedScript(scriptId: number): Promise<ParsedScript | null> {
    const metadata = await this.getScriptMetadata(scriptId);
    if (!metadata) {
      return null;
    }

    const instructions = this.parseInstructions(metadata);
    
    return {
      metadata,
      instructions,
    };
  }

  /**
   * Get script as rs2asm assembly format
   */
  public async getScriptAsRs2asm(scriptId: number, options: Rs2asmFormatOptions = {}): Promise<string | null> {
    const parsed = await this.getParsedScript(scriptId);
    if (!parsed) {
      return null;
    }

    return Rs2asmFormatter.formatScript(parsed.metadata, parsed.instructions, options);
  }

  /**
   * Get script statistics
   */
  public async getScriptStatistics(): Promise<{
    totalScripts: number;
    namedScripts: number;
    avgCodeLength: number;
    avgArgumentCount: number;
  }> {
    const allMetadata = await this.getAllScriptMetadata();
    
    const totalScripts = allMetadata.length;
    const namedScripts = allMetadata.filter(s => s.name).length;
    const avgCodeLength = allMetadata.reduce((sum, s) => sum + s.codeLength, 0) / totalScripts;
    const avgArgumentCount = allMetadata.reduce((sum, s) => sum + s.argumentCountInt + s.argumentCountObject, 0) / totalScripts;

    return {
      totalScripts,
      namedScripts,
      avgCodeLength: Math.round(avgCodeLength),
      avgArgumentCount: Math.round(avgArgumentCount * 100) / 100,
    };
  }
}
