import { Enum } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import { replacer } from '../../../core/json-replacer';
import { EnumService } from '../../../core/services/enum/enum.service';

@Injectable()
export class EnumCommand {
  constructor(private enumService: EnumService) {}

  public async handleGet(id: number, options: { json?: boolean } = {}): Promise<void> {
    const theEnum: Enum = await this.enumService.getEnum(id);
    if (!theEnum) {
      console.error('undefined enum', { id });
      return;
    }
    if (options.json) {
      fs.mkdirSync('out', { recursive: true });
      const filePath = `out/enum.${id}.json`;
      fs.writeFileSync(filePath, JSON.stringify(theEnum, replacer, 2));
      console.log(`Wrote ${filePath}`);
    } else {
      console.log(theEnum);
    }
  }

  public async handleFindString(searchString: string): Promise<void> {
    const structs: Enum[] = await this.enumService.findEnumsByString(searchString);
    console.log(JSON.stringify(structs, replacer, 2));
    console.log('total results', structs.length);
  }

  public async handleFindStruct(searchStructId: number): Promise<void> {
    const structs: Enum[] = await this.enumService.findEnumsByStruct(searchStructId);
    console.log(JSON.stringify(structs, replacer, 2));
    console.log('total results', structs.length);
  }
}

