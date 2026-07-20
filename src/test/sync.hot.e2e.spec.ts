/**
 * @file sync.hot.e2e.spec.ts
 * @description E2E test for `aify sync --hot`. Boots the real `SyncModule` graph (incl. the real
 *   `TableApiClient`, `WatcherService` with REAL chokidar, and the real `EventEmitter2` bus) and
 *   drives `SyncService` directly against a ServiceNow instance mocked with `nock`.
 *
 *   Two directions are exercised end to end:
 *     • watch → push: a saved file is detected by real chokidar and PATCHed to the instance.
 *     • poll → pull:  the lightweight `sys_metadata` detector triggers a full pull that rewrites
 *                     the local file — and, thanks to self-write suppression (OS-22), does NOT
 *                     bounce back as a push.
 *
 *   Timing: the watch path uses real chokidar + real timers with a `waitFor()` poll helper; the
 *   poll path is driven deterministically by invoking `pollOnce` so tests don't wait on the
 *   `setInterval`. `hot.pullInterval` is set large so the background interval never fires mid-test.
 *   Hermeticity mirrors sync.e2e.spec.ts (mocked CredentialStore/PromptService/SpinnerService,
 *   in-memory SQLite, temp HOME/cwd, `nock.disableNetConnect()`).
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
import { PullStage } from '../sync/stages/pull.stage';
import { SyncModule } from '../sync/sync.module';
import { SyncService } from '../sync/sync.service';
import { SpinnerService } from '../ui/spinner.service';

const INSTANCE_HOST = 'dev.service-now.com';
const BASE_URL = `https://${INSTANCE_HOST}`;
const INSTANCE_URL = `${BASE_URL}/`;
const USERNAME = 'admin';
const PASSWORD = 's3cret';
const BASIC_AUTH = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}`;

const SCOPE = 'x_test_app';
const SCOPE_SYS_ID = 'scope000000000000000000000000001';
const SCOPE2 = 'x_other_app';
const SCOPE2_SYS_ID = 'scope000000000000000000000000002';
const TABLE = 'x_widget';
const SYS_ID_1 = 'rec00000000000000000000000000001';
const SYS_ID_2 = 'rec00000000000000000000000000002';

// Comfortably larger than the 200ms watcher debounce + fs-event latency; a positive assertion
// (waitFor) usually resolves far sooner, a negative assertion waits the full window.
const NEGATIVE_WINDOW_MS = 600;

function projectConfigFixture(scopes: { sysId: string; scope: string }[]) {
  return {
    // Large pullInterval so the background poll timer never fires during a test.
    hot: { pullInterval: 3600 },
    project: { scopes },
    tables: [{ name: TABLE, columns: [{ name: 'source', type: 'js' }] }],
    column_types: { js: { file_name: 'source', extension: 'js', behavior: 'text' } },
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll `predicate` until it is truthy or the timeout elapses (for the async chokidar path). */
async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await delay(25);
  }
  throw new Error('waitFor: condition not met within timeout');
}

describe('sync --hot (E2E)', () => {
  let projectRoot: string;
  let homeRoot: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let commandInstance: TestingModule;
  let sequelize: Sequelize;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let records: RecordMetadataService;
  let svc: SyncService;

  async function writeProjectConfig(
    scopes: { sysId: string; scope: string }[] = [{ sysId: SCOPE_SYS_ID, scope: SCOPE }],
  ): Promise<void> {
    await writeFile(
      join(projectRoot, '.aify.config.json'),
      JSON.stringify(projectConfigFixture(scopes), null, 2),
    );
  }

  /** Seed an on-disk record (in `scope`) as if a prior sync had already pulled it. */
  async function seedRecord(opts: {
    scope?: string;
    displayValue: string;
    sysId: string;
    content: string;
    sysUpdatedOn: string;
    sysModCount: number;
  }): Promise<string> {
    const scope = opts.scope ?? SCOPE;
    const folder = records.recordFolder(projectRoot, scope, TABLE, opts.displayValue, opts.sysId);
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

  /** Nock the initial one-shot sync that `run()` performs before entering hot mode: no changes. */
  function nockInitialSyncEmpty(): void {
    nock(BASE_URL)
      .get('/api/now/v2/table/sys_metadata')
      .query(true)
      .reply(200, { result: [] })
      .get('/api/now/v2/table/sys_metadata_delete')
      .query(true)
      .reply(200, { result: [] });
  }

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalHome = process.env.HOME;
    homeRoot = await mkdtemp(join(tmpdir(), 'aify-hot-home-'));
    projectRoot = await mkdtemp(join(tmpdir(), 'aify-hot-proj-'));
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

    await commandInstance.init();
    sequelize = commandInstance.get(Sequelize);
    svc = commandInstance.get(SyncService);

    const instance = await Instance.create({ instance: INSTANCE_HOST, url: INSTANCE_URL });
    await Auth.create({
      alias: 'dev',
      username: USERNAME,
      instanceId: instance.id,
      isCurrent: true,
    });
  });

  afterEach(async () => {
    await svc.stopHot(); // always tear down the watcher/interval/SIGINT handler
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    nock.cleanAll();
    nock.enableNetConnect();
    if (sequelize) await sequelize.close();
    process.chdir(originalCwd);
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(projectRoot, { recursive: true, force: true });
    await rm(homeRoot, { recursive: true, force: true });
  });

  it('watch → push: saving a tracked file PATCHes it to the instance', async () => {
    const folder = await seedRecord({
      displayValue: 'Hello Widget',
      sysId: SYS_ID_1,
      content: 'console.log("v1");',
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });

    nockInitialSyncEmpty();
    const patchScope = nock(BASE_URL, { reqheaders: { authorization: BASIC_AUTH } })
      .patch(`/api/now/v2/table/${TABLE}/${SYS_ID_1}`, { source: 'console.log("edited-in-hot");' })
      .reply(200, {
        result: {
          sys_id: SYS_ID_1,
          source: 'console.log("edited-in-hot");',
          sys_updated_on: '2026-07-03 11:00:00',
          sys_mod_count: '2',
        },
      });

    await svc.run({ hot: true, yes: true, scope: SCOPE });
    await writeFile(join(folder, 'source.js'), 'console.log("edited-in-hot");', 'utf8');

    // Wait for the full push cycle to settle — the PATCH plus the follow-up metadata refresh
    // (isDone() flips the moment nock receives the request, before records.write() lands).
    await waitFor(async () => {
      const m = await readMeta(folder);
      return m.$hash.source === hashContent('console.log("edited-in-hot");');
    });
    expect(patchScope.isDone()).toBe(true);
    const meta = await readMeta(folder);
    expect(meta.$sys_updated_on).toBe('2026-07-03 11:00:00');
  });

  it('editing record_metadata.json does NOT push (ignored file)', async () => {
    const folder = await seedRecord({
      displayValue: 'Hello Widget',
      sysId: SYS_ID_1,
      content: 'console.log("v1");',
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });

    nockInitialSyncEmpty();
    const patchScope = nock(BASE_URL).patch(/.*/).reply(200, {});

    await svc.run({ hot: true, yes: true, scope: SCOPE });
    const meta = await readMeta(folder);
    meta.$sys_mod_count = 99; // touch the metadata file
    await records.write(folder, meta);

    await delay(NEGATIVE_WINDOW_MS);
    expect(patchScope.isDone()).toBe(false);
  });

  it('a file in an untracked scope is NOT watched (scope-limited hot)', async () => {
    // Two scopes tracked, but hot runs with --scope=SCOPE, so only SCOPE is watched.
    await writeProjectConfig([
      { sysId: SCOPE_SYS_ID, scope: SCOPE },
      { sysId: SCOPE2_SYS_ID, scope: SCOPE2 },
    ]);
    const otherFolder = await seedRecord({
      scope: SCOPE2,
      displayValue: 'Other Widget',
      sysId: SYS_ID_2,
      content: 'console.log("other-v1");',
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });

    nockInitialSyncEmpty(); // initial sync only touches SCOPE (pullInputs filters by --scope)
    const patchScope = nock(BASE_URL).patch(/.*/).reply(200, {});

    await svc.run({ hot: true, yes: true, scope: SCOPE });
    await writeFile(join(otherFolder, 'source.js'), 'console.log("other-edited");', 'utf8');

    await delay(NEGATIVE_WINDOW_MS);
    expect(patchScope.isDone()).toBe(false);
  });

  it('poll → pull: a remote change rewrites the local file', async () => {
    const folder = await seedRecord({
      displayValue: 'Hello Widget',
      sysId: SYS_ID_1,
      content: 'console.log("v1");',
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });

    const changedRow = {
      sys_id: SYS_ID_1,
      sys_class_name: TABLE,
      sys_updated_on: '2026-07-02 09:00:00',
      sys_mod_count: '2',
      sys_name: 'Hello Widget',
    };
    nock(BASE_URL)
      .get('/api/now/v2/table/sys_metadata') // detectChanges (OS-13)
      .query(true)
      .reply(200, { result: [changedRow] })
      .get('/api/now/v2/table/sys_metadata') // full pull
      .query(true)
      .reply(200, { result: [changedRow] })
      .get(`/api/now/v2/table/${TABLE}`)
      .query(true)
      .reply(200, {
        result: [
          {
            sys_id: SYS_ID_1,
            source: 'console.log("from-instance");',
            sys_updated_on: '2026-07-02 09:00:00',
            sys_mod_count: '2',
          },
        ],
      })
      .get('/api/now/v2/table/sys_metadata_delete')
      .query(true)
      .reply(200, { result: [] });

    const ran = await (svc as unknown as { pollOnce: (o: unknown) => Promise<boolean> }).pollOnce({
      scope: SCOPE,
    });

    expect(ran).toBe(true);
    expect(await readFile(join(folder, 'source.js'), 'utf8')).toBe('console.log("from-instance");');
    const meta = await readMeta(folder);
    expect(meta.$hash.source).toBe(hashContent('console.log("from-instance");'));
  });

  it('self-write suppression: a hot pull that rewrites a file does NOT bounce back as a push (OS-22)', async () => {
    const folder = await seedRecord({
      displayValue: 'Hello Widget',
      sysId: SYS_ID_1,
      content: 'console.log("v1");',
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });

    nockInitialSyncEmpty(); // initial one-shot sync: nothing
    await svc.run({ hot: true, yes: true, scope: SCOPE }); // watcher now active on SCOPE

    const changedRow = {
      sys_id: SYS_ID_1,
      sys_class_name: TABLE,
      sys_updated_on: '2026-07-02 09:00:00',
      sys_mod_count: '2',
      sys_name: 'Hello Widget',
    };
    nock(BASE_URL)
      .get('/api/now/v2/table/sys_metadata')
      .query(true)
      .reply(200, { result: [changedRow] })
      .get('/api/now/v2/table/sys_metadata')
      .query(true)
      .reply(200, { result: [changedRow] })
      .get(`/api/now/v2/table/${TABLE}`)
      .query(true)
      .reply(200, {
        result: [
          {
            sys_id: SYS_ID_1,
            source: 'console.log("from-instance");',
            sys_updated_on: '2026-07-02 09:00:00',
            sys_mod_count: '2',
          },
        ],
      })
      .get('/api/now/v2/table/sys_metadata_delete')
      .query(true)
      .reply(200, { result: [] });
    // If suppression fails, chokidar sees the pulled write as a user edit and pushes it back:
    const bounceBack = nock(BASE_URL)
      .patch(`/api/now/v2/table/${TABLE}/${SYS_ID_1}`)
      .reply(200, {});

    await (svc as unknown as { pollOnce: (o: unknown) => Promise<boolean> }).pollOnce({
      scope: SCOPE,
    });
    expect(await readFile(join(folder, 'source.js'), 'utf8')).toBe('console.log("from-instance");');

    await delay(NEGATIVE_WINDOW_MS);
    expect(bounceBack.isDone()).toBe(false); // no push-back
  });

  it('--force-pull hot mode does NOT start the file watcher (poll-only)', async () => {
    const folder = await seedRecord({
      displayValue: 'Hello Widget',
      sysId: SYS_ID_1,
      content: 'console.log("v1");',
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });

    nockInitialSyncEmpty();
    const patchScope = nock(BASE_URL).patch(/.*/).reply(200, {});

    await svc.run({ hot: true, forcePull: true, yes: true, scope: SCOPE });
    await writeFile(join(folder, 'source.js'), 'console.log("edited-but-ignored");', 'utf8');

    await delay(NEGATIVE_WINDOW_MS);
    expect(patchScope.isDone()).toBe(false); // watcher never started ⇒ no push
  });

  it('a failing poll is swallowed and a later poll still works', async () => {
    await seedRecord({
      displayValue: 'Hello Widget',
      sysId: SYS_ID_1,
      content: 'console.log("v1");',
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });

    const pullStage = commandInstance.get(PullStage);
    const detectSpy = vi
      .spyOn(pullStage, 'detectChanges')
      .mockRejectedValueOnce(new Error('network down'));

    const first = await (svc as unknown as { pollOnce: (o: unknown) => Promise<boolean> }).pollOnce(
      { scope: SCOPE },
    );
    expect(first).toBe(false); // error swallowed, no throw

    // The next poll uses the real detector again — nock an empty result.
    nock(BASE_URL).get('/api/now/v2/table/sys_metadata').query(true).reply(200, { result: [] });
    const second = await (
      svc as unknown as { pollOnce: (o: unknown) => Promise<boolean> }
    ).pollOnce({ scope: SCOPE });
    expect(second).toBe(false);
    expect(detectSpy).toHaveBeenCalledTimes(2);
    detectSpy.mockRestore();
  });

  it('stopHot() closes the watcher (no more pushes) and removes the SIGINT handler', async () => {
    const folder = await seedRecord({
      displayValue: 'Hello Widget',
      sysId: SYS_ID_1,
      content: 'console.log("v1");',
      sysUpdatedOn: '2026-07-01 10:00:00',
      sysModCount: 1,
    });

    nockInitialSyncEmpty();
    const patchScope = nock(BASE_URL).patch(/.*/).reply(200, {});

    const sigintBefore = process.listenerCount('SIGINT');
    await svc.run({ hot: true, yes: true, scope: SCOPE });
    expect(process.listenerCount('SIGINT')).toBe(sigintBefore + 1);

    await svc.stopHot();
    expect(process.listenerCount('SIGINT')).toBe(sigintBefore);

    await writeFile(join(folder, 'source.js'), 'console.log("after-stop");', 'utf8');
    await delay(NEGATIVE_WINDOW_MS);
    expect(patchScope.isDone()).toBe(false); // watcher closed ⇒ no push
  });
});
