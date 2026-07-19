/**
 * @file write.stage.spec.ts
 * @description Tests for WriteStage: take-remote, keep-local, clean merge, conflicted merge,
 * conflict-marker detection, and AIFY_FILE_WRITTEN emission.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashContent } from '../../common/hashing/content-hash';
import { RecordMetadataService } from '../../record-metadata/record-metadata.service';
import type { RecordMetadata } from '../../record-metadata/record-metadata.types';
import { AIFY_FILE_WRITTEN } from '../hot/hot-events';
import type { ColumnChange } from '../sync.types';
import { hasConflictMarkers, isConflictResolved, WriteStage } from './write.stage';

function change(
  folder: string,
  over: Partial<ColumnChange> & Pick<ColumnChange, 'klass' | 'local' | 'remote' | 'base'>,
): ColumnChange {
  return {
    sysId: 'rec1',
    table: 'sys_script',
    column: 'script',
    localChanged: over.localChanged ?? true,
    remoteChanged: over.remoteChanged ?? true,
    folder,
    filePath: join(folder, 'script.glide.js'),
    remoteUpdatedOn: '2026-07-12 08:00:00',
    remoteModCount: 5,
    ...over,
  };
}

async function seed(
  root: string,
  base: string,
  local: string,
  extra: Partial<RecordMetadata> = {},
): Promise<string> {
  const folder = join(root, 'my_scope', 'sys_script', 'rec');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'script.glide.js'), local);
  const meta: RecordMetadata = {
    $sys_id: 'rec1',
    $table: 'sys_script',
    $display_value: 'Rec',
    $parsed_display_value: 'rec',
    $sys_updated_on: '2026-07-10 12:00:00',
    $sys_mod_count: 3,
    script: base,
    $hash: { script: hashContent(base) },
    $conflicts: { script: false },
    ...extra,
  };
  await new RecordMetadataService().write(folder, meta);
  return folder;
}

function newStage(emitter: { emit: typeof vi.fn } = { emit: vi.fn() }) {
  return new WriteStage(
    new RecordMetadataService(),
    emitter as unknown as import('@nestjs/event-emitter').EventEmitter2,
  );
}

describe('WriteStage.apply', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'aify-write-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('take-remote: writes remote value, updates hash, clears conflicts', async () => {
    const folder = await seed(root, 'v1', 'v1');
    const stage = newStage();
    await stage.apply({
      root,
      changes: [change(folder, { klass: 'take-remote', base: 'v1', local: 'v1', remote: 'v2' })],
    });
    const body = await readFile(join(folder, 'script.glide.js'), 'utf8');
    expect(body).toBe('v2');
    const meta = await new RecordMetadataService().read(folder);
    expect(meta?.$hash.script).toBe(hashContent('v2'));
    expect(meta?.$conflicts.script).toBe(false);
    expect(meta?.$sys_updated_on).toBe('2026-07-12 08:00:00');
    expect(meta?.$sys_mod_count).toBe(5);
  });

  it('keep-local: leaves the file unchanged', async () => {
    const folder = await seed(root, 'v1', 'v2-local');
    const stage = newStage();
    await stage.apply({
      root,
      changes: [
        change(folder, { klass: 'keep-local', base: 'v1', local: 'v2-local', remote: 'v1' }),
      ],
    });
    expect(await readFile(join(folder, 'script.glide.js'), 'utf8')).toBe('v2-local');
    const meta = await new RecordMetadataService().read(folder);
    expect(meta?.script).toBe('v1');
  });

  it('noop: does nothing', async () => {
    const folder = await seed(root, 'v1', 'v1');
    const stage = newStage();
    await stage.apply({
      root,
      changes: [change(folder, { klass: 'noop', base: 'v1', local: 'v1', remote: 'v1' })],
    });
    const meta = await new RecordMetadataService().read(folder);
    expect(meta?.$hash.script).toBe(hashContent('v1'));
  });

  it('merge (clean): merges non-overlapping edits, updates hash, clears conflicts', async () => {
    const base = 'line1\nline2\nline3\n';
    const local = 'line1-local\nline2\nline3\n';
    const remote = 'line1\nline2\nline3-remote\n';
    const folder = await seed(root, base, local);
    const stage = newStage();
    const res = await stage.apply({
      root,
      changes: [
        change(folder, {
          klass: 'merge',
          localChanged: true,
          remoteChanged: true,
          base,
          local,
          remote,
        }),
      ],
    });
    expect(res.conflicted).toHaveLength(0);
    const merged = await readFile(join(folder, 'script.glide.js'), 'utf8');
    expect(hasConflictMarkers(merged)).toBe(false);
    expect(merged).toContain('line1-local');
    expect(merged).toContain('line3-remote');
    const meta = await new RecordMetadataService().read(folder);
    expect(meta?.$conflicts.script).toBe(false);
    expect(meta?.$hash.script).toBe(hashContent(merged));
  });

  it('merge (conflict): writes markers, sets $conflicts, prints the spec message', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const base = 'shared\n';
    const local = 'local-change\n';
    const remote = 'remote-change\n';
    const folder = await seed(root, base, local);
    const stage = newStage();
    const res = await stage.apply({
      root,
      changes: [
        change(folder, {
          klass: 'merge',
          localChanged: true,
          remoteChanged: true,
          base,
          local,
          remote,
        }),
      ],
    });
    const body = await readFile(join(folder, 'script.glide.js'), 'utf8');
    expect(hasConflictMarkers(body)).toBe(true);
    expect(body).toContain('<<<<<<< HEAD');
    expect(body).toContain('>>>>>>> New-HEAD');
    expect(res.conflicted).toEqual(['my_scope/sys_script/rec/script.glide.js']);
    const meta = await new RecordMetadataService().read(folder);
    expect(meta?.$conflicts.script).toBe(true);
    expect(meta?.$hash.script).toBe(hashContent(body));
    expect(meta?.script).toBe(base);
    expect(log).toHaveBeenCalledWith(
      'The file "my_scope/sys_script/rec/script.glide.js" has one or more conflicts after merge. Sync was not completed for this file.',
    );
    log.mockRestore();
  });

  it('force-pull overwrites every column', async () => {
    const folder = await seed(root, 'v1', 'v2-local');
    const stage = newStage();
    await stage.apply({
      root,
      changes: [change(folder, { klass: 'merge', base: 'v1', local: 'v2-local', remote: 'v3' })],
      forcePull: true,
    });
    const body = await readFile(join(folder, 'script.glide.js'), 'utf8');
    expect(body).toBe('v3');
  });

  it('emits AIFY_FILE_WRITTEN for each file aify writes (OS-22)', async () => {
    const emit = vi.fn();
    const emitter = { emit } as unknown as import('@nestjs/event-emitter').EventEmitter2;
    const folder = await seed(root, 'v1', 'v1');
    const stage = new WriteStage(new RecordMetadataService(), emitter);
    await stage.apply({
      root,
      changes: [change(folder, { klass: 'take-remote', base: 'v1', local: 'v1', remote: 'v2' })],
    });
    expect(emit).toHaveBeenCalledWith(AIFY_FILE_WRITTEN, {
      filePath: join(folder, 'script.glide.js'),
    });
  });
});

describe('isConflictResolved', () => {
  it('is false while markers remain', () => {
    const conflicted = '<<<<<<< HEAD\na\n=======\nb\n>>>>>>> New-HEAD\n';
    expect(isConflictResolved(conflicted, hashContent(conflicted))).toBe(false);
  });

  it('is false when markers are gone but the hash is unchanged', () => {
    expect(isConflictResolved('resolved', hashContent('resolved'))).toBe(false);
  });

  it('is true when markers are gone and the hash changed', () => {
    const conflicted = '<<<<<<< HEAD\na\n=======\nb\n>>>>>>> New-HEAD\n';
    expect(isConflictResolved('resolved content', hashContent(conflicted))).toBe(true);
  });
});
