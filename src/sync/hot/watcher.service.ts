/**
 * @file watcher.service.ts
 * @description chokidar file watcher for `aify sync --hot`. Debounces user edits and invokes
 * onChange (→ push). Suppresses the next change event for any path aify itself just wrote
 * (`markWritten` / `AIFY_FILE_WRITTEN`), preventing a write→push feedback loop (OS-22).
 */

import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as chokidar from 'chokidar';
import { AIFY_FILE_WRITTEN, type AifyFileWrittenPayload } from './hot-events';

/** Milliseconds a change is debounced before onChange fires (editors write in bursts). */
const DEBOUNCE_MS = 200;

@Injectable()
export class WatcherService {
  private watcher?: chokidar.FSWatcher;
  private readonly suppressed = new Map<string, number>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  /** Ignore the next change event for `filePath` (called when aify writes it). */
  markWritten(filePath: string): void {
    const key = path.resolve(filePath);
    this.suppressed.set(key, (this.suppressed.get(key) ?? 0) + 1);
  }

  /** Route WriteStage's AIFY_FILE_WRITTEN emissions into markWritten (OS-22). */
  @OnEvent(AIFY_FILE_WRITTEN)
  onAifyWrite(payload: AifyFileWrittenPayload): void {
    this.markWritten(payload.filePath);
  }

  /** Watch `root` (or `root/scope`) and debounce user edits into onChange. */
  async watch(
    root: string,
    scope: string | undefined,
    onChange: (filePath: string) => Promise<void>,
  ): Promise<void> {
    const target = scope ? path.join(root, scope) : root;
    this.watcher = chokidar.watch(target, { ignoreInitial: true });
    this.watcher.on('change', (filePath: string) => {
      const key = path.resolve(filePath);
      const pending = this.suppressed.get(key);
      if (pending !== undefined) {
        if (pending <= 1) this.suppressed.delete(key);
        else this.suppressed.set(key, pending - 1);
        return; // aify's own write — do not push back
      }
      this.debounce(key, () => onChange(key));
    });
  }

  /** Close the watcher and clear pending debounce timers. */
  async stop(): Promise<void> {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.suppressed.clear();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
  }

  /** Collapse rapid successive changes to one onChange per path. */
  private debounce(key: string, fn: () => Promise<void>): void {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void fn();
      }, DEBOUNCE_MS),
    );
  }
}
