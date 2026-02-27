import { 
  ScriptInstruction, 
  SwitchCase, 
  LocalReference, 
  VarPlayerReference, 
  VarPlayerBitReference, 
  VarClientReference,
  LocalDomain
} from './commands';
import { ScriptMetadata } from './script.service';

export interface Rs2asmFormatOptions {
  includeMetadata?: boolean;
  includeComments?: boolean;
  includeAddresses?: boolean;
  indentSize?: number;
}

export class Rs2asmFormatter {
  private static readonly DEFAULT_OPTIONS: Rs2asmFormatOptions = {
    includeMetadata: true,
    includeComments: true,
    includeAddresses: false,
    indentSize: 4,
  };

  /**
   * Format a complete script as rs2asm assembly
   */
  public static formatScript(
    metadata: ScriptMetadata, 
    instructions: ScriptInstruction[], 
    options: Rs2asmFormatOptions = {}
  ): string {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const lines: string[] = [];

    // Add metadata header if requested
    if (opts.includeMetadata) {
      lines.push(this.formatMetadataHeader(metadata));
      lines.push('');
    }

    // Format each instruction
    for (const instruction of instructions) {
      const formatted = this.formatInstruction(instruction, opts);
      if (formatted) {
        lines.push(formatted);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format script metadata as header comments
   */
  private static formatMetadataHeader(metadata: ScriptMetadata): string {
    const lines: string[] = [
      `// Script ${metadata.id}${metadata.name ? ` (${metadata.name})` : ''}`,
      `// Code length: ${metadata.codeLength} instructions`,
      `// Local variables: ${metadata.localCountInt} int, ${metadata.localCountObject} object`,
      `// Arguments: ${metadata.argumentCountInt} int, ${metadata.argumentCountObject} object`,
    ];
    return lines.join('\n');
  }

  /**
   * Format a single instruction
   */
  public static formatInstruction(instruction: ScriptInstruction, options: Rs2asmFormatOptions = {}): string {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const parts: string[] = [];

    // Add address if requested
    if (opts.includeAddresses && instruction.address !== undefined) {
      parts.push(`${instruction.address.toString().padStart(4, '0')}:`);
    }

    // Add instruction name
    const instructionPart = this.formatInstructionBody(instruction);
    parts.push(instructionPart);

    return parts.join(' ').trimEnd();
  }

  /**
   * Format the main instruction body (command + operand)
   */
  private static formatInstructionBody(instruction: ScriptInstruction): string {
    const opcode = instruction.opcode;
    const name = instruction.name;
    const operand = instruction.operand;

    // Special formatting for specific commands
    switch (opcode) {
      case 0: // push_constant_int
        return `iconst ${operand}`;
      
      case 1: // push_var
        return `iload ${this.formatVarPlayerReference(operand)}`;
      
      case 2: // pop_var
        return `istore ${this.formatVarPlayerReference(operand)}`;
      
      case 3: // push_constant_string
        return `sconst "${this.escapeString(operand)}"`;
      
      case 6: // branch
        return `goto ${operand}`;
      
      case 7: // branch_not
        return `ifne ${operand}`;
      
      case 8: // branch_equals
        return `ifeq ${operand}`;
      
      case 9: // branch_less_than
        return `iflt ${operand}`;
      
      case 10: // branch_greater_than
        return `ifgt ${operand}`;
      
      case 21: // return
        return 'return';
      
      case 25: // push_varbit
        return `iload_bit ${this.formatVarPlayerBitReference(operand)}`;
      
      case 27: // pop_varbit
        return `istore_bit ${this.formatVarPlayerBitReference(operand)}`;
      
      case 31: // branch_less_than_or_equals
        return `ifle ${operand}`;
      
      case 32: // branch_greater_than_or_equals
        return `ifge ${operand}`;
      
      case 33: // push_int_local
        return `iload_local ${this.formatLocalReference(operand)}`;
      
      case 34: // pop_int_local
        return `istore_local ${this.formatLocalReference(operand)}`;
      
      case 35: // push_string_local
        return `sload_local ${this.formatLocalReference(operand)}`;
      
      case 36: // pop_string_local
        return `sstore_local ${this.formatLocalReference(operand)}`;
      
      case 37: // join_string
        return 'join_string';
      
      case 38: // pop_int_discard
        return 'pop';
      
      case 39: // pop_string_discard
        return 'spop';
      
      case 40: // gosub_with_params
        return `gosub ${operand}`;
      
      case 42: // push_varc_int
        return `iload_varc ${this.formatVarClientReference(operand)}`;
      
      case 43: // pop_varc_int
        return `istore_varc ${this.formatVarClientReference(operand)}`;
      
      case 44: // define_array
        return `define_array ${operand.id} ${operand.type} ${operand.size}`;
      
      case 45: // push_array_int
        return `iload_array ${operand}`;
      
      case 46: // pop_array_int
        return `istore_array ${operand}`;
      
      case 47: // push_varc_string_old
        return `sload_varc_old ${this.formatVarClientReference(operand)}`;
      
      case 48: // pop_varc_string_old
        return `sstore_varc_old ${this.formatVarClientReference(operand)}`;
      
      case 49: // push_varc_string
        return `sload_varc ${this.formatVarClientReference(operand)}`;
      
      case 50: // pop_varc_string
        return `sstore_varc ${this.formatVarClientReference(operand)}`;
      
      case 60: // switch
        return this.formatSwitchInstruction(operand);
      
      case 63: // push_constant_null
        return 'null';
      
      case 74: // push_varclansetting
        return `iload_varclansetting ${operand}`;
      
      case 76: // push_varclan
        return `iload_varclan ${operand}`;
      
      // Math operations
      case 4000: // add
        return 'iadd';
      
      case 4001: // sub
        return 'isub';
      
      case 4002: // mul
        return 'imul';
      
      case 4003: // div
        return 'idiv';
      
      case 4004: // mod
        return 'imod';
      
      // String operations
      case 4100: // string_length
        return 'string_length';
      
      case 4101: // substring
        return 'substring';
      
      case 4102: // string_indexof_string
        return 'string_indexof_string';
      
      default:
        // For unknown commands, use the command name with operand
        if (operand !== undefined) {
          return `${name} ${operand}`;
        } else {
          return name;
        }
    }
  }

  /**
   * Format VarPlayer reference
   */
  private static formatVarPlayerReference(ref: { var: number }): string {
    return `%varp${ref.var}`;
  }

  /**
   * Format VarPlayerBit reference
   */
  private static formatVarPlayerBitReference(ref: { var: number }): string {
    return `%varbit${ref.var}`;
  }

  /**
   * Format VarClient reference
   */
  private static formatVarClientReference(ref: { var: number; isString: boolean }): string {
    const type = ref.isString ? 'string' : 'int';
    return `%varc_${type}${ref.var}`;
  }

  /**
   * Format local variable reference
   */
  private static formatLocalReference(ref: { domain: string; local: number }): string {
    const prefix = ref.domain === 'integer' ? '$int' : '$string';
    return `${prefix}${ref.local}`;
  }

  /**
   * Format switch instruction with jump table
   */
  private static formatSwitchInstruction(cases: SwitchCase[]): string {
    if (!Array.isArray(cases) || cases.length === 0) {
      return 'switch';
    }

    const caseStrings = cases.map(c => `${c.value}:${c.target}`);
    return `switch {${caseStrings.join(', ')}}`;
  }

  /**
   * Escape string literal for assembly output
   */
  private static escapeString(str: string): string {
    if (typeof str !== 'string') {
      return String(str);
    }
    
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  /**
   * Format instruction operand as human-readable string
   */
  public static formatOperand(operand: any): string {
    if (operand === undefined || operand === null) {
      return '';
    }

    if (typeof operand === 'object') {
      if ('var' in operand) {
        // Variable reference
        if ('isString' in operand) {
          return this.formatVarClientReference(operand);
        } else {
          return this.formatVarPlayerReference(operand);
        }
      } else if ('domain' in operand) {
        // Local reference
        return this.formatLocalReference(operand);
      } else if (Array.isArray(operand)) {
        // Switch cases (for when we implement switch properly)
        return `[${operand.length} cases]`;
      } else {
        // Generic object
        return JSON.stringify(operand);
      }
    }

    return String(operand);
  }
}
