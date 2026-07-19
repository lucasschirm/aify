/**
 * @file sync.service.spec.ts
 * @description Tests for SyncService orchestration: flag validation, prompts, per-scope locking,
 * and pipeline sequencing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AifyProjectConfig } from '../config/project/project-config.types';
import { SyncService } from './sync.service';

const snAuth = { instanceUrl: 'https://dev123.service-now.com', username: 'u', password: 'p' };

function makeDeps(
  overrides: {
    scopes?: { sysId: string; scope: string }[];
    current?: { auth: { alias: string }; snAuth: typeof snAuth } | null;
    prompter?: Partial<{ confirm: typeof vi.fn; awaitKeypress: typeof vi.fn }>;
    pull?: Partial<{ run: typeof vi.fn; detectChanges: typeof vi.fn }>;
  } = {},
) {
  const projectConfig = {
    ensureProjectRoot: vi.fn().mockResolvedValue('/proj'),
    read: vi
      .fn()
      .mockResolvedValue({ project: { scopes: overrides.scopes ?? [] } } as AifyProjectConfig),
  };
  const trackedTables = {
    getProjectTrackTables: vi.fn().mockResolvedValue({ tables: [], column_types: {} }),
  };
  const auth = {
    current: vi
      .fn()
      .mockResolvedValue(
        'current' in overrides ? overrides.current : { auth: { alias: 'dev' }, snAuth },
      ),
  };
  const lock = {
    withLock: vi.fn(async <T>(_r: string, _s: string, fn: () => Promise<T>): Promise<T> => fn()),
  };
  const withLock = vi.mocked(lock.withLock);
  const prompt = {
    confirm: vi.fn().mockResolvedValue(true),
    awaitKeypress: vi.fn().mockResolvedValue(true),
    input: vi.fn(),
    password: vi.fn(),
    select: vi.fn(),
    ...overrides.prompter,
  };
  const pullStage = {
    run: vi.fn().mockResolvedValue({ changed: [], created: [], deleted: [] }),
    detectChanges: vi.fn(),
  };
  const conflictCheckStage = {
    classify: vi.fn().mockResolvedValue([]),
    detectLocalChanges: vi.fn().mockResolvedValue([]),
  };
  const writeStage = { apply: vi.fn().mockResolvedValue({ conflicted: [] }) };
  const pushStage = { push: vi.fn().mockResolvedValue({ pushed: [], skipped: [] }) };
  const watcher = {
    watch: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
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
  return {
    svc,
    projectConfig,
    trackedTables,
    auth,
    prompt,
    withLock,
    pullStage,
    conflictCheckStage,
    writeStage,
    pushStage,
    watcher,
    spinner,
    records,
  };
}

describe('SyncService.run', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('rejects when the project has no tracked scopes', async () => {
    const { svc } = makeDeps({ scopes: [] });
    await expect(svc.run({})).rejects.toThrow(
      'Current project is empty, use the `app init` command to start tracking an application',
    );
  });

  it('rejects --force-pull and --force-push together', async () => {
    const { svc } = makeDeps({ scopes: [{ sysId: 's1', scope: 'my_scope' }] });
    await expect(svc.run({ forcePull: true, forcePush: true })).rejects.toThrow(
      '--force-pull and --force-push are mutually exclusive',
    );
  });

  it('aborts without locking when the instance prompt is cancelled (ESC)', async () => {
    const { svc, withLock, prompt } = makeDeps({
      scopes: [{ sysId: 's1', scope: 'my_scope' }],
      prompter: { awaitKeypress: vi.fn().mockResolvedValue(false) },
    });
    await svc.run({});
    expect(prompt.awaitKeypress).toHaveBeenCalledWith(
      'Press any key to start sync to the instance https://dev123.service-now.com or ESC to cancel',
    );
    expect(withLock).not.toHaveBeenCalled();
  });

  it('skips the instance prompt when --yes is passed', async () => {
    const { svc, prompt, withLock } = makeDeps({ scopes: [{ sysId: 's1', scope: 'my_scope' }] });
    await svc.run({ yes: true });
    expect(prompt.awaitKeypress).not.toHaveBeenCalled();
    expect(withLock).toHaveBeenCalledOnce();
    expect(withLock).toHaveBeenCalledWith('/proj', 'my_scope', expect.any(Function));
  });

  it('aborts when the --force-pull confirmation is declined', async () => {
    const { svc, withLock } = makeDeps({
      scopes: [{ sysId: 's1', scope: 'my_scope' }],
      prompter: { confirm: vi.fn().mockResolvedValue(false) },
    });
    await svc.run({ forcePull: true });
    expect(withLock).not.toHaveBeenCalled();
  });

  it('locks each scope when all prompts pass', async () => {
    const { svc, withLock } = makeDeps({
      scopes: [
        { sysId: 's1', scope: 'scope_a' },
        { sysId: 's2', scope: 'scope_b' },
      ],
    });
    await svc.run({ yes: true });
    expect(withLock).toHaveBeenCalledTimes(2);
    expect(withLock).toHaveBeenNthCalledWith(1, '/proj', 'scope_a', expect.any(Function));
    expect(withLock).toHaveBeenNthCalledWith(2, '/proj', 'scope_b', expect.any(Function));
  });
});
