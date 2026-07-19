/**
 * @file conflict-check.stage.ts
 * @description ConflictCheckStage (Sync Step 2). Purely local, hash-based (OS-24). For each tracked
 * column of each carried-over record, computes `localChanged` (file hash ≠ stored `$hash`) and
 * `remoteChanged` (instance value ≠ stored merge base), then classifies into `noop` / `take-remote` /
 * `keep-local` / `merge`.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { hashContent } from '../../common/hashing/content-hash';
import type { TrackConfig } from '../../config/tracked-tables/tracked-tables.types';
import type { ColumnChange, ConflictClass } from '../sync.types';
import type { PulledRecord } from './pull.stage';

@Injectable()
export class ConflictCheckStage {
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

  private classifyOne(local: boolean, remote: boolean): ConflictClass {
    if (!local && !remote) return 'noop';
    if (!local && remote) return 'take-remote';
    if (local && !remote) return 'keep-local';
    return 'merge';
  }
}
