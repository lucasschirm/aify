/**
 * @file scope-lock.service.ts
 * @description Per-scope advisory lock (OS-8). Serializes syncs (and sync + hot) that would mutate
 * the same scope. Uses an atomic `wx` file create as the lock; recovers locks older than the TTL.
 */

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';

/** Thrown when a fresh lock for the scope is already held by another run. */
export class ScopeLockedError extends Error {}

/** A lock is considered stale (crashed holder) after this many ms. */
const STALE_LOCK_MS = 10 * 60 * 1000;

@Injectable()
export class ScopeLockService {
  private lockPath(root: string, scope: string): string {
    return join(root, '.aify', 'locks', `${scope}.lock`);
  }

  /** Acquire the scope lock, run `fn`, then release the lock (even if `fn` throws). */
  async withLock<T>(root: string, scope: string, fn: () => Promise<T>): Promise<T> {
    const lockPath = this.lockPath(root, scope);
    await mkdir(join(root, '.aify', 'locks'), { recursive: true });
    await this.acquire(lockPath, scope);
    try {
      return await fn();
    } finally {
      await unlink(lockPath).catch(() => undefined);
    }
  }

  private async acquire(lockPath: string, scope: string): Promise<void> {
    const payload = JSON.stringify({ pid: process.pid, time: Date.now() });
    try {
      await writeFile(lockPath, payload, { flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (await this.isStale(lockPath)) {
        await unlink(lockPath).catch(() => undefined);
        await writeFile(lockPath, payload, { flag: 'wx' });
        return;
      }
      throw new ScopeLockedError(
        `Scope "${scope}" is already being synced. Wait for it to finish or remove ${lockPath}.`,
      );
    }
  }

  private async isStale(lockPath: string): Promise<boolean> {
    try {
      const raw = await readFile(lockPath, 'utf8');
      const { time } = JSON.parse(raw) as { time: number };
      return Date.now() - time > STALE_LOCK_MS;
    } catch {
      return true; // unreadable/corrupt lock → treat as stale
    }
  }
}
