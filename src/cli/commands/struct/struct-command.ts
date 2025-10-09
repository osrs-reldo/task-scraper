import { ParamID, Struct } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import { replacer } from '../../../core/json-replacer';
import { StructService } from '../../../core/services/struct/struct.service';

@Injectable()
export class StructCommand {
  constructor(private structService: StructService) {}

  public async handleGet(id: number): Promise<void> {
    const struct: Struct = await this.structService.getStruct(id);
    if (!struct) {
      console.error('undefined struct', { id });
      return;
    }
    console.log(struct);
  }

  public async handleList(): Promise<void> {
    const structs: Struct[] = await this.structService.getAllStructs();
    console.log(`Found ${structs.length} structs:`);
    structs.forEach(struct => {
      console.log(`${struct.id}: ${struct.params.size} params`);
    });
    console.log(`Total: ${structs.length} structs`);
  }

  public async handleFind(searchString: string): Promise<void> {
    const structs: Struct[] = await this.structService.findStructs(searchString);
    console.log(JSON.stringify(structs, replacer));
    console.log('total results', structs.length);
  }

  public async handleFindByParam(paramKey: number | string, paramValue?: number | string): Promise<void> {
    const structs: Struct[] = await this.structService.findByParam(paramKey as ParamID, paramValue);
    console.log(JSON.stringify(structs, replacer));
    console.log('total results', structs.length);
  }
}

