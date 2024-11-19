import { CacheProvider, Enum, ScriptVarType } from '@abextm/cache2';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class EnumService {
  constructor(@Inject('CacheProvider') private readonly cacheProvider: CacheProvider) {}

  public getEnum(id: number): Promise<Enum> {
    console.info('getEnum', id);
    return Enum.load(this.cacheProvider, id);
  }

  public async findEnumsByString(searchString: string): Promise<Enum[]> {
    const all: Enum[] = await Enum.all(this.cacheProvider);
    all.sort((a, b) => a.id - b.id);
    const found: Enum[] = all.filter((anEnum) => {
      if (anEnum.valueTypeChar !== ScriptVarType.string.char) {
        return false;
      }
      for (const [_k, v] of anEnum.map.entries()) {
        if (typeof v !== 'string') {
          throw new Error('not a string searchable enum');
          continue;
        }
        if (v.toLowerCase().includes(searchString.toLowerCase())) {
          return true;
        }
      }
      return false;
    });
    return found;
  }

  public async findEnumsByStruct(searchStructId: number): Promise<Enum[]> {
    const all: Enum[] = await Enum.all(this.cacheProvider);
    all.sort((a, b) => a.id - b.id);
    const found: Enum[] = all.filter((anEnum) => {
      if (anEnum.valueTypeChar !== ScriptVarType.struct.char) {
        return false;
      }
      for (const [_k, v] of anEnum.map.entries()) {
        if (typeof v !== 'number') {
          continue;
        }
        if (v === searchStructId) {
          return true;
        }
      }
      return false;
    });
    return found;
  }

  public async getStructEnums(): Promise<Enum[]> {
    const allEnums: Enum[] = await Enum.all(this.cacheProvider);
    const structEnums: Enum[] = allEnums.filter((e) => e.valueTypeChar === ScriptVarType.struct.char);
    return structEnums;
  }

  // Add this method for getting category names
  public async getCategoryName(enumId: number, categoryId: number): Promise<string> {
    if (!enumId || !categoryId) {
      return 'Unknown';
    }
  
    // Load the enum map using the enum ID
    const categoryEnum = await this.getEnum(enumId);
    if (!categoryEnum || !categoryEnum.map) {
      return 'Unknown';
    }
  
    // Retrieve the category name
    const categoryValue = categoryEnum.map.get(categoryId);
  
    // Always return a string
    return categoryValue ? String(categoryValue) : 'Unknown';
  }
  
  
}

