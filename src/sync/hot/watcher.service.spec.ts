/**
 * @file watcher.service.spec.ts
 * @description Tests for WatcherService: multi-scope targets + ignore rules, self-write suppression,
 * and debounced user-edit callbacks.
 */

import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const changeHandlers: Array<(p: string) => void> = [];
const fakeWatcher = {
  on: vi.fn((event: string, cb: (p: string) => void) => {
    if (event === 'change') changeHandlers.push(cb);
    return fakeWatcher;
  }),
  once: vi.fn((event: string, cb: () => void) => {
    if (event === 'ready') cb(); // resolve watch()'s ready gate synchronously in tests
    return fakeWatcher;
  }),
  close: vi.fn(async () => {}),
};
vi.mock('chokidar', () => ({ watch: vi.fn(() => fakeWatcher) }));

import * as chokidar from 'chokidar';
import { WatcherService } from './watcher.service';

const emitChange = (p: string): void => {
  for (const h of changeHandlers) h(p);
};

describe('WatcherService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    changeHandlers.length = 0;
    fakeWatcher.on.mockClear();
    fakeWatcher.once.mockClear();
    fakeWatcher.close.mockClear();
    vi.mocked(chokidar.watch).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('watches each tracked scope folder and ignores metadata / internal files', async () => {
    const svc = new WatcherService();
    await svc.watch(
      '/proj',
      ['scope_a', 'scope_b'],
      vi.fn(async () => {}),
    );

    const call = vi.mocked(chokidar.watch).mock.calls[0];
    const targets = call[0] as string[];
    const opts = call[1] as { ignoreInitial?: boolean; ignored?: (p: string) => boolean };

    expect(targets).toEqual([path.join('/proj', 'scope_a'), path.join('/proj', 'scope_b')]);
    expect(opts.ignoreInitial).toBe(true);

    const ignored = opts.ignored as (p: string) => boolean;
    expect(typeof ignored).toBe('function');
    // Internal / metadata files are ignored…
    expect(ignored(path.join('/proj', 'scope_a', 'table', 'rec', 'record_metadata.json'))).toBe(
      true,
    );
    expect(ignored(path.join('/proj', '.aify', 'locks', 'scope_a.lock'))).toBe(true);
    expect(ignored(path.join('/proj', '.aify.config.json'))).toBe(true);
    expect(ignored(path.join('/proj', 'node_modules', 'x', 'index.js'))).toBe(true);
    // …but a real tracked column file is watched.
    expect(ignored(path.join('/proj', 'scope_a', 'table', 'rec', 'source.js'))).toBe(false);
  });

  it('markWritten suppresses exactly one subsequent change for that path', async () => {
    const svc = new WatcherService();
    const onChange = vi.fn(async () => {});
    const target = path.resolve('/proj/scope/table/rec/script.glide.js');

    await svc.watch('/proj', ['scope'], onChange);
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

    await svc.watch('/proj', ['scope'], onChange);
    emitChange(target);
    emitChange(target);
    await vi.runAllTimersAsync();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(target);
  });
});
