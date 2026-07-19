/**
 * @file conflict-check.stage.spec.ts
 * @description Tests for ConflictCheckStage: local/remote hash classification into the 4 quadrants,
 * plus detectLocalChanges for local-only edits.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashContent } from '../../common/hashing/content-hash';
import { RecordMetadataService } from '../../record-metadata/record-metadata.service';
import type { RecordMetadata } from '../../record-metadata/record-metadata.types';
import { ConflictCheckStage } from './conflict-check.stage';
import type { PulledRecord } from './pull.stage';

const TRACK = {
  tables: [{ name: 'sys_script', columns: [{ name: 'script', type: 'glidescript' }] }],
  column_types: {
    glidescript: { file_name: 'script', extension: 'glide.js', behavior: 'glidescript' },
  },
};

async function makeRecord(
  root: string,
  fileBody: string,
  base: string,
  remote: string,
): Promise<PulledRecord> {
  const folder = join(root, 'my_scope', 'sys_script', 'rec');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'script.glide.js'), fileBody);
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
  };
  return {
    table: 'sys_script',
    sysId: 'rec1',
    folder,
    meta,
    remote: { sys_id: 'rec1', script: remote },
  };
}

/** Seed a local record on disk (folder + file + record_metadata.json). */
async function seedLocal(
  root: string,
  sysId: string,
  fileBody: string,
  storedHash?: string,
): Promise<string> {
  const folder = join(root, 'my_scope', 'sys_script', `rec-${sysId.slice(0, 8)}`);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'script.glide.js'), fileBody);
  const meta: RecordMetadata = {
    $sys_id: sysId,
    $table: 'sys_script',
    $display_value: `Rec ${sysId}`,
    $parsed_display_value: `rec-${sysId.slice(0, 8)}`,
    $sys_updated_on: '2026-07-10 12:00:00',
    $sys_mod_count: 3,
    script: fileBody,
    $hash: { script: storedHash ?? hashContent(fileBody) },
    $conflicts: { script: false },
  };
  await new RecordMetadataService().write(folder, meta);
  return folder;
}

describe('ConflictCheckStage.classify', () => {
  let root: string;
  const stage = new ConflictCheckStage(new RecordMetadataService());
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'aify-cc-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('noop when neither side changed', async () => {
    const [c] = await stage.classify([await makeRecord(root, 'v1', 'v1', 'v1')], TRACK);
    expect(c).toMatchObject({ localChanged: false, remoteChanged: false, klass: 'noop' });
    expect(c.filePath).toBe(join(root, 'my_scope', 'sys_script', 'rec', 'script.glide.js'));
  });

  it('take-remote when only the instance changed', async () => {
    const [c] = await stage.classify([await makeRecord(root, 'v1', 'v1', 'v2-remote')], TRACK);
    expect(c).toMatchObject({
      localChanged: false,
      remoteChanged: true,
      klass: 'take-remote',
      remote: 'v2-remote',
    });
  });

  it('keep-local when only the file changed', async () => {
    const [c] = await stage.classify([await makeRecord(root, 'v2-local', 'v1', 'v1')], TRACK);
    expect(c).toMatchObject({
      localChanged: true,
      remoteChanged: false,
      klass: 'keep-local',
      local: 'v2-local',
    });
  });

  it('merge when both sides changed', async () => {
    const [c] = await stage.classify(
      [await makeRecord(root, 'v2-local', 'v1', 'v2-remote')],
      TRACK,
    );
    expect(c).toMatchObject({
      localChanged: true,
      remoteChanged: true,
      klass: 'merge',
      base: 'v1',
      local: 'v2-local',
      remote: 'v2-remote',
    });
  });
});

describe('ConflictCheckStage.detectLocalChanges', () => {
  let root: string;
  const stage = new ConflictCheckStage(new RecordMetadataService());
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'aify-cc-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('detects a local-only edit and returns it as keep-local', async () => {
    // Seed a record whose file matches the stored hash, then edit the file.
    const sysId = 'rec00000000000000000000000000001';
    await seedLocal(root, sysId, 'original');
    const folder = join(root, 'my_scope', 'sys_script', `rec-${sysId.slice(0, 8)}`);
    await writeFile(join(folder, 'script.glide.js'), 'user-edited');

    const changes = await stage.detectLocalChanges(root, 'my_scope', TRACK, new Set());
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      sysId,
      table: 'sys_script',
      column: 'script',
      localChanged: true,
      remoteChanged: false,
      klass: 'keep-local',
      local: 'user-edited',
    });
  });

  it('skips records whose file hash matches the stored hash (no change)', async () => {
    const sysId = 'rec00000000000000000000000000002';
    await seedLocal(root, sysId, 'unchanged');

    const changes = await stage.detectLocalChanges(root, 'my_scope', TRACK, new Set());
    expect(changes).toHaveLength(0);
  });

  it('skips records already in the remoteChangedIds set (handled by classify)', async () => {
    const sysId = 'rec00000000000000000000000000003';
    await seedLocal(root, sysId, 'original');
    const folder = join(root, 'my_scope', 'sys_script', `rec-${sysId.slice(0, 8)}`);
    await writeFile(join(folder, 'script.glide.js'), 'user-edited');

    const changes = await stage.detectLocalChanges(root, 'my_scope', TRACK, new Set([sysId]));
    expect(changes).toHaveLength(0);
  });

  it('detects multiple local-only edits across records', async () => {
    const id1 = 'aaa11111111111111111111111111111';
    const id2 = 'bbb22222222222222222222222222222';
    await seedLocal(root, id1, 'original-1');
    await seedLocal(root, id2, 'original-2');
    await writeFile(
      join(root, 'my_scope', 'sys_script', `rec-${id1.slice(0, 8)}`, 'script.glide.js'),
      'edited-1',
    );
    await writeFile(
      join(root, 'my_scope', 'sys_script', `rec-${id2.slice(0, 8)}`, 'script.glide.js'),
      'edited-2',
    );

    const changes = await stage.detectLocalChanges(root, 'my_scope', TRACK, new Set());
    expect(changes).toHaveLength(2);
    const ids = changes.map((c) => c.sysId).sort();
    expect(ids).toEqual([id1, id2].sort());
  });
});
