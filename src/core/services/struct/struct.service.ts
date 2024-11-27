import { CacheProvider, ParamID, Struct } from '@abextm/cache2';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class StructService {
  constructor(@Inject('CacheProvider') private readonly cacheProvider: CacheProvider) {}

  public getStruct(id: number): Promise<Struct> {
    console.info('getStruct', id);
    return Struct.load(this.cacheProvider, id);
  }

  public async findByParam(paramKey: ParamID, paramValue?: any): Promise<Struct[]> {
    const all: Struct[] = await Struct.all(this.cacheProvider);
    all.sort((a, b) => a.id - b.id);
    const found: Struct[] = all.filter((struct) => {
      const value: any = struct.params.get(paramKey);
      if (!value) {
        return false;
      }
      if (!paramValue || value === paramValue) {
        return true;
      }
    });
    return found;
  }

  public async findStructs(searchString: string): Promise<Struct[]> {
    const all: Struct[] = await Struct.all(this.cacheProvider);
    all.sort((a, b) => a.id - b.id);
    const found: Struct[] = all.filter((struct) => {
      for (const [_k, v] of struct.params.entries()) {
        if (typeof v !== 'string') {
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
  public async getStructs(ids: number[]): Promise<Struct[]> {
    console.info('getStructs', ids);
    const structs: Struct[] = [];
    for (const id of ids) {
      const struct = await Struct.load(this.cacheProvider, id);
      if (struct) {
        structs.push(struct);
      }
    }
    return structs;
  }
}

