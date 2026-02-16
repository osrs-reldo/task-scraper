import { CacheProvider, DBRow, DBTable } from '@abextm/cache2';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class DBRowService {
  constructor(@Inject('CacheProvider') private readonly cacheProvider: CacheProvider) {}

  public async getDBRow(id: number): Promise<DBRow> {
    console.info('getDBRow', { id });
    return DBRow.load(this.cacheProvider, id);
  }

  public async getDBRowByTable(tableId: number, rowId: number): Promise<DBRow | null> {
    const rows: DBRow[] | undefined = await DBTable.loadRows(this.cacheProvider, tableId);
    if (!rows) {
      return null;
    }
    return rows.find((row) => row.id === rowId) ?? null;
  }

  public async getDBRowsByTable(tableId: number): Promise<DBRow[]> {
    const rows: DBRow[] | undefined = await DBTable.loadRows(this.cacheProvider, tableId);
    return rows ?? [];
  }

  public async findDBRows(tableId: number, searchString: string): Promise<DBRow[]> {
    const rows: DBRow[] | undefined = await DBTable.loadRows(this.cacheProvider, tableId);
    if (!rows) {
      return [];
    }
    rows.sort((a, b) => a.id - b.id);
    const found: DBRow[] = rows.filter((dbrow) => {
      if (!dbrow.values || !Array.isArray(dbrow.values)) {
        return false;
      }
      for (const columnValues of dbrow.values) {
        if (!Array.isArray(columnValues)) {
          continue;
        }
        for (const v of columnValues) {
          if (typeof v !== 'string') {
            continue;
          }
          if (v.includes(searchString)) {
            return true;
          }
        }
      }
      return false;
    });
    return found;
  }

  public getStringValues(dbrow: DBRow): Array<{ column: number; index: number; value: string }> {
    const output: Array<{ column: number; index: number; value: string }> = [];
    if (!dbrow.values || !Array.isArray(dbrow.values)) {
      return output;
    }
    dbrow.values.forEach((columnValues, columnIndex) => {
      if (!Array.isArray(columnValues)) {
        return;
      }
      columnValues.forEach((v, valueIndex) => {
        if (typeof v !== 'string') {
          return;
        }
        output.push({ column: columnIndex, index: valueIndex, value: v });
      });
    });
    return output;
  }
}
