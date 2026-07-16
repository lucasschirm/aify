/**
 * @file tracked-tables.service.ts
 * TrackedTablesService.getProjectTrackTables() deep-merges the tracked-table config across three
 * layers — INTERIM_DEFAULT_TABLES → ~/.aify/track_tables.json (global) → .aify.config.json
 * (project) — so project settings win and nothing is lost (OS-15). Tables merge by name, their
 * columns by name, and column_types by spread (last writer wins).
 */

import { readFile } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { GlobalConfigService } from '../global/global-config.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { ProjectConfigService } from '../project/project-config.service';
import { INTERIM_DEFAULT_TABLES } from './default-tables';
import type { ColumnType, TrackConfig, TrackedColumn, TrackedTable } from './tracked-tables.types';

@Injectable()
export class TrackedTablesService {
  constructor(
    private readonly global: GlobalConfigService,
    private readonly project: ProjectConfigService,
  ) {}

  async getProjectTrackTables(projectRoot: string): Promise<TrackConfig> {
    let merged = mergeTrackConfig(
      { tables: [], column_types: {} as Record<string, ColumnType> },
      INTERIM_DEFAULT_TABLES,
    );
    merged = mergeTrackConfig(merged, await this.readGlobal());
    merged = mergeTrackConfig(merged, await this.readProject(projectRoot));
    return merged;
  }

  private async readGlobal(): Promise<Partial<TrackConfig>> {
    try {
      const raw = await readFile(this.global.trackTablesPath(), 'utf8');
      return JSON.parse(raw) as Partial<TrackConfig>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  private async readProject(projectRoot: string): Promise<Partial<TrackConfig>> {
    const config = await this.project.read(projectRoot);
    return { tables: config.tables, column_types: config.column_types };
  }
}

/** Deep-merge one layer over another: tables by name, columns by name, column_types by spread. */
function mergeTrackConfig(base: TrackConfig, over: Partial<TrackConfig>): TrackConfig {
  return {
    tables: mergeTables(base.tables, over.tables ?? []),
    column_types: {
      ...base.column_types,
      ...(over.column_types ?? {}),
    } as Record<string, ColumnType>,
  };
}

function mergeTables(base: TrackedTable[], over: TrackedTable[]): TrackedTable[] {
  const byName = new Map<string, TrackedTable>();
  for (const t of base) byName.set(t.name, { name: t.name, columns: [...t.columns] });
  for (const t of over) {
    const existing = byName.get(t.name);
    if (!existing) {
      byName.set(t.name, { name: t.name, columns: [...t.columns] });
      continue;
    }
    const cols = new Map<string, TrackedColumn>();
    for (const c of existing.columns) cols.set(c.name, c);
    for (const c of t.columns) cols.set(c.name, { name: c.name, type: c.type }); // override wins
    existing.columns = [...cols.values()];
  }
  return [...byName.values()];
}
