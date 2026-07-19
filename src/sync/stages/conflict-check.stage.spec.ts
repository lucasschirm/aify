/**
 * @file conflict-check.stage.spec.ts
 * @description Tests for ConflictCheckStage: local/remote hash classification into the 4 quadrants.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashContent } from '../../common/hashing/content-hash';
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

describe('ConflictCheckStage.classify', () => {
  let root: string;
  const stage = new ConflictCheckStage();
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
