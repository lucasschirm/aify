/**
 * @file watcher.service.spec.ts
 * @description Tests for WatcherService: self-write suppression and debounced user-edit callbacks.
 */

import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const changeHandlers: Array<(p: string) => void> = [];
const fakeWatcher = {
  on: vi.fn((event: string, cb: (p: string) => void) => {
    if (event === 'change') changeHandlers.push(cb);
    return fakeWatcher;
  }),
  close: vi.fn(async () => {}),
};
vi.mock('chokidar', () => ({ watch: vi.fn(() => fakeWatcher) }));

import { WatcherService } from './watcher.service';

const emitChange = (p: string): void => {
  for (const h of changeHandlers) h(p);
};

describe('WatcherService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    changeHandlers.length = 0;
    fakeWatcher.on.mockClear();
    fakeWatcher.close.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('markWritten suppresses exactly one subsequent change for that path', async () => {
    const svc = new WatcherService();
    const onChange = vi.fn(async () => {});
    const target = path.resolve('/proj/scope/table/rec/script.glide.js');

    await svc.watch('/proj', 'scope', onChange);
    svc.markWritten(target);

    emitChange(target);
    await vi.runAllTimersAsync();
    expect(onChange).not.toHaveBeenCalled();

    emitChange(target);
    await vi.runAllTimersAsync();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(target);
  });

  it('a user edit (no markWritten) triggers onChange once after debounce', async () => {
    const svc = new WatcherService();
    const onChange = vi.fn(async () => {});
    const target = path.resolve('/proj/scope/table/rec/other.client.js');

    await svc.watch('/proj', 'scope', onChange);
    emitChange(target);
    emitChange(target);
    await vi.runAllTimersAsync();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(target);
  });
});
