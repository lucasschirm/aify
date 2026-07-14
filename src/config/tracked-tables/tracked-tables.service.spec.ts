/**
 * @file tracked-tables.service.spec.ts
 * Tests for TrackedTablesService deep-merge behavior.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GlobalConfigService } from '../global/global-config.service';
import { ProjectConfigService } from '../project/project-config.service';
import { INTERIM_DEFAULT_TABLES } from './default-tables';
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
      { name: 'script', type: 'glidescript' }, // default preserved
      { name: 'description', type: 'string' }, // project addition
    ]);
    // Full default set still present (nothing lost).
    expect(merged.tables.length).toBe(INTERIM_DEFAULT_TABLES.tables.length);
    // Default column_types survive the merge.
    expect(
      (merged.column_types as Record<string, { extension: string }>).glidescript?.extension,
    ).toBe('glide.js');
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
    expect(script?.type).toBe('javascript'); // was 'glidescript' in the default
  });
});
