import { CacheProvider } from '@abextm/cache2';
import { Inject, Injectable } from '@nestjs/common';
import { Reader } from '@abextm/cache2';

export interface ScriptMetadata {
  id: number;
  name?: string;
  localCountInt: number;
  localCountObject: number;
  argumentCountInt: number;
  argumentCountObject: number;
  codeLength: number;
  rawData: Uint8Array;
}

export interface ScriptInstruction {
  opcode: number;
  operand?: any;
}

export interface ParsedScript {
  metadata: ScriptMetadata;
  instructions: ScriptInstruction[];
}

@Injectable()
export class ScriptService {
  private static readonly CLIENTSCRIPTS_ARCHIVE_ID = 12;

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
   * Parse script metadata from raw data
   */
  public parseScriptMetadata(scriptId: number, data: Uint8Array): ScriptMetadata {
    const reader = new Reader(data);
    
    // Based on zwyz CompiledScript.decode implementation
    // First, determine header size (varies based on version >= 140)
    let headerSize = 12; // Base header: 4 bytes code length + 2*4 bytes counts
    
    // For version >= 140, there's additional switch data at the end
    // We need to read backwards from the end to find the actual header size
    reader.offset = data.length - 2;
    const switchDataSize = reader.u16();
    headerSize += 2 + switchDataSize; // 2 bytes for the size + the actual switch data
    
    const headerPos = data.length - headerSize;
    
    if (headerPos < 0 || headerPos >= data.length) {
      throw new Error(`Invalid header position for script ${scriptId}: ${headerPos}, data length: ${data.length}, header size: ${headerSize}`);
    }
    
    // Read the header from the calculated position
    reader.offset = headerPos;
    
    const codeLength = reader.i32();
    const localCountInt = reader.u16();
    const localCountObject = reader.u16();
    const argumentCountInt = reader.u16();
    const argumentCountObject = reader.u16();

    // Validate the parsed values make sense
    if (codeLength < 0 || codeLength > 100000) {
      throw new Error(`Invalid code length for script ${scriptId}: ${codeLength}`);
    }
    
    if (localCountInt > 1000 || localCountObject > 1000) {
      throw new Error(`Invalid local counts for script ${scriptId}: int=${localCountInt}, object=${localCountObject}`);
    }

    if (argumentCountInt > 1000 || argumentCountObject > 1000) {
      throw new Error(`Invalid argument counts for script ${scriptId}: int=${argumentCountInt}, object=${argumentCountObject}`);
    }

    // Read script name from the beginning (if present)
    reader.offset = 0;
    let name: string | undefined;
    try {
      // The Java code uses gjstrnull() which reads a null-terminated string or returns null
      const nameBytes: number[] = [];
      while (reader.offset < headerPos) {
        const byte = reader.u8();
        if (byte === 0) break;
        nameBytes.push(byte);
      }
      
      if (nameBytes.length > 0) {
        // Convert bytes to string (assuming UTF-8/ASCII)
        name = String.fromCharCode(...nameBytes);
        // If the name seems invalid, treat as no name
        if (name.length > 100 || name.includes('\uFFFD')) {
          name = undefined;
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
   * Parse basic instructions from script data (Phase 1 - basic implementation)
   */
  public parseBasicInstructions(metadata: ScriptMetadata): ScriptInstruction[] {
    const reader = new Reader(metadata.rawData);
    const instructions: ScriptInstruction[] = [];

    // Skip script name at the beginning
    reader.offset = 0;
    try {
      reader.string(); // Skip name
    } catch (error) {
      // If there's no name, offset stays at 0
      reader.offset = 0;
    }

    // Read instructions until we hit the header
    const headerSize = 12; // Simplified for Phase 1
    const headerPos = metadata.rawData.length - headerSize;

    let instructionCount = 0;
    while (reader.offset < headerPos && instructionCount < metadata.codeLength) {
      try {
        const opcode = reader.u16();
        const instruction: ScriptInstruction = { opcode };
        
        // Basic operand reading - this will be enhanced in Phase 2
        // For now, we'll use a very simplified approach
        if (opcode < 100) {
          // Most basic commands might have int operands
          if (reader.offset + 4 <= headerPos) {
            instruction.operand = reader.i32();
          }
        } else if (opcode < 200) {
          // Other commands might have byte operands
          if (reader.offset + 1 <= headerPos) {
            instruction.operand = reader.u8();
          }
        }

        instructions.push(instruction);
        instructionCount++;
      } catch (error) {
        // If we can't parse more instructions, break
        console.warn(`Error parsing instruction ${instructionCount} at offset ${reader.offset} for script ${metadata.id}:`, error.message);
        break;
      }
    }

    return instructions;
  }

  /**
   * Get fully parsed script (metadata + instructions)
   */
  public async getParsedScript(scriptId: number): Promise<ParsedScript | null> {
    const metadata = await this.getScriptMetadata(scriptId);
    if (!metadata) {
      return null;
    }

    const instructions = this.parseBasicInstructions(metadata);
    
    return {
      metadata,
      instructions,
    };
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
