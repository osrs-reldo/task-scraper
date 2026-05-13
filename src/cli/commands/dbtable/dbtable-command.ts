import { DBTable } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import { replacer } from '../../../core/json-replacer';
import { DBTableService } from '../../../core/services/dbtable/dbtable.service';

@Injectable()
export class DBTableCommand {
  constructor(private dbtableService: DBTableService) {}

  public async handleGet(id: number): Promise<void> {
    const dbtable: DBTable = await this.dbtableService.getDBTable(id);
    if (!dbtable) {
      console.error('undefined dbtable', { id });
      return;
    }
    console.log(JSON.stringify(dbtable, replacer));
  }
}
