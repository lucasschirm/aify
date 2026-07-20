/**
 * @file sync.command.spec.ts
 * @description Tests that the CLI commands parse flags and delegate to SyncService.run.
 */

import { describe, expect, it, vi } from 'vitest';
import { AppSyncCommand, SyncCommand } from './sync.command';
import type { SyncService } from './sync.service';

describe('SyncCommand', () => {
  it('maps flags to SyncOptions and delegates to SyncService.run', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const cmd = new SyncCommand({ run } as unknown as SyncService);
    await cmd.run([], {
      scope: 'my_scope',
      hot: true,
      forcePull: true,
      yes: true,
    });
    expect(run).toHaveBeenCalledWith({ scope: 'my_scope', hot: true, forcePull: true, yes: true });
  });

  it('parseHot returns true when value is undefined', () => {
    const run = vi.fn();
    const cmd = new SyncCommand({ run } as unknown as SyncService);
    const result = cmd.parseHot();
    expect(result).toBe(true);
  });

  it('parseHot returns provided value when true', () => {
    const run = vi.fn();
    const cmd = new SyncCommand({ run } as unknown as SyncService);
    const result = cmd.parseHot(true);
    expect(result).toBe(true);
  });

  it('parseForcePull returns true when value is undefined', () => {
    const run = vi.fn();
    const cmd = new SyncCommand({ run } as unknown as SyncService);
    const result = cmd.parseForcePull();
    expect(result).toBe(true);
  });

  it('parseYes returns true when value is undefined', () => {
    const run = vi.fn();
    const cmd = new SyncCommand({ run } as unknown as SyncService);
    const result = cmd.parseYes();
    expect(result).toBe(true);
  });

  it('parseYes returns provided value when false', () => {
    const run = vi.fn();
    const cmd = new SyncCommand({ run } as unknown as SyncService);
    const result = cmd.parseYes(false);
    expect(result).toBe(false);
  });
});

describe('AppSyncCommand', () => {
  it('treats the positional scope as --scope', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const cmd = new AppSyncCommand({ run } as unknown as SyncService);
    await cmd.run(['my_scope'], { yes: cmd.parseYes(true) });
    expect(run).toHaveBeenCalledWith({ scope: 'my_scope', yes: true });
  });

  it('parseYes returns true when value is undefined', () => {
    const run = vi.fn();
    const cmd = new AppSyncCommand({ run } as unknown as SyncService);
    const result = cmd.parseYes();
    expect(result).toBe(true);
  });
});
