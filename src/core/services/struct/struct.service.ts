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
      if (value === undefined || value === null) {
        return false;
      }
      if (paramValue === undefined || paramValue === null) {
        return true;
      }
      const valueStr = value.toString().toLowerCase();
      const paramStr = paramValue.toString().toLowerCase();
      return valueStr.includes(paramStr);
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
}

