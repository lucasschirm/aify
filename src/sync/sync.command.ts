/**
 * @file sync.command.ts
 * @description nest-commander entry points: `aify sync` (with `--scope`, `--hot`, `--force-pull`,
 * `--force-push`, and `--yes`) and `aify app sync <scope>` (alias of `sync --scope`, OS-21).
 * Both are thin adapters that build `SyncOptions` and delegate to `SyncService.run`.
 */

import { Command, CommandRunner, Option, SubCommand } from 'nest-commander';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { SyncService } from './sync.service';
import type { SyncOptions } from './sync.types';

@Command({ name: 'sync', description: 'Sync tracked scopes with the current ServiceNow instance' })
export class SyncCommand extends CommandRunner {
  constructor(private readonly sync: SyncService) {
    super();
  }

  async run(_params: string[], options: SyncOptions = {}): Promise<void> {
    await this.sync.run(options);
  }

  @Option({ flags: '--scope <scope>', description: 'Only this scope' })
  parseScope(v: string): string {
    return v;
  }

  @Option({ flags: '--hot', description: 'Watch files and the instance' })
  parseHot(v?: boolean): boolean {
    return v ?? true;
  }

  @Option({ flags: '--force-pull', description: 'Download all; skip comparison' })
  parseForcePull(v?: boolean): boolean {
    return v ?? true;
  }

  @Option({ flags: '--force-push', description: 'Upload all; skip comparison' })
  parseForcePush(v?: boolean): boolean {
    return v ?? true;
  }

  @Option({ flags: '-y, --yes', description: 'Skip the instance confirmation prompt' })
  parseYes(v?: boolean): boolean {
    return v ?? true;
  }
}

@SubCommand({ name: 'sync', description: 'Alias for `aify sync --scope <scope>`' })
export class AppSyncCommand extends CommandRunner {
  constructor(private readonly sync: SyncService) {
    super();
  }

  async run(params: string[], options: { yes?: boolean } = {}): Promise<void> {
    await this.sync.run({ scope: params[0], ...options });
  }

  @Option({ flags: '-y, --yes', description: 'Skip the instance confirmation prompt' })
  parseYes(v?: boolean): boolean {
    return v ?? true;
  }
}
