/**
 * @file tracker.e2e.spec.ts
 * @description E2E tests for the `aify tracker` commands. Boots the real nest-commander
 * application via `CommandTestFactory` with the actual `TrackerModule` graph and drives
 * `aify tracker type add` and `aify tracker add` commands against mocked dependencies.
 *
 * Hermeticity: `CredentialStore` (keychain), `PromptService` (interactive prompts), and
 * `TableSchemaApiClient` (HTTP schema fetch) are mocked. `DatabaseModule.forRoot(':memory:')`
 * provides an in-memory SQLite. `nock.disableNetConnect()` blocks any request that isn't
 * explicitly mocked. `HOME` and the working directory are relocated to fresh temp directories
 * per test so `GlobalTrackTablesService`'s global config read and `ProjectConfigService`'s
 * project-root walk never touch the real machine.
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
import { TableSchemaApiClient } from '../api/table-schema-api.client';
import { CredentialStore } from '../authentication/credential-store.service';
import { PromptService } from '../authentication/prompt.service';
import { DatabaseModule } from '../database/database.module';
import { Auth } from '../database/models/auth.model';
import { Instance } from '../database/models/instance.model';
import { TrackerModule } from '../tracker/tracker.module';

const INSTANCE_HOST = 'dev.service-now.com';
const BASE_URL = `https://${INSTANCE_HOST}`;
const INSTANCE_URL = `${BASE_URL}/`;
const USERNAME = 'admin';
const PASSWORD = 's3cret';

describe('tracker commands (E2E)', () => {
  let projectRoot: string;
  let homeRoot: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let commandInstance: TestingModule;
  let sequelize: Sequelize;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let prompt: {
    input: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    checkbox: ReturnType<typeof vi.fn>;
    confirm: ReturnType<typeof vi.fn>;
    password: ReturnType<typeof vi.fn>;
  };

  async function writeProjectConfig(config: Record<string, unknown> = {}): Promise<void> {
    const defaultConfig = {
      column_types: {
        script_plain: { file_name: 'script', extension: 'js', behavior: 'text' },
        string: { file_name: 'field', extension: 'txt', behavior: 'text' },
      },
    };
    await writeFile(
      join(projectRoot, '.aify.config.json'),
      JSON.stringify({ ...defaultConfig, ...config }, null, 2),
    );
  }

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalHome = process.env.HOME;
    homeRoot = await mkdtemp(join(tmpdir(), 'aify-tracker-home-'));
    projectRoot = await mkdtemp(join(tmpdir(), 'aify-tracker-proj-'));
    process.env.HOME = homeRoot;
    process.chdir(projectRoot);

    nock.disableNetConnect();

    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const credentials = {
      getPassword: vi.fn().mockResolvedValue(PASSWORD),
      setPassword: vi.fn().mockResolvedValue(undefined),
      deletePassword: vi.fn().mockResolvedValue(undefined),
    };

    prompt = {
      confirm: vi.fn().mockResolvedValue(true),
      input: vi.fn(),
      password: vi.fn(),
      select: vi.fn(),
      checkbox: vi.fn(),
    };

    commandInstance = await CommandTestFactory.createTestingCommand({
      imports: [EventEmitterModule.forRoot(), DatabaseModule.forRoot(':memory:'), TrackerModule],
    })
      .overrideProvider(CredentialStore)
      .useValue(credentials as unknown as CredentialStore)
      .overrideProvider(PromptService)
      .useValue(prompt as unknown as PromptService)
      .overrideProvider(TableSchemaApiClient)
      .useValue({
        fetchSchemaXml: vi.fn().mockResolvedValue([
          {
            name: 'script',
            internal_type: 'script_plain',
            max_length: 8000,
            choice_list: false,
            active_status: true,
          },
          {
            name: 'access',
            internal_type: 'string',
            max_length: 40,
            choice_list: true,
            active_status: true,
          },
          {
            name: 'client_callable',
            internal_type: 'boolean',
            max_length: 40,
            choice_list: false,
            active_status: true,
          },
          {
            name: 'sys_updated_on',
            internal_type: 'glide_date_time',
            max_length: 40,
            choice_list: false,
            active_status: true,
          },
        ]),
      } as unknown as TableSchemaApiClient)
      .compile();

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

  it('tracker tables add tracks only newly-selected non-package columns and configures missing types (project)', async () => {
    await writeProjectConfig();

    // Table name prompt
    prompt.input
      .mockResolvedValueOnce('sys_script_include') // table name
      .mockResolvedValueOnce('bool_file') // boolean file_name
      .mockResolvedValueOnce('bool_ext') // boolean extension
      .mockResolvedValueOnce('bool_beh') // boolean behavior
      .mockResolvedValueOnce('date_file') // glide_date_time file_name
      .mockResolvedValueOnce('date_ext') // glide_date_time extension
      .mockResolvedValueOnce('date_beh'); // glide_date_time behavior

    // Checkbox returns the three NEW columns; script is package-locked and intentionally not returned
    prompt.checkbox.mockResolvedValueOnce([
      { name: 'access', type: 'string' },
      { name: 'client_callable', type: 'boolean' },
      { name: 'sys_updated_on', type: 'glide_date_time' },
    ]);

    await CommandTestFactory.run(commandInstance, ['tracker', 'tables', 'add']);

    const projectConfig = JSON.parse(
      await readFile(join(projectRoot, '.aify.config.json'), 'utf8'),
    );

    // Assert new types were configured
    expect(projectConfig.column_types.boolean).toEqual({
      file_name: 'bool_file',
      extension: 'bool_ext',
      behavior: 'bool_beh',
    });
    expect(projectConfig.column_types.glide_date_time).toEqual({
      file_name: 'date_file',
      extension: 'date_ext',
      behavior: 'date_beh',
    });

    // Assert table was added with only the new columns (not the package-locked script)
    const tableEntry = (projectConfig.tables ?? []).find(
      (t: Record<string, unknown>) => t.name === 'sys_script_include',
    );
    expect(tableEntry).toBeDefined();
    expect(tableEntry.columns).toEqual(
      expect.arrayContaining([
        { name: 'access', type: 'string' },
        { name: 'client_callable', type: 'boolean' },
        { name: 'sys_updated_on', type: 'glide_date_time' },
      ]),
    );
    // Ensure script is NOT in the project layer
    expect(tableEntry.columns).not.toContainEqual(expect.objectContaining({ name: 'script' }));
  });

  it('package-locked column stays tracked and is never removed', async () => {
    await writeProjectConfig();

    prompt.input.mockResolvedValueOnce('sys_script_include'); // table name only
    prompt.checkbox.mockResolvedValueOnce([]); // nothing selected

    await CommandTestFactory.run(commandInstance, ['tracker', 'tables', 'add']);

    // Confirm should never be called for package-locked columns
    expect(prompt.confirm).not.toHaveBeenCalled();

    const projectConfig = JSON.parse(
      await readFile(join(projectRoot, '.aify.config.json'), 'utf8'),
    );

    // Project config should have no sys_script_include entry
    const tableEntry = (projectConfig.tables ?? []).find(
      (t: Record<string, unknown>) => t.name === 'sys_script_include',
    );
    expect(tableEntry).toBeUndefined();
  });

  it('unchecking a PROJECT-sourced column confirms and removes it (dropping the now-empty table)', async () => {
    // Seed project with a tracked column
    await writeProjectConfig({
      tables: [{ name: 'sys_script_include', columns: [{ name: 'access', type: 'string' }] }],
    });

    prompt.input.mockResolvedValueOnce('sys_script_include');
    prompt.checkbox.mockResolvedValueOnce([]); // user unchecks access; script package stays
    // confirm defaults to true (left as-is)

    await CommandTestFactory.run(commandInstance, ['tracker', 'tables', 'add']);

    // Assert confirm was called with a message about stopping tracking
    expect(prompt.confirm).toHaveBeenCalledWith(
      expect.stringContaining('stop tracking the column access'),
    );

    const projectConfig = JSON.parse(
      await readFile(join(projectRoot, '.aify.config.json'), 'utf8'),
    );

    // Table should be removed (its only column was removed)
    const tableEntry = (projectConfig.tables ?? []).find(
      (t: Record<string, unknown>) => t.name === 'sys_script_include',
    );
    expect(tableEntry).toBeUndefined();
  });

  it('unchecking a GLOBAL-sourced column removes it from the GLOBAL config even when the command targets the project', async () => {
    await writeProjectConfig(); // project is empty

    // Pre-seed global config
    await mkdir(join(homeRoot, '.aify'), { recursive: true });
    await writeFile(
      join(homeRoot, '.aify', 'track_tables.json'),
      JSON.stringify({
        tables: [{ name: 'sys_script_include', columns: [{ name: 'access', type: 'string' }] }],
        column_types: {},
      }),
    );

    prompt.input.mockResolvedValueOnce('sys_script_include');
    prompt.checkbox.mockResolvedValueOnce([]); // user unchecks access
    // confirm defaults to true

    await CommandTestFactory.run(commandInstance, ['tracker', 'tables', 'add']);

    // Assert confirm was called
    expect(prompt.confirm).toHaveBeenCalled();

    const globalConfig = JSON.parse(
      await readFile(join(homeRoot, '.aify', 'track_tables.json'), 'utf8'),
    );

    // Global sys_script_include entry should be removed
    const globalTableEntry = (globalConfig.tables ?? []).find(
      (t: Record<string, unknown>) => t.name === 'sys_script_include',
    );
    expect(globalTableEntry).toBeUndefined();

    const projectConfig = JSON.parse(
      await readFile(join(projectRoot, '.aify.config.json'), 'utf8'),
    );

    // Project should still have no sys_script_include entry
    const projectTableEntry = (projectConfig.tables ?? []).find(
      (t: Record<string, unknown>) => t.name === 'sys_script_include',
    );
    expect(projectTableEntry).toBeUndefined();
  });

  it('tracker types add --global configures a type in the global config (renamed nested tree)', async () => {
    prompt.input
      .mockResolvedValueOnce('my_type') // column type name
      .mockResolvedValueOnce('my_file') // file_name
      .mockResolvedValueOnce('my_ext') // extension
      .mockResolvedValueOnce('my_beh'); // behavior

    await CommandTestFactory.run(commandInstance, ['tracker', 'types', 'add', '--global']);

    const globalConfig = JSON.parse(
      await readFile(join(homeRoot, '.aify', 'track_tables.json'), 'utf8'),
    );
    expect(globalConfig.column_types.my_type).toEqual({
      file_name: 'my_file',
      extension: 'my_ext',
      behavior: 'my_beh',
    });
  });

  it('tracker types add --table sources a type from the live schema into the project (renamed nested tree)', async () => {
    await writeProjectConfig();

    prompt.select.mockResolvedValueOnce('boolean'); // pick an internal_type from the schema
    prompt.input
      .mockResolvedValueOnce('bool_file')
      .mockResolvedValueOnce('bool_ext')
      .mockResolvedValueOnce('bool_beh');

    await CommandTestFactory.run(commandInstance, [
      'tracker',
      'types',
      'add',
      '--table',
      'sys_script_include',
    ]);

    const projectConfig = JSON.parse(
      await readFile(join(projectRoot, '.aify.config.json'), 'utf8'),
    );
    expect(projectConfig.column_types.boolean).toEqual({
      file_name: 'bool_file',
      extension: 'bool_ext',
      behavior: 'bool_beh',
    });
  });
});
