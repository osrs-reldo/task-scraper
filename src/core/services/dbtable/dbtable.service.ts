import { CacheProvider, DBTable } from '@abextm/cache2';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class DBTableService {
  constructor(@Inject('CacheProvider') private readonly cacheProvider: CacheProvider) {}

  public async getDBTable(id: number): Promise<DBTable> {
    console.info('getDBTable', { id });
    return DBTable.load(this.cacheProvider, id);
  }
}
