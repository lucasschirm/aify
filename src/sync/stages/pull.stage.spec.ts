/**
 * @file pull.stage.spec.ts
 * @description Tests for PullStage: direct tracked-table fetch by `sys_scope`, create/ignore,
 * deletions, pagination, and incremental date filters.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableApiClient } from '../../api/table-api.client';
import { RecordMetadataService } from '../../record-metadata/record-metadata.service';
import { PullStage } from './pull.stage';

const SCOPE = { sysId: 'app00000000000000000000000000001', scope: 'my_scope' };
const SNAUTH = { instanceUrl: 'https://dev123.service-now.com', username: 'u', password: 'p' };
const BASE = 'https://dev123.service-now.com';
const TRACK = {
  tables: [{ name: 'sys_script', columns: [{ name: 'script', type: 'glidescript' }] }],
  column_types: {
    glidescript: { file_name: 'script', extension: 'glide.js', behavior: 'glidescript' },
  },
};

const SCRIPT_PAGE_1 = [
  {
    sys_id: 'rec00000000000000000000000000001',
    sys_class_name: 'sys_script',
    sys_name: 'Alpha Rule',
    script: "gs.info('alpha v4');",
    sys_updated_on: '2026-07-10 12:00:00',
    sys_mod_count: '4',
  },
];

const SCRIPT_PAGE_2 = [
  {
    sys_id: 'rec00000000000000000000000000002',
    sys_class_name: 'sys_script',
    sys_name: 'Beta Rule',
    script: "gs.info('beta v2');",
    sys_updated_on: '2026-07-10 13:30:00',
    sys_mod_count: '2',
  },
];

function newStage() {
  return new PullStage(new TableApiClient(), new RecordMetadataService());
}

describe('PullStage.run — changed records', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'aify-pull-'));
    nock.cleanAll();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    nock.disableNetConnect();
  });

  it('creates new record folders and files on first pull (no date filter)', async () => {
    let query = '';
    let fields = '';
    nock(BASE)
      .get('/api/now/v2/table/sys_script')
      .query((q) => {
        query = q.sysparm_query as string;
        fields = q.sysparm_fields as string;
        return true;
      })
      .reply(
        200,
        { result: SCRIPT_PAGE_1 },
        { link: `<${BASE}/api/now/v2/table/sys_script?sysparm_offset=1>;rel="next"` },
      )
      .get('/api/now/v2/table/sys_script')
      .query({ sysparm_query: /.*/, sysparm_offset: '1' })
      .reply(200, { result: SCRIPT_PAGE_2 });

    const result = await newStage().run({ root, scope: SCOPE, snAuth: SNAUTH, trackConfig: TRACK });

    expect(query).toBe(`sys_scope=${SCOPE.sysId}`);
    expect(fields).toBe('script,sys_id,sys_updated_on,sys_mod_count,sys_name');
    expect(result.created).toHaveLength(2);
    expect(result.changed).toHaveLength(0);
    const file = join(root, 'my_scope', 'sys_script', 'alpha-rule', 'script.glide.js');
    expect(await readFile(file, 'utf8')).toBe("gs.info('alpha v4');");
  });

  it('skips unchanged records on subsequent pulls', async () => {
    nock(BASE)
      .get('/api/now/v2/table/sys_script')
      .query(() => true)
      .reply(200, { result: SCRIPT_PAGE_1 });

    const first = await newStage().run({ root, scope: SCOPE, snAuth: SNAUTH, trackConfig: TRACK });
    expect(first.created).toHaveLength(1);

    nock.cleanAll();
    nock(BASE)
      .get('/api/now/v2/table/sys_script')
      .query(() => true)
      .reply(200, { result: SCRIPT_PAGE_1 })
      .get('/api/now/v2/table/sys_metadata_delete')
      .query(() => true)
      .reply(200, { result: [] });

    const second = await newStage().run({
      root,
      scope: SCOPE,
      snAuth: SNAUTH,
      trackConfig: TRACK,
      lastUpdated: '2026-07-09 00:00:00',
    });
    expect(second.created).toHaveLength(0);
    expect(second.changed).toHaveLength(0);
  });

  it('detects changed records on subsequent pulls', async () => {
    // First pull: create the record locally
    nock(BASE)
      .get('/api/now/v2/table/sys_script')
      .query(() => true)
      .reply(200, { result: SCRIPT_PAGE_1 });
    await newStage().run({ root, scope: SCOPE, snAuth: SNAUTH, trackConfig: TRACK });

    // Second pull: same record but with updated sys_updated_on / sys_mod_count
    nock.cleanAll();
    const updated = [
      {
        sys_id: 'rec00000000000000000000000000001',
        sys_class_name: 'sys_script',
        sys_name: 'Alpha Rule',
        script: "gs.info('alpha v5');",
        sys_updated_on: '2026-07-11 12:00:00',
        sys_mod_count: '5',
      },
    ];
    nock(BASE)
      .get('/api/now/v2/table/sys_script')
      .query(() => true)
      .reply(200, { result: updated })
      .get('/api/now/v2/table/sys_metadata_delete')
      .query(() => true)
      .reply(200, { result: [] });

    const result = await newStage().run({
      root,
      scope: SCOPE,
      snAuth: SNAUTH,
      trackConfig: TRACK,
      lastUpdated: '2026-07-09 00:00:00',
    });
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].sysId).toBe('rec00000000000000000000000000001');
  });

  it('deletes local records reported by sys_metadata_delete', async () => {
    nock(BASE)
      .get('/api/now/v2/table/sys_script')
      .query(() => true)
      .reply(200, { result: SCRIPT_PAGE_1 });
    await newStage().run({ root, scope: SCOPE, snAuth: SNAUTH, trackConfig: TRACK });

    nock.cleanAll();
    nock(BASE)
      .get('/api/now/v2/table/sys_script')
      .query(() => true)
      .reply(200, { result: [] })
      .get('/api/now/v2/table/sys_metadata_delete')
      .query(() => true)
      .reply(200, {
        result: [
          {
            sys_id: 'rec00000000000000000000000000001',
            sys_class_name: 'sys_script',
            sys_updated_on: '2026-07-11 09:00:00',
          },
        ],
      });

    const result = await newStage().run({
      root,
      scope: SCOPE,
      snAuth: SNAUTH,
      trackConfig: TRACK,
      lastUpdated: '2026-07-10 12:00:00',
    });
    expect(result.deleted.length).toBeGreaterThan(0);
  });

  it('pulls records directly from the tracked table even when sys_metadata is not the source', async () => {
    // No sys_metadata mock is registered; the stage must fetch from the child table only.
    nock(BASE)
      .get('/api/now/v2/table/sys_script')
      .query(() => true)
      .reply(200, { result: SCRIPT_PAGE_1 });

    const result = await newStage().run({ root, scope: SCOPE, snAuth: SNAUTH, trackConfig: TRACK });

    expect(result.created).toHaveLength(1);
    expect(result.changed).toHaveLength(0);
  });
});
