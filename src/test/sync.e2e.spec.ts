/**
 * @file sync.e2e.spec.ts
 * @description E2E test for the `aify sync` command. Boots the real nest-commander application
 *   via `CommandTestFactory` with the actual `SyncModule` graph — including the REAL
 *   `TableApiClient` — and drives `aify sync` against a ServiceNow instance mocked at the HTTP
 *   layer with `nock`. This exercises the whole pull → conflict-check → write → push pipeline
 *   end to end: Basic-auth headers, `/api/now/v2/table/...` paths, `Link rel="next"`
 *   pagination, query building, and PATCH pushes all run for real.
 *
 *   Hermeticity: `CredentialStore` (keychain), `PromptService` (interactive prompts), and
 *   `SpinnerService` (terminal spinner) are mocked; `DatabaseModule.forRoot(':memory:')`
 *   provides an in-memory SQLite; `nock.disableNetConnect()` blocks any request that isn't
 *   explicitly mocked. `HOME` and the working directory are relocated to fresh temp
 *   directories per test so `TrackedTablesService`'s global config read and
 *   `ProjectConfigService`'s project-root walk never touch the real machine.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { TestingModule } from '@nestjs/testing';
import { CommandTestFactory } from 'nest-commander-testing';
import nock from 'nock';
import { Sequelize } from 'sequelize-typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialStore } from '../authentication/credential-store.service';
import { PromptService } from '../authentication/prompt.service';
import { hashContent } from '../common/hashing/content-hash';
import { slugifyDisplayValue } from '../common/normalization/slugify';
import { DatabaseModule } from '../database/database.module';
import { Auth } from '../database/models/auth.model';
import { Instance } from '../database/models/instance.model';
import { RecordMetadataService } from '../record-metadata/record-metadata.service';
import type { RecordMetadata } from '../record-metadata/record-metadata.types';
import { SyncModule } from '../sync/sync.module';
import { SpinnerService } from '../ui/spinner.service';

const INSTANCE_HOST = 'dev.service-now.com';
const BASE_URL = `https://${INSTANCE_HOST}`;
const INSTANCE_URL = `${BASE_URL}/`;
const USERNAME = 'admin';
const PASSWORD = 's3cret';
const BASIC_AUTH = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}`;

const SCOPE = 'x_test_app';
const SCOPE_SYS_ID = 'scope000000000000000000000000001';
const TABLE = 'x_widget';

const SYS_ID_1 = 'rec00000000000000000000000000001';
const SYS_ID_2 = 'rec00000000000000000000000000002';

function projectConfigFixture(scopes: { sysId: string; scope: string }[]) {
  return {
    project: { scopes },
    tables: [{ name: TABLE, columns: [{ name: 'source', type: 'js' }] }],
    column_types: { js: { file_name: 'source', extension: 'js', behavior: 'text' } },
  };
}

/**
 * Nock query predicate for incremental `sys_updated_on>` filters. Requires the raw UTC
 * timestamp literal and rejects a `javascript:gs.dateGenerate(...)` wrapper.
 *
 * Regression guard: ServiceNow's `gs.dateGenerate()` interprets its arguments in the
 * calling user's SESSION time zone and converts to UTC, but the `sys_updated_on` value we
 * feed it is already UTC — wrapping it silently shifts the "changed since" threshold and
 * drops remote edits made shortly after the last sync (see encoded-query.builder.ts's
 * `dateGenerate()` doc). If a future change reintroduces that wrapper, this predicate stops
 * matching, `nock.disableNetConnect()` rejects the request, and the scenario's assertion on
 * the resulting file content fails — exactly reproducing the real-world symptom: a remote
 * edit that silently never reaches the local file.
 */
function requireRawUtcDateFilter(sinceTimestamp: string) {
  return (actualQuery: Record<string, string>): boolean => {
    const query = actualQuery.sysparm_query ?? '';
    return query.includes(`sys_updated_on>${sinceTimestamp}`) && !query.includes('gs.dateGenerate');
  };
}

describe('sync command (E2E)', () => {
  let projectRoot: string;
  let homeRoot: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let commandInstance: TestingModule;
  let sequelize: Sequelize;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let records: RecordMetadataService;

  async function writeProjectConfig(
    scopes: { sysId: string; scope: string }[] = [{ sysId: SCOPE_SYS_ID, scope: SCOPE }],
  ): Promise<void> {
    await writeFile(
      join(projectRoot, '.aify.config.json'),
      JSON.stringify(projectConfigFixture(scopes), null, 2),
    );
  }

  /** Seed an on-disk record as if a prior `aify sync` had already pulled it. */
  async function seedRecord(opts: {
    displayValue: string;
    sysId: string;
    content: string;
    sysUpdatedOn: string;
    sysModCount: number;
  }): Promise<string> {
    const folder = records.recordFolder(projectRoot, SCOPE, TABLE, opts.displayValue, opts.sysId);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'source.js'), opts.content, 'utf8');
    const meta: RecordMetadata = {
      $sys_id: opts.sysId,
      $table: TABLE,
      $display_value: opts.displayValue,
      $parsed_display_value: slugifyDisplayValue(opts.displayValue, opts.sysId),
      $sys_updated_on: opts.sysUpdatedOn,
      $sys_mod_count: opts.sysModCount,
      $hash: { source: hashContent(opts.content) },
      $conflicts: { source: false },
      source: opts.content,
    };
    await records.write(folder, meta);
    return folder;
  }

  async function readMeta(folder: string): Promise<RecordMetadata> {
    return JSON.parse(await readFile(join(folder, 'record_metadata.json'), 'utf8'));
  }

  function stderrOutput(): string {
    return stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
  }

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalHome = process.env.HOME;
    homeRoot = await mkdtemp(join(tmpdir(), 'aify-sync-home-'));
    projectRoot = await mkdtemp(join(tmpdir(), 'aify-sync-proj-'));
    process.env.HOME = homeRoot;
    process.chdir(projectRoot);
    await writeProjectConfig();

    records = new RecordMetadataService();

    nock.disableNetConnect();

    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const credentials = {
      getPassword: vi.fn().mockResolvedValue(PASSWORD),
      setPassword: vi.fn().mockResolvedValue(undefined),
      deletePassword: vi.fn().mockResolvedValue(undefined),
    };
    const prompt = {
      confirm: vi.fn().mockResolvedValue(true),
      awaitKeypress: vi.fn().mockResolvedValue(true),
      input: vi.fn(),
      password: vi.fn(),
      select: vi.fn(),
    };
    const spinner = {
      start: vi.fn(),
      text: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      info: vi.fn(),
      stop: vi.fn(),
    };

    commandInstance = await CommandTestFactory.createTestingCommand({
      imports: [EventEmitterModule.forRoot(), DatabaseModule.forRoot(':memory:'), SyncModule],
    })
      .overrideProvider(CredentialStore)
      .useValue(credentials as unknown as CredentialStore)
      .overrideProvider(PromptService)
      .useValue(prompt as unknown as PromptService)
      .overrideProvider(SpinnerService)
      .useValue(spinner as unknown as SpinnerService)
      .compile();

    // Initialize now (rather than letting CommandTestFactory.run do it) so DatabaseModule's
    // onModuleInit (sequelize.sync()) runs before we seed Auth/Instance rows below.
    await commandInstance.init();
    sequelize = commandInstance.get(Sequelize);

    const instance = await Instance.create({ instance: INSTANCE_HOST, url: INSTANCE_URL });
    await Auth.create({
      alias: 'dev',
      username: USERNAME,
      instanceId: instance.id,
      isCurrent: true,
    });
  });

  afterEach(async () => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    nock.cleanAll();
    nock.enableNetConnect();
    if (sequelize) await sequelize.close();
    process.chdir(originalCwd);
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await rm(projectRoot, { recursive: true, force: true });
    await rm(homeRoot, { recursive: true, force: true });
  });

  it('first pull creates a new record folder with the remote content', async () => {
    const scope = nock(BASE_URL, { reqheaders: { authorization: BASIC_AUTH } })
      .get('/api/now/v2/table/sys_metadata')
      .query(true)
      .reply(200, {
        result: [
          {
            sys_id: SYS_ID_1,
            sys_class_name: TABLE,
            sys_updated_on: '2026-07-01 10:00:00',
            sys_mod_count: '1',
            sys_name: 'Hello Widget',
          },
        ],
      })
      .get(`/api/now/v2/table/${TABLE}`)
      .query(true)
      .reply(200, {
        result: [
          {
            sys_id: SYS_ID_1,
            source: 'console.log("v1");',
            sys_updated_on: '2026-07-01 10:00:00',
            sys_mod_count: '1',
          },
        ],
      });

    await CommandTestFactory.run(commandInstance, ['sync', '--yes']);

    const folder = join(projectRoot, SCOPE, TABLE, 'hello-widget');
    expect(await readFile(join(folder, 'source.js'), 'utf8')).toBe('console.log("v1");');
    const meta = await readMeta(folder);
    expect(meta.$sys_id).toBe(SYS_ID_1);
    expect(meta.$hash.source).toBe(hashContent('console.log("v1");'));
    expect(scope.isDone()).toBe(true);
  });

  it('incremental pull takes the remote value when only the instance changed', async () => {
    const folder = await seedRecord({
      displayValue: 'Hello Widget',
      sysId: SYS_ID_1,
      content: 'console.log("v1");',
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });

    nock(BASE_URL)
      .get('/api/now/v2/table/sys_metadata')
      .query(requireRawUtcDateFilter('2026-07-01 10:00:00'))
      .reply(200, {
        result: [
          {
            sys_id: SYS_ID_1,
            sys_class_name: TABLE,
            sys_updated_on: '2026-07-02 09:00:00',
            sys_mod_count: '2',
            sys_name: 'Hello Widget',
          },
        ],
      })
      .get(`/api/now/v2/table/${TABLE}`)
      .query(true)
      .reply(200, {
        result: [
          {
            sys_id: SYS_ID_1,
            source: 'console.log("v2");',
            sys_updated_on: '2026-07-02 09:00:00',
            sys_mod_count: '2',
          },
        ],
      })
      .get('/api/now/v2/table/sys_metadata_delete')
      .query(requireRawUtcDateFilter('2026-07-01 10:00:00'))
      .reply(200, { result: [] });

    await CommandTestFactory.run(commandInstance, ['sync', '--yes']);

    expect(await readFile(join(folder, 'source.js'), 'utf8')).toBe('console.log("v2");');
    const meta = await readMeta(folder);
    expect(meta.$hash.source).toBe(hashContent('console.log("v2");'));
    expect(meta.$sys_updated_on).toBe('2026-07-02 09:00:00');
    expect(meta.$sys_mod_count).toBe(2);
  });

  it('pushes a local-only edit to the instance (keep-local)', async () => {
    const folder = await seedRecord({
      displayValue: 'Hello Widget',
      sysId: SYS_ID_1,
      content: 'console.log("v1");',
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });
    await writeFile(join(folder, 'source.js'), 'console.log("edited-locally");', 'utf8');

    nock(BASE_URL)
      .get('/api/now/v2/table/sys_metadata')
      .query(requireRawUtcDateFilter('2026-07-01 10:00:00'))
      .reply(200, { result: [] })
      .get('/api/now/v2/table/sys_metadata_delete')
      .query(requireRawUtcDateFilter('2026-07-01 10:00:00'))
      .reply(200, { result: [] });

    const patchScope = nock(BASE_URL)
      .patch(`/api/now/v2/table/${TABLE}/${SYS_ID_1}`, {
        source: 'console.log("edited-locally");',
      })
      .reply(200, {
        result: {
          sys_id: SYS_ID_1,
          source: 'console.log("edited-locally");',
          sys_updated_on: '2026-07-03 11:00:00',
          sys_mod_count: '2',
        },
      });

    await CommandTestFactory.run(commandInstance, ['sync', '--yes']);

    expect(patchScope.isDone()).toBe(true);
    const meta = await readMeta(folder);
    expect(meta.$hash.source).toBe(hashContent('console.log("edited-locally");'));
    expect(meta.$sys_updated_on).toBe('2026-07-03 11:00:00');
    expect(meta.$sys_mod_count).toBe(2);
  });

  it('writes git conflict markers when local and remote edit the same line', async () => {
    const base = 'line1\nline2\nline3';
    const folder = await seedRecord({
      displayValue: 'Hello Widget',
      sysId: SYS_ID_1,
      content: base,
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });
    await writeFile(join(folder, 'source.js'), 'line1\nLOCAL_EDIT\nline3', 'utf8');

    nock(BASE_URL)
      .get('/api/now/v2/table/sys_metadata')
      .query(requireRawUtcDateFilter('2026-07-01 10:00:00'))
      .reply(200, {
        result: [
          {
            sys_id: SYS_ID_1,
            sys_class_name: TABLE,
            sys_updated_on: '2026-07-04 08:00:00',
            sys_mod_count: '2',
            sys_name: 'Hello Widget',
          },
        ],
      })
      .get(`/api/now/v2/table/${TABLE}`)
      .query(true)
      .reply(200, {
        result: [
          {
            sys_id: SYS_ID_1,
            source: 'line1\nREMOTE_EDIT\nline3',
            sys_updated_on: '2026-07-04 08:00:00',
            sys_mod_count: '2',
          },
        ],
      })
      .get('/api/now/v2/table/sys_metadata_delete')
      .query(requireRawUtcDateFilter('2026-07-01 10:00:00'))
      .reply(200, { result: [] });

    await CommandTestFactory.run(commandInstance, ['sync', '--yes']);

    const content = await readFile(join(folder, 'source.js'), 'utf8');
    expect(content).toContain('<<<<<<< HEAD');
    expect(content).toContain('LOCAL_EDIT');
    expect(content).toContain('=======');
    expect(content).toContain('REMOTE_EDIT');
    expect(content).toContain('>>>>>>> New-HEAD');

    const meta = await readMeta(folder);
    expect(meta.$conflicts.source).toBe(true);
    expect(stderrOutput()).toContain('is in conflict');
  });

  it('follows Link rel="next" pagination across sys_metadata pages', async () => {
    const nextUrl = `${BASE_URL}/api/now/v2/table/sys_metadata?sysparm_offset=1`;
    nock(BASE_URL)
      .get('/api/now/v2/table/sys_metadata')
      .query(true)
      .reply(
        200,
        {
          result: [
            {
              sys_id: SYS_ID_1,
              sys_class_name: TABLE,
              sys_updated_on: '2026-07-01 10:00:00',
              sys_mod_count: '1',
              sys_name: 'Widget Alpha',
            },
          ],
        },
        { link: `<${nextUrl}>;rel="next"` },
      )
      .get('/api/now/v2/table/sys_metadata')
      .query(true)
      .reply(200, {
        result: [
          {
            sys_id: SYS_ID_2,
            sys_class_name: TABLE,
            sys_updated_on: '2026-07-01 11:00:00',
            sys_mod_count: '1',
            sys_name: 'Widget Beta',
          },
        ],
      })
      .get(`/api/now/v2/table/${TABLE}`)
      .query(true)
      .reply(200, {
        result: [
          {
            sys_id: SYS_ID_1,
            source: 'console.log("alpha");',
            sys_updated_on: '2026-07-01 10:00:00',
            sys_mod_count: '1',
          },
          {
            sys_id: SYS_ID_2,
            source: 'console.log("beta");',
            sys_updated_on: '2026-07-01 11:00:00',
            sys_mod_count: '1',
          },
        ],
      });

    await CommandTestFactory.run(commandInstance, ['sync', '--yes']);

    const folderA = join(projectRoot, SCOPE, TABLE, 'widget-alpha');
    const folderB = join(projectRoot, SCOPE, TABLE, 'widget-beta');
    expect(await readFile(join(folderA, 'source.js'), 'utf8')).toBe('console.log("alpha");');
    expect(await readFile(join(folderB, 'source.js'), 'utf8')).toBe('console.log("beta");');
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('removes the local folder for a record reported by sys_metadata_delete', async () => {
    const folder = await seedRecord({
      displayValue: 'Hello Widget',
      sysId: SYS_ID_1,
      content: 'console.log("v1");',
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });

    nock(BASE_URL)
      .get('/api/now/v2/table/sys_metadata')
      .query(requireRawUtcDateFilter('2026-07-01 10:00:00'))
      .reply(200, { result: [] })
      .get('/api/now/v2/table/sys_metadata_delete')
      .query(requireRawUtcDateFilter('2026-07-01 10:00:00'))
      .reply(200, {
        result: [
          { sys_id: SYS_ID_1, sys_class_name: TABLE, sys_updated_on: '2026-07-05 09:00:00' },
        ],
      });

    await CommandTestFactory.run(commandInstance, ['sync', '--yes']);

    await expect(readFile(join(folder, 'source.js'), 'utf8')).rejects.toThrow();
  });

  it('--force-pull overwrites local edits with the remote value and skips push', async () => {
    const folder = await seedRecord({
      displayValue: 'Hello Widget',
      sysId: SYS_ID_1,
      content: 'console.log("v1");',
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });
    await writeFile(join(folder, 'source.js'), 'console.log("local-edit-to-discard");', 'utf8');

    nock(BASE_URL)
      .get('/api/now/v2/table/sys_metadata')
      .query(requireRawUtcDateFilter('2026-07-01 10:00:00'))
      .reply(200, {
        result: [
          {
            sys_id: SYS_ID_1,
            sys_class_name: TABLE,
            sys_updated_on: '2026-07-06 10:00:00',
            sys_mod_count: '2',
            sys_name: 'Hello Widget',
          },
        ],
      })
      .get(`/api/now/v2/table/${TABLE}`)
      .query(true)
      .reply(200, {
        result: [
          {
            sys_id: SYS_ID_1,
            source: 'console.log("from-instance");',
            sys_updated_on: '2026-07-06 10:00:00',
            sys_mod_count: '2',
          },
        ],
      })
      .get('/api/now/v2/table/sys_metadata_delete')
      .query(requireRawUtcDateFilter('2026-07-01 10:00:00'))
      .reply(200, { result: [] });

    await CommandTestFactory.run(commandInstance, ['sync', '--force-pull', '--yes']);

    expect(await readFile(join(folder, 'source.js'), 'utf8')).toBe('console.log("from-instance");');
  });

  it('--force-push uploads every tracked column without pulling first', async () => {
    const folder = await seedRecord({
      displayValue: 'Hello Widget',
      sysId: SYS_ID_1,
      content: 'console.log("push-me");',
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });

    const patchScope = nock(BASE_URL)
      .patch(`/api/now/v2/table/${TABLE}/${SYS_ID_1}`, { source: 'console.log("push-me");' })
      .reply(200, {
        result: {
          sys_id: SYS_ID_1,
          source: 'console.log("push-me");',
          sys_updated_on: '2026-07-07 12:00:00',
          sys_mod_count: '2',
        },
      });

    await CommandTestFactory.run(commandInstance, ['sync', '--force-push', '--yes']);

    expect(patchScope.isDone()).toBe(true);
    const meta = await readMeta(folder);
    expect(meta.$sys_updated_on).toBe('2026-07-07 12:00:00');
  });

  it('rejects when the project has no tracked scopes', async () => {
    await writeProjectConfig([]);

    await CommandTestFactory.run(commandInstance, ['sync', '--yes']);

    expect(stderrOutput()).toContain(
      'Current project is empty, use the `app init` command to start tracking an application',
    );
  });
});
