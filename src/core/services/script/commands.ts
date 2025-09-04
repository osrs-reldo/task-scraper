// Simple opcode definition for decompilation
export interface OpcodeInfo {
  name: string;
  operands: number; // Number of operands this instruction takes
}

// Switch case for SWITCH instruction
export interface SwitchCase {
  value: number;
  target: number;
}

// Instruction with opcode and operand
export interface ScriptInstruction {
  opcode: number;
  name: string;
  operand?: any;
  address?: number; // Instruction address for debugging
}

// Local variable reference
export enum LocalDomain {
  INTEGER = 'integer',
  STRING = 'string',
  ARRAY = 'array',
}

export interface LocalReference {
  domain: LocalDomain;
  local: number;
}

// Various reference types
export interface VarPlayerReference {
  var: number;
}

export interface VarPlayerBitReference {
  var: number;
}

export interface VarClientReference {
  var: number;
  isString: boolean;
}

export interface VarClanSettingReference {
  var: number;
}

export interface VarClanReference {
  var: number;
}

// Simple opcode registry for decompilation
export class OpcodeRegistry {
  private static readonly opcodes = new Map<number, OpcodeInfo>();
  private static initialized = false;

  public static getOpcode(opcode: number): OpcodeInfo | undefined {
    if (!this.initialized) {
      this.initializeOpcodes();
    }
    return this.opcodes.get(opcode);
  }

  public static getOpcodeName(opcode: number): string {
    const info = this.getOpcode(opcode);
    return info ? info.name : `unknown_${opcode}`;
  }

  public static getOperandCount(opcode: number): number {
    const info = this.getOpcode(opcode);
    return info ? info.operands : 0;
  }

  private static define(opcode: number, name: string, operands: number = 0): void {
    this.opcodes.set(opcode, { name, operands });
  }

  private static initializeOpcodes(): void {
    // Core commands (0-76)
    this.define(0, 'push_constant_int', 1);
    this.define(1, 'push_var', 1);
    this.define(2, 'pop_var', 1);
    this.define(3, 'push_constant_string', 1);
    this.define(6, 'branch', 1);
    this.define(7, 'branch_not', 1);
    this.define(8, 'branch_equals', 1);
    this.define(9, 'branch_less_than', 1);
    this.define(10, 'branch_greater_than', 1);
    this.define(21, 'return');
    this.define(25, 'push_varbit', 1);
    this.define(27, 'pop_varbit', 1);
    this.define(31, 'branch_less_than_or_equals', 1);
    this.define(32, 'branch_greater_than_or_equals', 1);
    this.define(33, 'push_int_local', 1);
    this.define(34, 'pop_int_local', 1);
    this.define(35, 'push_string_local', 1);
    this.define(36, 'pop_string_local', 1);
    this.define(37, 'join_string');
    this.define(38, 'pop_int_discard');
    this.define(39, 'pop_string_discard');
    this.define(40, 'gosub_with_params', 1);
    this.define(42, 'push_varc_int', 1);
    this.define(43, 'pop_varc_int', 1);
    this.define(44, 'define_array', 1);
    this.define(45, 'push_array_int', 1);
    this.define(46, 'pop_array_int', 1);
    this.define(47, 'push_varc_string_old', 1);
    this.define(48, 'pop_varc_string_old', 1);
    this.define(49, 'push_varc_string', 1);
    this.define(50, 'pop_varc_string', 1);
    this.define(60, 'switch', 1);
    this.define(63, 'push_constant_null');
    this.define(74, 'push_varclansetting', 1);
    this.define(76, 'push_varclan', 1);

    // Switch alternate encoding
    this.define(256, 'switch_alt', 1);

    // Math commands (4000-4036)
    this.define(4000, 'add');
    this.define(4001, 'sub');
    this.define(4002, 'mul');
    this.define(4003, 'div');
    this.define(4004, 'mod');
    this.define(4005, 'rand');
    this.define(4006, 'randominc');
    this.define(4007, 'interpolate', 5);
    this.define(4008, 'addpercent', 2);
    this.define(4009, 'setbit', 2);
    this.define(4010, 'testbit', 2);
    this.define(4011, 'modulo');
    this.define(4012, 'pow', 2);
    this.define(4013, 'invpow', 2);
    this.define(4014, 'and');
    this.define(4015, 'or');
    this.define(4016, 'min', 2);
    this.define(4017, 'max', 2);
    this.define(4018, 'scale', 3);
    this.define(4019, 'abs');
    this.define(4020, 'append_num', 2);
    this.define(4021, 'append', 1);
    this.define(4022, 'lowermemory');
    this.define(4023, 'sqrt');
    this.define(4024, 'sq');
    this.define(4025, 'log');
    this.define(4026, 'sin');
    this.define(4027, 'cos');
    this.define(4028, 'atan2', 2);
    this.define(4029, 'distance', 4);
    this.define(4030, 'lineofwalk', 4);
    this.define(4031, 'pointinpolygon', 3);
    this.define(4032, 'lineofwalk_map', 4);
    this.define(4033, 'lineofsight', 4);
    this.define(4034, 'lineofsight_map', 4);
    this.define(4035, 'movetowards', 4);
    this.define(4036, 'seeddistribution', 3);

    // String commands (4100-4119)
    this.define(4100, 'string_length');
    this.define(4101, 'substring', 3);
    this.define(4102, 'string_indexof_string', 2);
    this.define(4103, 'string_indexof_char', 2);
    this.define(4104, 'append_char');
    this.define(4105, 'append_num');
    this.define(4106, 'append_signnum');
    this.define(4107, 'lowercase');
    this.define(4108, 'fromdate');
    this.define(4109, 'text_gender');
    this.define(4110, 'tostring');
    this.define(4111, 'compare');
    this.define(4112, 'paraheight', 3);
    this.define(4113, 'parawidth', 3);
    this.define(4114, 'text_switch', 2);
    this.define(4115, 'escape');
    this.define(4116, 'append_capped', 1);
    this.define(4117, 'char_isprintable');
    this.define(4118, 'char_isalphanumeric');
    this.define(4119, 'char_isalpha');

    // Misc commands (common ones from 3100+ range)
    this.define(3100, 'mes', 1);
    this.define(3101, 'anim', 2);
    this.define(3102, 'mes_typed', 2);
    this.define(3103, 'if_close');
    this.define(3104, 'resume_countdialog', 1);
    this.define(3105, 'resume_namedialog', 1);
    this.define(3106, 'resume_stringdialog', 1);
    this.define(3107, 'opplayer', 2);
    this.define(3108, 'if_dragpickup', 3);
    this.define(3109, 'cc_dragpickup', 2);
    this.define(3110, 'setmousecam', 1);
    this.define(3111, 'getremoveroofs', 0);
    this.define(3112, 'setremoveroofs', 1);
    this.define(3113, 'openurl', 2);

    // Client commands
    this.define(3300, 'clientclock');
    this.define(3301, 'inv_getobj', 2);
    this.define(3302, 'inv_getnum', 2);
    this.define(3303, 'inv_total', 2);
    this.define(3304, 'inv_size', 1);
    this.define(3305, 'stat', 1);
    this.define(3306, 'stat_base', 1);
    this.define(3307, 'stat_visible_xp', 1);
    this.define(3308, 'coord');
    this.define(3309, 'coordx', 1);
    this.define(3310, 'coordy', 1);
    this.define(3311, 'coordz', 1);
    this.define(3312, 'map_members');

    // Unknown opcodes found in scripts
    this.define(8448, 'unknown_8448');

    this.initialized = true;
  }
}

