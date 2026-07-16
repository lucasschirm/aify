/**
 * @file sync.command.ts
 * @description `aify sync` — runs a one-shot metadata sync for all tracked scopes in the
 * current project (OS-21). `--scope <scope>` restricts to a single scope; `--force` skips
 * conflict checks. Delegates to `SyncService.syncOnce`.
 */
import { Command, CommandRunner, Option } from 'nest-commander';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { SyncService } from './sync.service';
import type { SyncOptions } from './sync.types';

@Command({
  name: 'sync',
  description: 'Pull ServiceNow metadata for all tracked scopes in the current project.',
})
export class SyncCommand extends CommandRunner {
  constructor(private readonly syncService: SyncService) {
    super();
  }

  async run(_params: string[], options: SyncOptions = {}): Promise<void> {
    await this.syncService.syncOnce({
      scope: options.scope,
      force: options.force,
      once: true,
    });
  }

  @Option({
    flags: '--scope <scope>',
    description: 'Restrict the sync to a single tracked scope.',
  })
  parseScope(value: string): string {
    return value;
  }

  @Option({
    flags: '--force',
    description: 'Skip conflict checks and overwrite local files.',
  })
  parseForce(): boolean {
    return true;
  }
}
