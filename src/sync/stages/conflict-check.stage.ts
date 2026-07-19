/**
 * @file conflict-check.stage.ts
 * @description ConflictCheckStage (Sync Step 2). Purely local, hash-based (OS-24). For each tracked
 * column of each carried-over record, computes `localChanged` (file hash ≠ stored `$hash`) and
 * `remoteChanged` (instance value ≠ stored merge base), then classifies into `noop` / `take-remote` /
 * `keep-local` / `merge`.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Injectable } from '@nestjs/common';
import { hashContent } from '../../common/hashing/content-hash';
import type { TrackConfig } from '../../config/tracked-tables/tracked-tables.types';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { RecordMetadataService } from '../../record-metadata/record-metadata.service';
import type { ColumnChange, ConflictClass } from '../sync.types';
import type { PulledRecord } from './pull.stage';
import { hasConflictMarkers } from './write.stage';

@Injectable()
export class ConflictCheckStage {
  constructor(private readonly records: RecordMetadataService) {}

  /**
   * Pre-pass over a scope's records for columns flagged `$conflicts=true` on a prior sync
   * (initial_plan.md line 283). A column whose file still holds git markers is unresolved — its
   * relative path is returned so the caller can block the sync. A column with no markers has been
   * resolved by the user: its `$conflicts` flag is cleared and persisted so `PushStage` will upload
   * it and `classify` can re-merge it against a newer remote. Returns every unresolved file's path
   * (relative to `root`).
   */
  async resolveFlaggedConflicts(
    root: string,
    scope: string,
    trackConfig: TrackConfig,
  ): Promise<string[]> {
    const map = await this.records.loadScopeMap(root, scope);
    const unresolved: string[] = [];
    for (const { folder, meta } of map.values()) {
      const columns = trackConfig.tables.find((t) => t.name === meta.$table)?.columns ?? [];
      let dirty = false;
      for (const col of columns) {
        if (meta.$conflicts[col.name] !== true) continue;
        const ext = trackConfig.column_types[col.type]?.extension ?? 'txt';
        const filePath = join(folder, `${col.name}.${ext}`);
        const local = await readFile(filePath, 'utf8').catch(() => '');
        if (hasConflictMarkers(local)) {
          unresolved.push(relative(root, filePath));
        } else {
          meta.$conflicts[col.name] = false; // resolved → let it push / re-merge
          dirty = true;
        }
      }
      if (dirty) await this.records.write(folder, meta);
    }
    return unresolved;
  }

  /** Classify every tracked column of every carried-over record. */
  async classify(records: PulledRecord[], trackConfig: TrackConfig): Promise<ColumnChange[]> {
    const changes: ColumnChange[] = [];
    for (const record of records) {
      const columns = trackConfig.tables.find((t) => t.name === record.table)?.columns ?? [];
      for (const col of columns) {
        const ext = trackConfig.column_types[col.type]?.extension ?? 'txt';
        const filePath = join(record.folder, `${col.name}.${ext}`);
        const local = await readFile(filePath, 'utf8').catch(() => '');
        const base = (record.meta[col.name] as string | undefined) ?? '';
        const remote = record.remote[col.name] ?? '';
        const localChanged = hashContent(local) !== record.meta.$hash[col.name];
        const remoteChanged = remote !== base;
        changes.push({
          sysId: record.sysId,
          table: record.table,
          column: col.name,
          localChanged,
          remoteChanged,
          klass: this.classifyOne(localChanged, remoteChanged),
          base,
          local,
          remote,
          folder: record.folder,
          filePath,
          remoteUpdatedOn: record.remote.sys_updated_on,
          remoteModCount: record.remote.sys_mod_count
            ? Number(record.remote.sys_mod_count)
            : undefined,
        });
      }
    }
    return changes;
  }

  /**
   * Scan every local record in a scope for columns whose file hash differs from the stored
   * `$hash` (user edits the instance didn't report as changed). Returns `keep-local` changes
   * for each one, skipping any sys_id already in `remoteChangedIds` (those were handled by
   * `classify` above). This is what makes `aify sync` push local-only edits to the instance.
   */
  async detectLocalChanges(
    root: string,
    scope: string,
    trackConfig: TrackConfig,
    remoteChangedIds: Set<string>,
  ): Promise<ColumnChange[]> {
    const map = await this.records.loadScopeMap(root, scope);
    const changes: ColumnChange[] = [];
    for (const { folder, meta } of map.values()) {
      if (remoteChangedIds.has(meta.$sys_id)) continue; // already classified via pull
      const tableColumns = trackConfig.tables.find((t) => t.name === meta.$table)?.columns ?? [];
      if (tableColumns.length === 0) continue;
      let files: string[] = [];
      try {
        files = await readdir(folder);
      } catch {
        continue;
      }
      for (const col of tableColumns) {
        const ext = trackConfig.column_types[col.type]?.extension ?? 'txt';
        const fileName = `${col.name}.${ext}`;
        if (!files.includes(fileName)) continue;
        const filePath = join(folder, fileName);
        const local = await readFile(filePath, 'utf8').catch(() => '');
        const storedHash = meta.$hash[col.name];
        if (storedHash === undefined) continue;
        if (hashContent(local) === storedHash) continue; // unchanged
        changes.push({
          sysId: meta.$sys_id,
          table: meta.$table,
          column: col.name,
          localChanged: true,
          remoteChanged: false,
          klass: 'keep-local',
          base: (meta[col.name] as string | undefined) ?? '',
          local,
          remote: (meta[col.name] as string | undefined) ?? '',
          folder,
          filePath,
        });
      }
    }
    return changes;
  }

  private classifyOne(local: boolean, remote: boolean): ConflictClass {
    if (!local && !remote) return 'noop';
    if (!local && remote) return 'take-remote';
    if (local && !remote) return 'keep-local';
    return 'merge';
  }
}
