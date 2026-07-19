/**
 * @file pull.stage.spec.ts
 * @description Tests for PullStage: sys_metadata fetch, child fetch, create/ignore, deletions,
 * pagination, and incremental date filters.
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

const META_PAGE_1 = [
  {
    sys_id: 'rec00000000000000000000000000001',
    sys_class_name: 'sys_script',
    sys_updated_on: '2026-07-10 12:00:00',
    sys_mod_count: '4',
    sys_name: 'Alpha Rule',
  },
];

const META_PAGE_2 = [
  {
    sys_id: 'rec00000000000000000000000000002',
    sys_class_name: 'sys_script',
    sys_updated_on: '2026-07-10 13:30:00',
    sys_mod_count: '2',
    sys_name: 'Beta Rule',
  },
];

const SCRIPT_DATA = [
  {
    sys_id: 'rec00000000000000000000000000001',
    script: "gs.info('alpha v4');",
    sys_updated_on: '2026-07-10 12:00:00',
    sys_mod_count: '4',
  },
  {
    sys_id: 'rec00000000000000000000000000002',
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
    let metaQuery = '';
    let childQuery = '';
    nock(BASE)
      .get('/api/now/v2/table/sys_metadata')
      .query((q) => {
        metaQuery = q.sysparm_query as string;
        return true;
      })
      .reply(
        200,
        { result: META_PAGE_1 },
        { link: `<${BASE}/api/now/v2/table/sys_metadata?sysparm_offset=1>;rel="next"` },
      )
      .get('/api/now/v2/table/sys_metadata')
      .query({ sysparm_query: /.*/, sysparm_offset: '1' })
      .reply(200, { result: META_PAGE_2 })
      .get('/api/now/v2/table/sys_script')
      .query((q) => {
        childQuery = q.sysparm_query as string;
        return true;
      })
      .reply(200, { result: SCRIPT_DATA });

    const result = await newStage().run({ root, scope: SCOPE, snAuth: SNAUTH, trackConfig: TRACK });

    expect(metaQuery).toBe(`sys_scope=${SCOPE.sysId}^sys_class_nameINsys_script`);
    expect(childQuery).toBe(
      'sys_idINrec00000000000000000000000000001,rec00000000000000000000000000002',
    );
    expect(result.created).toHaveLength(2);
    expect(result.changed).toHaveLength(0);
    const file = join(root, 'my_scope', 'sys_script', 'alpha-rule', 'script.glide.js');
    expect(await readFile(file, 'utf8')).toBe("gs.info('alpha v4');");
  });

  it('skips unchanged records on subsequent pulls', async () => {
    nock(BASE)
      .get('/api/now/v2/table/sys_metadata')
      .query(() => true)
      .reply(200, { result: META_PAGE_1 })
      .get('/api/now/v2/table/sys_script')
      .query(() => true)
      .reply(200, { result: SCRIPT_DATA });

    const first = await newStage().run({ root, scope: SCOPE, snAuth: SNAUTH, trackConfig: TRACK });
    expect(first.created).toHaveLength(1);

    nock.cleanAll();
    nock(BASE)
      .get('/api/now/v2/table/sys_metadata')
      .query(() => true)
      .reply(200, { result: META_PAGE_1 })
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
      .get('/api/now/v2/table/sys_metadata')
      .query(() => true)
      .reply(200, { result: META_PAGE_1 })
      .get('/api/now/v2/table/sys_script')
      .query(() => true)
      .reply(200, { result: SCRIPT_DATA });
    await newStage().run({ root, scope: SCOPE, snAuth: SNAUTH, trackConfig: TRACK });

    // Second pull: same record but with updated sys_updated_on / sys_mod_count
    nock.cleanAll();
    const updated = [
      {
        sys_id: 'rec00000000000000000000000000001',
        sys_class_name: 'sys_script',
        sys_updated_on: '2026-07-11 12:00:00',
        sys_mod_count: '5',
        sys_name: 'Alpha Rule',
      },
    ];
    nock(BASE)
      .get('/api/now/v2/table/sys_metadata')
      .query(() => true)
      .reply(200, { result: updated })
      .get('/api/now/v2/table/sys_script')
      .query(() => true)
      .reply(200, {
        result: [
          {
            sys_id: 'rec00000000000000000000000000001',
            script: "gs.info('alpha v5');",
            sys_updated_on: '2026-07-11 12:00:00',
            sys_mod_count: '5',
          },
        ],
      })
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
      .get('/api/now/v2/table/sys_metadata')
      .query(() => true)
      .reply(200, { result: META_PAGE_1 })
      .get('/api/now/v2/table/sys_script')
      .query(() => true)
      .reply(200, { result: SCRIPT_DATA });
    await newStage().run({ root, scope: SCOPE, snAuth: SNAUTH, trackConfig: TRACK });

    nock.cleanAll();
    nock(BASE)
      .get('/api/now/v2/table/sys_metadata')
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
});
