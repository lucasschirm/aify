/**
 * @file global-track-tables.service.spec.ts
 * Tests for GlobalTrackTablesService — reading and writing ~/.aify/track_tables.json.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GlobalConfigService } from '../global/global-config.service';
import { GlobalTrackTablesService } from './global-track-tables.service';

describe('GlobalTrackTablesService', () => {
  let home: string;
  let originalHome: string | undefined;
  let service: GlobalTrackTablesService;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'aify-global-track-'));
    originalHome = process.env.HOME;
    process.env.HOME = home;
    service = new GlobalTrackTablesService(new GlobalConfigService());
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  });

  it('read() returns empty defaults when no file exists', async () => {
    const config = await service.read();
    expect(config).toEqual({ tables: [], column_types: {} });
  });

  it('addColumnType creates ~/.aify/track_tables.json and persists the column type', async () => {
    const def = { file_name: 'script', extension: '.js', behavior: 'inline' };
    await service.addColumnType('script', def);

    const trackPath = path.join(home, '.aify', 'track_tables.json');
    const contents = await readFile(trackPath, 'utf8');
    const parsed = JSON.parse(contents);

    expect(parsed.column_types.script).toEqual(def);
    expect(parsed.tables).toEqual([]);
  });

  it('addTrackedTable creates ~/.aify/track_tables.json and persists the table', async () => {
    const table = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };
    await service.addTrackedTable(table);

    const trackPath = path.join(home, '.aify', 'track_tables.json');
    const contents = await readFile(trackPath, 'utf8');
    const parsed = JSON.parse(contents);

    expect(parsed.tables).toHaveLength(1);
    expect(parsed.tables[0]).toEqual(table);
    expect(parsed.column_types).toEqual({});
  });

  it('re-reading after addColumnType reflects the persisted value', async () => {
    const def = { file_name: 'script', extension: '.js', behavior: 'inline' };
    await service.addColumnType('script', def);

    const config = await service.read();
    expect(config.column_types.script).toEqual(def);
  });

  it('re-reading after addTrackedTable reflects the persisted value', async () => {
    const table = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };
    await service.addTrackedTable(table);

    const config = await service.read();
    expect(config.tables).toHaveLength(1);
    expect(config.tables[0]).toEqual(table);
  });

  it('a second addTrackedTable for the same table merges columns', async () => {
    const table1 = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };
    const table2 = {
      name: 'sys_script',
      columns: [{ name: 'description', type: 'string' }],
    };
    await service.addTrackedTable(table1);
    await service.addTrackedTable(table2);

    const config = await service.read();
    expect(config.tables).toHaveLength(1);
    const merged = config.tables[0];
    expect(merged.name).toBe('sys_script');
    expect(merged.columns).toContainEqual({ name: 'script', type: 'script' });
    expect(merged.columns).toContainEqual({ name: 'description', type: 'string' });
  });

  it('addColumnType override works across calls', async () => {
    const def1 = { file_name: 'old', extension: '.old', behavior: 'old' };
    const def2 = { file_name: 'new', extension: '.new', behavior: 'new' };
    await service.addColumnType('script', def1);
    await service.addColumnType('script', def2);

    const config = await service.read();
    expect(config.column_types.script).toEqual(def2);
  });

  it('addColumnType and addTrackedTable can coexist', async () => {
    const def = { file_name: 'script', extension: '.js', behavior: 'inline' };
    const table = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };

    await service.addColumnType('script', def);
    await service.addTrackedTable(table);

    const config = await service.read();
    expect(config.column_types.script).toEqual(def);
    expect(config.tables).toHaveLength(1);
    expect(config.tables[0]).toEqual(table);
  });

  it('returns empty tables array when file contains only column_types', async () => {
    const trackPath = path.join(home, '.aify', 'track_tables.json');
    await mkdir(path.dirname(trackPath), { recursive: true });
    await writeFile(
      trackPath,
      JSON.stringify({
        column_types: { script: { file_name: 'script', extension: '.js', behavior: 'inline' } },
      }),
      'utf8',
    );

    const config = await service.read();

    expect(config.tables).toEqual([]);
    expect(config.column_types.script).toBeDefined();
  });

  it('returns empty column_types object when file contains only tables', async () => {
    const trackPath = path.join(home, '.aify', 'track_tables.json');
    await mkdir(path.dirname(trackPath), { recursive: true });
    const table = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };
    await writeFile(trackPath, JSON.stringify({ tables: [table] }), 'utf8');

    const config = await service.read();

    expect(config.column_types).toEqual({});
    expect(config.tables).toHaveLength(1);
    expect(config.tables[0]).toEqual(table);
  });

  it('removeTrackedColumn removes one column from a table with multiple columns', async () => {
    const table = {
      name: 'sys_script',
      columns: [
        { name: 'script', type: 'script' },
        { name: 'description', type: 'string' },
      ],
    };
    await service.addTrackedTable(table);
    await service.removeTrackedColumn('sys_script', 'script');

    const config = await service.read();
    expect(config.tables).toHaveLength(1);
    expect(config.tables[0].columns).toEqual([{ name: 'description', type: 'string' }]);
  });

  it('removeTrackedColumn drops the table entry when removing its only/last column', async () => {
    const table = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };
    await service.addTrackedTable(table);
    await service.removeTrackedColumn('sys_script', 'script');

    const config = await service.read();
    expect(config.tables).toHaveLength(0);
  });

  it('removeTrackedColumn is a no-op on an absent table', async () => {
    const table = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };
    await service.addTrackedTable(table);
    await service.removeTrackedColumn('sys_app', 'name');

    const config = await service.read();
    expect(config.tables).toHaveLength(1);
    expect(config.tables[0]).toEqual(table);
  });
});

async function mkdtemp(_prefix: string): Promise<string> {
  const { randomBytes } = await import('node:crypto');
  const tmp = path.join(tmpdir(), randomBytes(6).toString('hex'));
  await mkdir(tmp, { recursive: true });
  return tmp;
}
