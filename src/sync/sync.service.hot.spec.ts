/**
 * @file sync.service.hot.spec.ts
 * @description Tests for SyncService hot mode: watcher start, sys_metadata poll, and pipeline
 * execution only when changes are found.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncService } from './sync.service';

describe('SyncService hot mode', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

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
    const conflictCheckStage = { classify: vi.fn().mockResolvedValue([]) };
    const writeStage = { apply: vi.fn().mockResolvedValue({ conflicted: [] }) };
    const pushStage = { push: vi.fn().mockResolvedValue({ pushed: [], skipped: [] }) };
    const spinner = { start: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
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
    ).mockResolvedValue([{}]);
    return { svc, watcher, detectChanges, syncOnce };
  };

  it('starts the watcher and polls sys_metadata; runs pipeline ONLY when changes are found', async () => {
    const { svc, watcher, detectChanges, syncOnce } = build([0, 2]);
    await svc.run({ hot: true, yes: true });

    expect(watcher.watch).toHaveBeenCalledTimes(1);
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
});
