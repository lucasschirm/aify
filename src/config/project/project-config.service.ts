/**
 * @file project-config.service.ts
 * Reads, creates, and mutates the project marker file .aify.config.json. Finds the project
 * root via a bounded parent walk (stopping at the home directory or the filesystem root),
 * creates an empty config when none exists, and manages scopes and the auth-failure counter.
 * aify makes no .gitignore changes (OS-10).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import {
  removeTrackedColumn,
  upsertColumnType,
  upsertTrackedTable,
} from '../tracked-tables/track-merge';
import type { ColumnType, TrackedTable } from '../tracked-tables/tracked-tables.types';
import type { AifyProjectConfig } from './project-config.types';

const CONFIG_FILE = '.aify.config.json';

@Injectable()
export class ProjectConfigService {
  private async exists(p: string): Promise<boolean> {
    try {
      await access(p);
      return true;
    } catch {
      return false;
    }
  }

  /** Walk up from startDir looking for .aify.config.json; stop at homedir or fs root. */
  async findProjectRoot(startDir: string = process.cwd()): Promise<string | null> {
    const home = homedir();
    let dir = resolve(startDir);
    for (;;) {
      if (await this.exists(join(dir, CONFIG_FILE))) return dir;
      if (dir === home) return null; // never search above the home directory
      const parent = dirname(dir);
      if (parent === dir) return null; // filesystem root reached
      dir = parent;
    }
  }

  /** Return the found root, or create an empty {} config at startDir and return it. */
  async ensureProjectRoot(startDir: string = process.cwd()): Promise<string> {
    const found = await this.findProjectRoot(startDir);
    if (found) return found;
    const root = resolve(startDir);
    await this.write(root, {});
    return root;
  }

  async read(root: string): Promise<AifyProjectConfig> {
    try {
      const raw = await readFile(join(root, CONFIG_FILE), 'utf8');
      return JSON.parse(raw) as AifyProjectConfig;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  async write(root: string, config: AifyProjectConfig): Promise<void> {
    const file = join(root, CONFIG_FILE);
    await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }

  async addScope(root: string, scope: { sysId: string; scope: string }): Promise<void> {
    const config = await this.read(root);
    const scopes = config.project?.scopes ?? [];
    if (!scopes.some((s) => s.sysId === scope.sysId)) scopes.push(scope);
    config.project = { scopes };
    await this.write(root, config);
  }

  async incrementAuthFailures(root: string): Promise<number> {
    const config = await this.read(root);
    const next = (config.auth?.failedAttempts ?? 0) + 1;
    config.auth = { failedAttempts: next };
    await this.write(root, config);
    return next;
  }

  async resetAuthFailures(root: string): Promise<void> {
    const config = await this.read(root);
    config.auth = { failedAttempts: 0 };
    await this.write(root, config);
  }

  /**
   * Upsert a column type into the project config. Overwrites an existing entry with the same name.
   *
   * @param root The project root directory.
   * @param name The column type name (e.g., "script", "json").
   * @param def The ColumnType definition { file_name, extension, behavior }.
   */
  async addColumnType(root: string, name: string, def: ColumnType): Promise<void> {
    const config = await this.read(root);
    config.column_types = upsertColumnType(config.column_types, name, def);
    await this.write(root, config);
  }

  /**
   * Upsert a table into the project config. If the table already exists, merges its columns
   * (existing columns preserved, new/overridden columns updated).
   *
   * @param root The project root directory.
   * @param table The TrackedTable to add or merge.
   */
  async addTrackedTable(root: string, table: TrackedTable): Promise<void> {
    const config = await this.read(root);
    config.tables = upsertTrackedTable(config.tables, table);
    await this.write(root, config);
  }

  /**
   * Remove a tracked column from the project config. Drops the table entry if it becomes empty.
   *
   * @param root The project root directory.
   * @param tableName The table name.
   * @param columnName The column name to remove.
   */
  async removeTrackedColumn(root: string, tableName: string, columnName: string): Promise<void> {
    const config = await this.read(root);
    config.tables = removeTrackedColumn(config.tables, tableName, columnName);
    await this.write(root, config);
  }
}

// Re-export to avoid unused import warning for the marker above.
export type { AifyProjectConfig };

async function access(p: string): Promise<void> {
  await readFile(p); // Simplified existence check
}
