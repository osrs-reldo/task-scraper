import { ParamID, Struct } from '@abextm/cache2';
import { Injectable } from '@nestjs/common';
import { replacer } from '../../../core/json-replacer';
import { StructService } from '../../../core/services/struct/struct.service';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
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
  public async loadStructIdsFromFile(filePath: string): Promise<number[]> {
    try {
      // Ensure the file path is resolved relative to the current working directory
      const resolvedPath = resolve(filePath); // Directly resolve without assuming cwd
      console.log(`Resolved file path: ${resolvedPath}`);
  
      // Check if the file exists
      if (!existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`);
      }
  
      const fileContent = readFileSync(resolvedPath, 'utf-8');
      console.log(`Raw file content (first 5 lines):\n${fileContent.split('\n').slice(0, 5).join('\n')}`);
  
      const structIds = fileContent
        .split('\n') // Split into lines
        .map(line => line.trim()) // Trim spaces
        .filter(line => line.length > 0) // Remove empty lines
        .map(line => {
          const id = Number(line);
          if (isNaN(id)) {
            console.error(`Invalid Struct ID in file: "${line}"`);
            return null;
          }
          return id;
        })
        .filter(id => id !== null);
  
      console.log(`Extracted Struct IDs: ${structIds.slice(0, 5)} (${structIds.length} total)`);
      return structIds;
    } catch (error) {
      console.error(`Failed to load Struct IDs from file: ${error.message}`);
      throw error;
    }
  }
 
  public async handleGetMultiple(ids: number[]): Promise<void> {
    const structs: Struct[] = await this.structService.getStructs(ids);
    if (!structs.length) {
      console.error('No structs found for the provided IDs:', ids);
      return;
    }
    structs.forEach((struct) => console.log(JSON.stringify(struct, replacer, 2)));
  }  
}

