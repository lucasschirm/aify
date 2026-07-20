/**
 * @file project-config.service.spec.ts
 * Tests for ProjectConfigService — bounded parent walk, config CRUD, scopes, auth-failure counter.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectConfigService } from './project-config.service';

describe('ProjectConfigService', () => {
  let base: string; // temp root; home is a subdir so we can test "above home"
  let home: string;
  let originalHome: string | undefined;
  let service: ProjectConfigService;

  beforeEach(async () => {
    base = await mkdtemp(path.join(tmpdir(), 'aify-proj-'));
    home = path.join(base, 'home');
    await mkdir(home, { recursive: true });
    originalHome = process.env.HOME;
    process.env.HOME = home;
    service = new ProjectConfigService();
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(base, { recursive: true, force: true });
  });

  it('finds .aify.config.json in a parent directory', async () => {
    const root = path.join(home, 'workspace', 'app');
    const deep = path.join(root, 'src', 'nested');
    await mkdir(deep, { recursive: true });
    await writeFile(path.join(root, '.aify.config.json'), '{}');
    expect(await service.findProjectRoot(deep)).toBe(root);
  });

  it('stops at the home directory and does not search above it', async () => {
    // Config sits ABOVE home (in base); the bounded walk must never reach it.
    await writeFile(path.join(base, '.aify.config.json'), '{}');
    const start = path.join(home, 'a', 'b');
    await mkdir(start, { recursive: true });
    expect(await service.findProjectRoot(start)).toBeNull();
  });

  it('creates an empty config at cwd when none exists (ensureProjectRoot)', async () => {
    const dir = path.join(home, 'fresh');
    await mkdir(dir, { recursive: true });
    const root = await service.ensureProjectRoot(dir);
    expect(root).toBe(dir);
    const written = JSON.parse(await readFile(path.join(dir, '.aify.config.json'), 'utf8'));
    expect(written).toEqual({});
  });

  it('adds a scope and does not duplicate it', async () => {
    const dir = path.join(home, 'scoped');
    await mkdir(dir, { recursive: true });
    await service.ensureProjectRoot(dir);
    await service.addScope(dir, { sysId: 'abc', scope: 'my_scope' });
    await service.addScope(dir, { sysId: 'abc', scope: 'my_scope' }); // dedupe by sysId
    const config = await service.read(dir);
    expect(config.project?.scopes).toEqual([{ sysId: 'abc', scope: 'my_scope' }]);
  });

  it('increments and resets the auth-failure counter', async () => {
    const dir = path.join(home, 'auth');
    await mkdir(dir, { recursive: true });
    await service.ensureProjectRoot(dir);
    expect(await service.incrementAuthFailures(dir)).toBe(1);
    expect(await service.incrementAuthFailures(dir)).toBe(2);
    await service.resetAuthFailures(dir);
    const config = await service.read(dir);
    expect(config.auth?.failedAttempts).toBe(0);
  });

  it('adds a column type and persists it', async () => {
    const dir = path.join(home, 'columns');
    await mkdir(dir, { recursive: true });
    await service.ensureProjectRoot(dir);
    const def = { file_name: 'script', extension: '.js', behavior: 'inline' };
    await service.addColumnType(dir, 'script', def);
    const config = await service.read(dir);
    expect(config.column_types?.script).toEqual(def);
  });

  it('overrides a column type when calling addColumnType again', async () => {
    const dir = path.join(home, 'override');
    await mkdir(dir, { recursive: true });
    await service.ensureProjectRoot(dir);
    const oldDef = { file_name: 'old', extension: '.old', behavior: 'old' };
    const newDef = { file_name: 'new', extension: '.new', behavior: 'new' };
    await service.addColumnType(dir, 'script', oldDef);
    await service.addColumnType(dir, 'script', newDef);
    const config = await service.read(dir);
    expect(config.column_types?.script).toEqual(newDef);
  });

  it('adds a tracked table and persists it', async () => {
    const dir = path.join(home, 'tables');
    await mkdir(dir, { recursive: true });
    await service.ensureProjectRoot(dir);
    const table = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };
    await service.addTrackedTable(dir, table);
    const config = await service.read(dir);
    expect(config.tables).toHaveLength(1);
    expect(config.tables?.[0]).toEqual(table);
  });

  it('merges columns into an existing table when calling addTrackedTable again', async () => {
    const dir = path.join(home, 'merge');
    await mkdir(dir, { recursive: true });
    await service.ensureProjectRoot(dir);
    const table1 = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };
    const table2 = {
      name: 'sys_script',
      columns: [{ name: 'description', type: 'string' }],
    };
    await service.addTrackedTable(dir, table1);
    await service.addTrackedTable(dir, table2);
    const config = await service.read(dir);
    expect(config.tables).toHaveLength(1);
    const merged = config.tables?.[0];
    expect(merged?.name).toBe('sys_script');
    expect(merged?.columns).toContainEqual({ name: 'script', type: 'script' });
    expect(merged?.columns).toContainEqual({ name: 'description', type: 'string' });
  });

  it('overrides a column type when merging tables', async () => {
    const dir = path.join(home, 'type-override');
    await mkdir(dir, { recursive: true });
    await service.ensureProjectRoot(dir);
    const table1 = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };
    const table2 = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script_plain' }],
    };
    await service.addTrackedTable(dir, table1);
    await service.addTrackedTable(dir, table2);
    const config = await service.read(dir);
    const merged = config.tables?.[0];
    expect(merged?.columns).toEqual([{ name: 'script', type: 'script_plain' }]);
  });

  it('removeTrackedColumn removes one column from a table with multiple columns', async () => {
    const dir = path.join(home, 'remove-col');
    await mkdir(dir, { recursive: true });
    await service.ensureProjectRoot(dir);
    const table = {
      name: 'sys_script',
      columns: [
        { name: 'script', type: 'script' },
        { name: 'description', type: 'string' },
      ],
    };
    await service.addTrackedTable(dir, table);
    await service.removeTrackedColumn(dir, 'sys_script', 'script');

    const config = await service.read(dir);
    expect(config.tables).toHaveLength(1);
    expect(config.tables?.[0].columns).toEqual([{ name: 'description', type: 'string' }]);
  });

  it('removeTrackedColumn drops the table entry when removing its only/last column', async () => {
    const dir = path.join(home, 'remove-table');
    await mkdir(dir, { recursive: true });
    await service.ensureProjectRoot(dir);
    const table = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };
    await service.addTrackedTable(dir, table);
    await service.removeTrackedColumn(dir, 'sys_script', 'script');

    const config = await service.read(dir);
    expect(config.tables).toHaveLength(0);
  });

  it('removeTrackedColumn is a no-op on an absent table', async () => {
    const dir = path.join(home, 'remove-noop');
    await mkdir(dir, { recursive: true });
    await service.ensureProjectRoot(dir);
    const table = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };
    await service.addTrackedTable(dir, table);
    await service.removeTrackedColumn(dir, 'sys_app', 'name');

    const config = await service.read(dir);
    expect(config.tables).toHaveLength(1);
    expect(config.tables?.[0]).toEqual(table);
  });
});

async function mkdtemp(_prefix: string): Promise<string> {
  const { randomBytes } = await import('node:crypto');
  const tmp = path.join(tmpdir(), randomBytes(6).toString('hex'));
  await mkdir(tmp, { recursive: true });
  return tmp;
}
