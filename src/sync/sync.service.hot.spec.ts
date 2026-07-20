/**
 * @file sync.service.hot.spec.ts
 * @description Tests for SyncService hot mode: watcher start, sys_metadata poll, pipeline execution
 * only when changes are found, poll error-resilience, and the single-file push callback (tracked-column
 * guard + per-scope lock).
 */

import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncService } from './sync.service';

describe('SyncService hot mode', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    process.removeAllListeners('SIGINT');
  });

  /** Build a SyncService with just the hot-path collaborators stubbed. */
  const build = (detected: number[]) => {
    const watcher = {
      watch: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      markWritten: vi.fn(),
    };
    const detectChanges = vi.fn(async () => new Array(detected.shift() ?? 0).fill({}));
    const pullStage = {
      run: vi.fn().mockResolvedValue({ changed: [], created: [], deleted: [] }),
      detectChanges,
    };
    const projectConfig = {
      ensureProjectRoot: vi.fn(async () => '/proj'),
      read: vi.fn(async () => ({
        hot: { pullInterval: 5 },
        project: { scopes: [{ sysId: 's1', scope: 'my_scope' }] },
      })),
    };
    const trackedTables = {
      getProjectTrackTables: vi.fn().mockResolvedValue({ tables: [], column_types: {} }),
    };
    const auth = {
      current: vi.fn().mockResolvedValue({
        snAuth: { instanceUrl: 'https://dev.service-now.com', username: 'u', password: 'p' },
      }),
    };
    const lock = {
      withLock: vi.fn(async (_r: string, _s: string, fn: () => Promise<void>) => fn()),
    };
    const prompt = {
      confirm: vi.fn().mockResolvedValue(true),
      awaitKeypress: vi.fn().mockResolvedValue(true),
    };
    const conflictCheckStage = {
      classify: vi.fn().mockResolvedValue([]),
      detectLocalChanges: vi.fn().mockResolvedValue([]),
    };
    const writeStage = { apply: vi.fn().mockResolvedValue({ conflicted: [] }) };
    const pushStage = { push: vi.fn().mockResolvedValue({ pushed: [], skipped: [] }) };
    const spinner = { start: vi.fn(), succeed: vi.fn(), fail: vi.fn(), info: vi.fn() };
    const records = {
      loadScopeMap: vi.fn().mockResolvedValue(new Map()),
      read: vi.fn().mockResolvedValue(null),
    };

    const args = [
      projectConfig,
      trackedTables,
      auth,
      lock,
      prompt,
      pullStage,
      conflictCheckStage,
      writeStage,
      pushStage,
      watcher,
      spinner,
      records,
    ] as unknown as ConstructorParameters<typeof SyncService>;
    const svc = new SyncService(...args);
    const syncOnce = vi
      .spyOn(svc as unknown as { syncOnce: (o: unknown) => Promise<void> }, 'syncOnce')
      .mockResolvedValue();
    vi.spyOn(
      svc as unknown as { pullInputs: (o: unknown) => Promise<unknown[]> },
      'pullInputs',
    ).mockResolvedValue([{ scope: { sysId: 's1', scope: 'my_scope' } }]);
    return { svc, watcher, detectChanges, syncOnce, pushStage, lock, records, auth };
  };

  it('starts the watcher and polls sys_metadata; runs pipeline ONLY when changes are found', async () => {
    const { svc, watcher, detectChanges, syncOnce } = build([0, 2]);
    await svc.run({ hot: true, yes: true });

    expect(watcher.watch).toHaveBeenCalledTimes(1);
    // Watches the tracked scope folders as an array (not a bare scope string).
    expect(watcher.watch).toHaveBeenCalledWith('/proj', ['my_scope'], expect.any(Function));
    expect(syncOnce).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(detectChanges).toHaveBeenCalledTimes(1);
    expect(syncOnce).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(detectChanges).toHaveBeenCalledTimes(2);
    expect(syncOnce).toHaveBeenCalledTimes(2);

    await svc.stopHot();
    expect(watcher.stop).toHaveBeenCalledTimes(1);
  });

  it('with --force-pull the watcher is NOT started (instance monitoring only)', async () => {
    const { svc, watcher } = build([0]);
    await svc.run({ hot: true, forcePull: true, yes: true });
    expect(watcher.watch).not.toHaveBeenCalled();
    await svc.stopHot();
  });

  it('a failing poll is swallowed and the loop keeps running', async () => {
    const { svc, detectChanges, syncOnce } = build([0]);
    detectChanges.mockRejectedValueOnce(new Error('network down'));

    // A rejecting detectChanges must not reject pollOnce (would become an unhandled rejection
    // under `void this.pollOnce(...)` and undermine the long-running loop).
    await expect(
      (svc as unknown as { pollOnce: (o: unknown) => Promise<boolean> }).pollOnce({}),
    ).resolves.toBe(false);
    expect(syncOnce).not.toHaveBeenCalled();

    // The next poll still runs normally.
    await (svc as unknown as { pollOnce: (o: unknown) => Promise<boolean> }).pollOnce({});
    expect(detectChanges).toHaveBeenCalledTimes(2);
  });

  it('registers a SIGINT handler on start and removes it on stopHot', async () => {
    const { svc } = build([0]);
    const before = process.listenerCount('SIGINT');
    await svc.run({ hot: true, yes: true });
    expect(process.listenerCount('SIGINT')).toBe(before + 1);
    await svc.stopHot();
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  describe('pushFile (watcher callback)', () => {
    const pushFile = (svc: SyncService, filePath: string) =>
      (svc as unknown as { pushFile: (p: string, o: unknown) => Promise<void> }).pushFile(
        filePath,
        {},
      );

    it('skips a file whose column is not tracked (e.g. record_metadata.json)', async () => {
      const { svc, pushStage, records, lock } = build([]);
      records.read.mockResolvedValue({
        $sys_id: 'r1',
        $table: 'x_widget',
        $hash: { source: 'h' },
        $conflicts: {},
      });

      await pushFile(
        svc,
        path.join('/proj', 'my_scope', 'x_widget', 'rec', 'record_metadata.json'),
      );

      expect(pushStage.push).not.toHaveBeenCalled();
      expect(lock.withLock).not.toHaveBeenCalled();
    });

    it('pushes a tracked column under the per-scope lock', async () => {
      const { svc, pushStage, records, lock } = build([]);
      records.read.mockResolvedValue({
        $sys_id: 'r1',
        $table: 'x_widget',
        $hash: { source: 'h' },
        $conflicts: {},
        source: 'base',
      });

      await pushFile(svc, path.join('/proj', 'my_scope', 'x_widget', 'rec', 'source.js'));

      expect(lock.withLock).toHaveBeenCalledWith('/proj', 'my_scope', expect.any(Function));
      expect(pushStage.push).toHaveBeenCalledTimes(1);
      const arg = pushStage.push.mock.calls[0][0] as { changes: Array<{ column: string }> };
      expect(arg.changes[0].column).toBe('source');
    });

    it('never throws out of the watcher callback', async () => {
      const { svc, records } = build([]);
      records.read.mockRejectedValue(new Error('disk gone'));
      await expect(
        pushFile(svc, path.join('/proj', 'my_scope', 'x_widget', 'rec', 'source.js')),
      ).resolves.toBeUndefined();
    });
  });
});
