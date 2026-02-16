import { DBRow } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import { replacer } from '../../../core/json-replacer';
import { DBRowService } from '../../../core/services/dbrow/dbrow.service';

@Injectable()
export class DBRowCommand {
  constructor(private dbrowService: DBRowService) {}

  public async handleGet(id: number): Promise<void> {
    const dbrow: DBRow = await this.dbrowService.getDBRow(id);
    if (!dbrow) {
      console.error('undefined dbrow', { id });
      return;
    }
    console.log(dbrow);
  }

  public async handleFind(tableId: number, searchString: string): Promise<void> {
    const dbrows: DBRow[] = await this.dbrowService.findDBRows(tableId, searchString);
    console.log(JSON.stringify(dbrows, replacer));
    console.log('total results', dbrows.length);
  }

  public async handleDumpStrings(tableId: number, rowId: number): Promise<void> {
    const dbrow = await this.dbrowService.getDBRowByTable(tableId, rowId);
    if (!dbrow) {
      console.error('dbrow not found', { tableId, rowId });
      return;
    }
    const strings = this.dbrowService.getStringValues(dbrow);
    const output = {
      tableId,
      rowId,
      strings,
    };
    console.log(JSON.stringify(output, replacer));
    console.log('total strings', strings.length);
  }
}
