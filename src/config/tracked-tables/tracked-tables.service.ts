/**
 * @file tracked-tables.service.ts
 * TrackedTablesService.getProjectTrackTables() deep-merges the tracked-table config across three
 * layers — DEFAULT_TABLES → ~/.aify/track_tables.json (global) → .aify.config.json
 * (project) — so project settings win and nothing is lost (OS-15). Tables merge by name, their
 * columns by name, and column_types by spread (last writer wins).
 */

import { readFile } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { GlobalConfigService } from '../global/global-config.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { ProjectConfigService } from '../project/project-config.service';
import { DEFAULT_TABLES } from './default-tables';
import type {
  ColumnType,
  TrackConfig,
  TrackedColumn,
  TrackedTable,
  TrackSource,
} from './tracked-tables.types';

@Injectable()
export class TrackedTablesService {
  constructor(
    private readonly global: GlobalConfigService,
    private readonly project: ProjectConfigService,
  ) {}

  async getProjectTrackTables(projectRoot: string): Promise<TrackConfig> {
    let merged = mergeTrackConfig(
      { tables: [], column_types: {} as Record<string, ColumnType> },
      DEFAULT_TABLES,
    );
    merged = mergeTrackConfig(merged, await this.readGlobal());
    merged = mergeTrackConfig(merged, await this.readProject(projectRoot));
    return merged;
  }

  /**
   * Resolve the winning tracking source layer for each tracked column of `tableName`, applying the
   * same precedence as getProjectTrackTables: package (DEFAULT_TABLES) < global < project.
   * The map key is a column name; the value is the layer that currently "wins" that column.
   * A column absent from all layers is absent from the map.
   *
   * @param projectRoot The project root directory.
   * @param tableName The table name to resolve sources for.
   * @returns A map where keys are column names and values are the winning TrackSource layer.
   */
  async getColumnSources(
    projectRoot: string,
    tableName: string,
  ): Promise<Map<string, TrackSource>> {
    const sources = new Map<string, TrackSource>();
    const pkg = DEFAULT_TABLES.tables.find((t) => t.name === tableName);
    for (const c of pkg?.columns ?? []) sources.set(c.name, 'package');
    const global = (await this.readGlobal()).tables?.find((t) => t.name === tableName);
    for (const c of global?.columns ?? []) sources.set(c.name, 'global');
    const project = (await this.readProject(projectRoot)).tables?.find((t) => t.name === tableName);
    for (const c of project?.columns ?? []) sources.set(c.name, 'project');
    return sources;
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
