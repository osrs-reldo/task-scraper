import { Injectable, Inject } from '@nestjs/common';
import { ScriptService, ScriptMetadata } from './script.service';
import { ScriptInstruction } from './commands';

export interface VariableReference {
  type: 'varp' | 'varbit' | 'varc';
  varId: number;
  operation: 'read' | 'write' | 'testbit';
  bitIndex?: number;
  instruction: ScriptInstruction;
}

export interface ScriptAnalysis {
  scriptId: number;
  variableReferences: VariableReference[];
  varps: number[];
  varbits: number[];
  varcs: number[];
  patterns: {
    isCombatAchievementPattern: boolean;
    hasSwitch: boolean;
    hasTestbitOperations: boolean;
  };
}

@Injectable()
export class ScriptAnalysisService {
  constructor(
    @Inject(ScriptService) private readonly scriptService: ScriptService
  ) {}

  /**
   * Analyze a script and extract all variable references
   */
  public async analyzeScript(scriptId: number): Promise<ScriptAnalysis> {
    const metadata = await this.scriptService.getScriptMetadata(scriptId);
    if (!metadata) {
      throw new Error(`Script ${scriptId} not found`);
    }

    const instructions = this.scriptService.parseInstructions(metadata);
    const variableReferences = this.extractVariableReferences(instructions);
    
    const varps = [...new Set(variableReferences
      .filter(ref => ref.type === 'varp')
      .map(ref => ref.varId)
    )].sort((a, b) => a - b);

    const varbits = [...new Set(variableReferences
      .filter(ref => ref.type === 'varbit')
      .map(ref => ref.varId)
    )].sort((a, b) => a - b);

    const varcs = [...new Set(variableReferences
      .filter(ref => ref.type === 'varc')
      .map(ref => ref.varId)
    )].sort((a, b) => a - b);

    const patterns = this.detectPatterns(instructions, variableReferences);

    return {
      scriptId,
      variableReferences,
      varps,
      varbits,
      varcs,
      patterns
    };
  }

  /**
   * Extract variable references from script instructions
   */
  private extractVariableReferences(instructions: ScriptInstruction[]): VariableReference[] {
    const references: VariableReference[] = [];

    for (const instruction of instructions) {
      const varRef = this.extractVariableFromInstruction(instruction);
      if (varRef) {
        references.push(varRef);
      }
    }

    return references;
  }

  /**
   * Extract variable reference from a single instruction
   */
  private extractVariableFromInstruction(instruction: ScriptInstruction): VariableReference | null {
    const opcode = instruction.opcode;
    const operand = instruction.operand;

    switch (opcode) {
      case 1: // push_var (read varp)
        return {
          type: 'varp',
          varId: operand?.var || operand,
          operation: 'read',
          instruction
        };

      case 2: // pop_var (write varp)
        return {
          type: 'varp',
          varId: operand?.var || operand,
          operation: 'write',
          instruction
        };

      case 25: // push_varbit (read varbit)
        return {
          type: 'varbit',
          varId: operand?.var || operand,
          operation: 'read',
          instruction
        };

      case 27: // pop_varbit (write varbit)
        return {
          type: 'varbit',
          varId: operand?.var || operand,
          operation: 'write',
          instruction
        };

      case 42: // push_varc_int (read varc)
      case 49: // push_varc_string (read varc string)
        return {
          type: 'varc',
          varId: operand?.var || operand,
          operation: 'read',
          instruction
        };

      case 43: // pop_varc_int (write varc)
      case 50: // pop_varc_string (write varc string)
        return {
          type: 'varc',
          varId: operand?.var || operand,
          operation: 'write',
          instruction
        };

      case 4010: // testbit
        // testbit operates on stack values, the actual varp being tested
        // is captured by the preceding iload %varp instruction
        // Skip this instruction to avoid false positives
        return null;

      default:
        return null;
    }
  }

  /**
   * Detect common patterns in the script
   */
  private detectPatterns(instructions: ScriptInstruction[], variableReferences: VariableReference[]): {
    isCombatAchievementPattern: boolean;
    hasSwitch: boolean;
    hasTestbitOperations: boolean;
  } {
    const hasSwitchInstruction = instructions.some(inst => 
      inst.opcode === 60 || inst.opcode === 256 // switch or switch_alt
    );

    const hasTestbitOperations = instructions.some(inst => 
      inst.opcode === 4010 // testbit
    );

    // Combat Achievement pattern: switch + testbit + multiple sequential varps
    const varpIds = variableReferences
      .filter(ref => ref.type === 'varp')
      .map(ref => ref.varId)
      .filter(id => id > 0); // Filter out invalid IDs

    const hasSequentialVarps = this.hasSequentialNumbers(varpIds);
    const isCombatAchievementPattern = hasSwitchInstruction && hasTestbitOperations && hasSequentialVarps;

    return {
      isCombatAchievementPattern,
      hasSwitch: hasSwitchInstruction,
      hasTestbitOperations
    };
  }

  /**
   * Check if an array of numbers contains sequential ranges
   */
  private hasSequentialNumbers(numbers: number[]): boolean {
    if (numbers.length < 3) return false;
    
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    let consecutiveCount = 1;
    
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i-1] + 1) {
        consecutiveCount++;
        if (consecutiveCount >= 3) return true;
      } else {
        consecutiveCount = 1;
      }
    }
    
    return false;
  }

  /**
   * Generate task varps automatically from script analysis
   */
  public async generateTaskVarps(scriptId: number): Promise<number[]> {
    const analysis = await this.analyzeScript(scriptId);
    
    if (analysis.patterns.isCombatAchievementPattern) {
      console.log(`✅ Detected Combat Achievement pattern in script ${scriptId}`);
      console.log(`📊 Found ${analysis.varps.length} varps: ${analysis.varps.join(', ')}`);
      return analysis.varps;
    } else {
      console.log(`ℹ️  Script ${scriptId} doesn't match Combat Achievement pattern`);
      console.log(`📊 Found ${analysis.varps.length} varps anyway: ${analysis.varps.join(', ')}`);
      console.log(`🔍 Pattern analysis:`, analysis.patterns);
      return analysis.varps;
    }
  }
}
