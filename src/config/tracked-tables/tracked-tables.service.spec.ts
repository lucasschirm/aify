/**
 * @file tracked-tables.service.spec.ts
 * Tests for TrackedTablesService deep-merge behavior.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GlobalConfigService } from '../global/global-config.service';
import { ProjectConfigService } from '../project/project-config.service';
import { DEFAULT_TABLES } from './default-tables';
import { TrackedTablesService } from './tracked-tables.service';

describe('TrackedTablesService.getProjectTrackTables', () => {
  let home: string;
  let projectRoot: string;
  let originalHome: string | undefined;
  let service: TrackedTablesService;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'aify-tt-home-'));
    projectRoot = await mkdtemp(path.join(tmpdir(), 'aify-tt-proj-'));
    originalHome = process.env.HOME;
    process.env.HOME = home;
    await mkdir(path.join(home, '.aify'), { recursive: true });
    service = new TrackedTablesService(new GlobalConfigService(), new ProjectConfigService());
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('keeps default columns when the project adds a new column to the same table', async () => {
    await writeFile(
      path.join(projectRoot, '.aify.config.json'),
      JSON.stringify({
        tables: [
          {
            name: 'sys_script',
            columns: [{ name: 'description', type: 'string' }],
          },
        ],
      }),
    );
    const merged = await service.getProjectTrackTables(projectRoot);
    const sysScript = merged.tables.find((t) => t.name === 'sys_script');
    expect(sysScript?.columns).toEqual([
      { name: 'script', type: 'script' }, // default preserved
      { name: 'description', type: 'string' }, // project addition
    ]);
    // Full default set still present (nothing lost).
    expect(merged.tables.length).toBe(DEFAULT_TABLES.tables.length);
    // Default column_types survive the merge.
    expect((merged.column_types as Record<string, { extension: string }>).script?.extension).toBe(
      'js',
    );
  });

  it('lets the project override a default column type', async () => {
    await writeFile(
      path.join(projectRoot, '.aify.config.json'),
      JSON.stringify({
        tables: [
          {
            name: 'sys_script',
            columns: [{ name: 'script', type: 'javascript' }],
          },
        ],
      }),
    );
    const merged = await service.getProjectTrackTables(projectRoot);
    const script = merged.tables
      .find((t) => t.name === 'sys_script')
      ?.columns.find((c) => c.name === 'script');
    expect(script?.type).toBe('javascript'); // was 'script' in the default
  });
});

describe('TrackedTablesService.getColumnSources', () => {
  let home: string;
  let projectRoot: string;
  let originalHome: string | undefined;
  let service: TrackedTablesService;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'aify-cs-home-'));
    projectRoot = await mkdtemp(path.join(tmpdir(), 'aify-cs-proj-'));
    originalHome = process.env.HOME;
    process.env.HOME = home;
    await mkdir(path.join(home, '.aify'), { recursive: true });
    service = new TrackedTablesService(new GlobalConfigService(), new ProjectConfigService());
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('with no global/project config files, resolves columns to package source', async () => {
    const sources = await service.getColumnSources(projectRoot, 'sys_script_include');
    expect(sources.get('script')).toBe('package');
  });

  it('resolves a new global column to global source and keeps package columns', async () => {
    const trackPath = path.join(home, '.aify', 'track_tables.json');
    await mkdir(path.dirname(trackPath), { recursive: true });
    await writeFile(
      trackPath,
      JSON.stringify({
        tables: [
          {
            name: 'sys_script_include',
            columns: [{ name: 'access', type: 'string' }],
          },
        ],
      }),
      'utf8',
    );
    const sources = await service.getColumnSources(projectRoot, 'sys_script_include');
    expect(sources.get('access')).toBe('global');
    expect(sources.get('script')).toBe('package');
  });

  it('lets project override package source', async () => {
    const trackPath = path.join(home, '.aify', 'track_tables.json');
    await mkdir(path.dirname(trackPath), { recursive: true });
    await writeFile(
      trackPath,
      JSON.stringify({
        tables: [
          {
            name: 'sys_script_include',
            columns: [{ name: 'access', type: 'string' }],
          },
        ],
      }),
      'utf8',
    );
    await writeFile(
      path.join(projectRoot, '.aify.config.json'),
      JSON.stringify({
        tables: [
          {
            name: 'sys_script_include',
            columns: [{ name: 'script', type: 'server_script' }],
          },
        ],
      }),
    );
    const sources = await service.getColumnSources(projectRoot, 'sys_script_include');
    expect(sources.get('script')).toBe('project');
    expect(sources.get('access')).toBe('global');
  });

  it('omits from map a column name that exists in no layer', async () => {
    const sources = await service.getColumnSources(projectRoot, 'sys_script_include');
    expect(sources.has('does_not_exist')).toBe(false);
  });
});
