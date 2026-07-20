/**
 * @file global-track-tables.service.ts
 * Reader and writer for the global tracked-table configuration file (~/.aify/track_tables.json).
 * Handles upserting individual column types and tables into the global config layer.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { GlobalConfigService } from '../global/global-config.service';
import { removeTrackedColumn, upsertColumnType, upsertTrackedTable } from './track-merge';
import type { ColumnType, TrackedTable } from './tracked-tables.types';

/**
 * Shape of the global track_tables.json file.
 */
interface GlobalTrackConfig {
  tables: TrackedTable[];
  column_types: Record<string, ColumnType>;
}

@Injectable()
export class GlobalTrackTablesService {
  constructor(private readonly global: GlobalConfigService) {}

  /**
   * Read the global track_tables.json file. Returns empty defaults if the file does not exist.
   */
  async read(): Promise<GlobalTrackConfig> {
    try {
      const raw = await readFile(this.global.trackTablesPath(), 'utf8');
      const parsed = JSON.parse(raw) as Partial<GlobalTrackConfig>;
      return {
        tables: parsed.tables ?? [],
        column_types: parsed.column_types ?? {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { tables: [], column_types: {} };
      }
      throw error;
    }
  }

  /**
   * Write the global track_tables.json file. Creates ~/.aify if needed.
   */
  private async write(config: GlobalTrackConfig): Promise<void> {
    await this.global.ensureGlobalDir();
    await writeFile(this.global.trackTablesPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }

  /**
   * Upsert a column type into the global config. Overwrites an existing entry with the same name.
   *
   * @param name The column type name (e.g., "script", "json").
   * @param def The ColumnType definition { file_name, extension, behavior }.
   */
  async addColumnType(name: string, def: ColumnType): Promise<void> {
    const config = await this.read();
    config.column_types = upsertColumnType(config.column_types, name, def);
    await this.write(config);
  }

  /**
   * Upsert a table into the global config. If the table already exists, merges its columns
   * (existing columns preserved, new/overridden columns updated).
   *
   * @param table The TrackedTable to add or merge.
   */
  async addTrackedTable(table: TrackedTable): Promise<void> {
    const config = await this.read();
    config.tables = upsertTrackedTable(config.tables, table);
    await this.write(config);
  }

  /**
   * Remove a tracked column from the global config. Drops the table entry if it becomes empty.
   *
   * @param tableName The table name.
   * @param columnName The column name to remove.
   */
  async removeTrackedColumn(tableName: string, columnName: string): Promise<void> {
    const config = await this.read();
    config.tables = removeTrackedColumn(config.tables, tableName, columnName);
    await this.write(config);
  }
}
