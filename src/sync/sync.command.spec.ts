/**
 * @file sync.command.spec.ts
 * @description Tests that the CLI commands parse flags and delegate to SyncService.run.
 */

import { describe, expect, it, vi } from 'vitest';
import { AppSyncCommand, SyncCommand } from './sync.command';

describe('SyncCommand', () => {
  it('maps flags to SyncOptions and delegates to SyncService.run', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const cmd = new SyncCommand({ run } as unknown as import('./sync.service').SyncService);
    await cmd.run([], {
      scope: 'my_scope',
      hot: true,
      forcePull: true,
      yes: true,
    });
    expect(run).toHaveBeenCalledWith({ scope: 'my_scope', hot: true, forcePull: true, yes: true });
  });

  describe('option parsers', () => {
    const cmd = new SyncCommand({
      run: vi.fn(),
    } as unknown as import('./sync.service').SyncService);

    it('parseScope returns the value unchanged', () => {
      expect(cmd.parseScope('my_scope')).toBe('my_scope');
    });

    it('parseHot defaults to true when value is undefined', () => {
      expect(cmd.parseHot(undefined)).toBe(true);
    });

    it('parseHot returns the value when provided', () => {
      expect(cmd.parseHot(false)).toBe(false);
    });

    it('parseForcePull defaults to true when value is undefined', () => {
      expect(cmd.parseForcePull(undefined)).toBe(true);
    });

    it('parseForcePull returns the value when provided', () => {
      expect(cmd.parseForcePull(false)).toBe(false);
    });

    it('parseForcePush defaults to true when value is undefined', () => {
      expect(cmd.parseForcePush(undefined)).toBe(true);
    });

    it('parseForcePush returns the value when provided', () => {
      expect(cmd.parseForcePush(false)).toBe(false);
    });

    it('parseYes defaults to true when value is undefined', () => {
      expect(cmd.parseYes(undefined)).toBe(true);
    });

    it('parseYes returns the value when provided', () => {
      expect(cmd.parseYes(false)).toBe(false);
    });
  });
});

describe('AppSyncCommand', () => {
  it('treats the positional scope as --scope', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const cmd = new AppSyncCommand({ run } as unknown as import('./sync.service').SyncService);
    await cmd.run(['my_scope'], { yes: cmd.parseYes(true) });
    expect(run).toHaveBeenCalledWith({ scope: 'my_scope', yes: true });
  });

  describe('option parsers', () => {
    const cmd = new AppSyncCommand({
      run: vi.fn(),
    } as unknown as import('./sync.service').SyncService);

    it('parseYes defaults to true when value is undefined', () => {
      expect(cmd.parseYes(undefined)).toBe(true);
    });

    it('parseYes returns the value when provided', () => {
      expect(cmd.parseYes(false)).toBe(false);
    });
  });
});
