/**
 * @file scope-lock.service.spec.ts
 * @description Tests for the per-scope lock file (OS-8): concurrency + stale recovery.
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScopeLockedError, ScopeLockService } from './scope-lock.service';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const tick = () => new Promise<void>((r) => setImmediate(r));
/** Wait until the lock file for `scope` exists on disk. */
async function waitForLock(root: string, scope: string): Promise<void> {
  const lockPath = join(root, '.aify', 'locks', `${scope}.lock`);
  for (let i = 0; i < 100; i++) {
    try {
      await stat(lockPath);
      return;
    } catch {
      await tick();
    }
  }
  throw new Error(`lock file ${lockPath} never appeared`);
}

describe('ScopeLockService', () => {
  let root: string;
  const svc = new ScopeLockService();
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'aify-lock-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('rejects a second run for the same scope while the first holds the lock', async () => {
    const gate = deferred<void>();
    const first = svc.withLock(root, 'my_scope', async () => {
      await gate.promise;
      return 'first';
    });
    await waitForLock(root, 'my_scope');
    await expect(svc.withLock(root, 'my_scope', async () => 'second')).rejects.toBeInstanceOf(
      ScopeLockedError,
    );
    gate.resolve();
    await expect(first).resolves.toBe('first');
  });

  it('allows concurrent runs for different scopes', async () => {
    const gate = deferred<void>();
    const a = svc.withLock(root, 'scope_a', async () => {
      await gate.promise;
      return 'a';
    });
    await waitForLock(root, 'scope_a');
    await expect(svc.withLock(root, 'scope_b', async () => 'b')).resolves.toBe('b');
    gate.resolve();
    await expect(a).resolves.toBe('a');
  });

  it('releases the lock after the callback resolves (and on error)', async () => {
    await svc.withLock(root, 'my_scope', async () => 'ok');
    await expect(
      svc.withLock(root, 'my_scope', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(svc.withLock(root, 'my_scope', async () => 'again')).resolves.toBe('again');
  });

  it('reclaims a stale lock file (older than the TTL)', async () => {
    const dir = join(root, '.aify', 'locks');
    await mkdir(dir, { recursive: true });
    const stale = { pid: 999999, time: Date.now() - 11 * 60 * 1000 };
    await writeFile(join(dir, 'my_scope.lock'), JSON.stringify(stale));
    await expect(svc.withLock(root, 'my_scope', async () => 'reclaimed')).resolves.toBe(
      'reclaimed',
    );
    await expect(readFile(join(dir, 'my_scope.lock'), 'utf8')).rejects.toThrow();
  });

  it('treats a corrupt/unreadable lock file as stale and reclaims it', async () => {
    const dir = join(root, '.aify', 'locks');
    await mkdir(dir, { recursive: true });
    // Write non-JSON content to the lock file
    await writeFile(join(dir, 'my_scope.lock'), 'not valid json {]');
    // Should succeed because corrupt lock is treated as stale
    await expect(svc.withLock(root, 'my_scope', async () => 'recovered')).resolves.toBe(
      'recovered',
    );
  });
});
