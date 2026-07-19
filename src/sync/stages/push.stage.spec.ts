/**
 * @file push.stage.spec.ts
 * @description Tests for PushStage: PATCH only-changed columns, metadata refresh, missing-sys_id skip.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableApiClient } from '../../api/table-api.client';
import { hashContent } from '../../common/hashing/content-hash';
import { RecordMetadataService } from '../../record-metadata/record-metadata.service';
import type { RecordMetadata } from '../../record-metadata/record-metadata.types';
import type { ColumnChange } from '../sync.types';
import { PushStage } from './push.stage';

const SNAUTH = { instanceUrl: 'https://dev123.service-now.com', username: 'u', password: 'p' };
const BASE = 'https://dev123.service-now.com';
const PATCH_RESPONSE = {
  result: {
    sys_id: 'rec1',
    script: 'pushed body',
    another: 'unchanged remote',
    sys_updated_on: '2026-07-12 08:00:00',
    sys_mod_count: '5',
  },
};

function newStage() {
  return new PushStage(new TableApiClient(), new RecordMetadataService());
}

async function seed(
  root: string,
  sysId: string,
  extra: Partial<RecordMetadata> = {},
): Promise<string> {
  const folder = join(root, 'my_scope', 'sys_script', 'rec');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'script.glide.js'), 'pushed body');
  await writeFile(join(folder, 'another.glide.js'), 'unchanged local');
  const meta: RecordMetadata = {
    $sys_id: sysId,
    $table: 'sys_script',
    $display_value: 'Rec',
    $parsed_display_value: 'rec',
    $sys_updated_on: '2026-07-10 12:00:00',
    $sys_mod_count: 3,
    script: 'old',
    another: 'unchanged local',
    $hash: { script: hashContent('old'), another: hashContent('unchanged local') },
    $conflicts: { script: false, another: false },
    ...extra,
  };
  await new RecordMetadataService().write(folder, meta);
  return folder;
}

function change(folder: string, column: string, over: Partial<ColumnChange> = {}): ColumnChange {
  return {
    sysId: 'rec1',
    table: 'sys_script',
    column,
    localChanged: true,
    remoteChanged: false,
    klass: 'keep-local',
    base: '',
    local: '',
    remote: '',
    folder,
    filePath: join(folder, `${column}.glide.js`),
    ...over,
  };
}

describe('PushStage.push', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'aify-push-'));
    nock.cleanAll();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('PATCHes only the changed column and refreshes hash/sys_updated_on/sys_mod_count', async () => {
    const folder = await seed(root, 'rec1');
    let sentBody: unknown;
    nock(BASE)
      .patch('/api/now/v2/table/sys_script/rec1', (body) => {
        sentBody = body;
        return true;
      })
      .reply(200, PATCH_RESPONSE);

    const res = await newStage().push({ snAuth: SNAUTH, changes: [change(folder, 'script')] });

    expect(sentBody).toEqual({ script: 'pushed body' });
    expect(res.pushed).toEqual(['rec1']);
    const meta = await new RecordMetadataService().read(folder);
    expect(meta?.$hash.script).toBe(hashContent('pushed body'));
    expect(meta?.script).toBe('pushed body');
    expect(meta?.$sys_updated_on).toBe('2026-07-12 08:00:00');
    expect(meta?.$sys_mod_count).toBe(5);
  });

  it('skips a record with no $sys_id and warns (never PATCHes)', async () => {
    const folder = await seed(root, '');
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const patch = nock(BASE).patch(/.*/).reply(200, PATCH_RESPONSE);

    const res = await newStage().push({ snAuth: SNAUTH, changes: [change(folder, 'script')] });

    expect(res.pushed).toHaveLength(0);
    expect(res.skipped).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no $sys_id'));
    expect(patch.isDone()).toBe(false);
    warn.mockRestore();
    nock.cleanAll();
  });
});
