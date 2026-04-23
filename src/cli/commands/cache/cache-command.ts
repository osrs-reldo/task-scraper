import { Injectable } from '@nestjs/common';
import { CacheService } from '../../../core/services/cache/cache.service';

@Injectable()
export class CacheCommand {
  constructor(private cacheService: CacheService) {}

  public async handleUpdate(globalCommit?: string): Promise<void> {
    const currentLocalCommit = this.cacheService.getLocalCommitHash();
    
    if (currentLocalCommit) {
      console.log(`Current cache commit: ${currentLocalCommit}`);
    }
    
    if (globalCommit) {
      console.log(`Updating to specific commit: ${globalCommit}`);
      const isValidCommit = await this.cacheService.validateCommitHash(globalCommit);
      if (!isValidCommit) {
        throw new Error(`Invalid commit hash: ${globalCommit}. Commit not found in repository.`);
      }
      return this.cacheService.updateCache(globalCommit);
    } else {
      console.log('Updating to latest commit from repository');
      return this.cacheService.updateCache();
    }
  }

  public async handleStatus(): Promise<void> {
    const localCommit = this.cacheService.getLocalCommitHash();
    
    console.log('Cache Status:');
    if (localCommit) {
      console.log(`  Local commit: ${localCommit}`);
    } else {
      console.log('  No local cache found');
    }
  }

  public async handleList(perPage: number): Promise<void> {
    const commits = await this.cacheService.listCommits(perPage);
    const localCommit = this.cacheService.getLocalCommitHash();
    for (const { sha, date } of commits) {
      const marker = sha === localCommit ? ' (local)' : '';
      console.log(`${date}  ${sha}${marker}`);
    }
  }
}

