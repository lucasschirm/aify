/**
 * @file sync.command.spec.ts
 * @description Tests that the CLI commands parse flags and delegate to SyncService.run.
 */

import { describe, expect, it, vi } from 'vitest';
import { AppSyncCommand, SyncCommand } from './sync.command';

describe('SyncCommand', () => {
  it('maps flags to SyncOptions and delegates to SyncService.run', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    // biome-ignore lint/suspicious/noExplicitAny: test double for SyncService
    const cmd = new SyncCommand({ run } as any);
    await cmd.run([], {
      scope: 'my_scope',
      hot: true,
      forcePull: true,
      yes: true,
    });
    expect(run).toHaveBeenCalledWith({ scope: 'my_scope', hot: true, forcePull: true, yes: true });
  });
});

describe('AppSyncCommand', () => {
  it('treats the positional scope as --scope', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    // biome-ignore lint/suspicious/noExplicitAny: test double for SyncService
    const cmd = new AppSyncCommand({ run } as any);
    await cmd.run(['my_scope'], { yes: cmd.parseYes(true) });
    expect(run).toHaveBeenCalledWith({ scope: 'my_scope', yes: true });
  });
});
