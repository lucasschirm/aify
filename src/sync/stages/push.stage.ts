/**
 * @file push.stage.ts
 * @description PushStage (Sync Step 4). Pushes merged + locally-changed columns back to the instance
 * via PATCH /api/now/v2/table/${table}/${sys_id}, sending only the changed tracked columns.
 * Refreshes each column's `$hash` and the record's `$sys_updated_on`/`$sys_mod_count` from the
 * response. Last-write-wins — no `sys_mod_count` precheck (OS-28). Records without a `$sys_id` are
 * skipped + warned.
 */

import { readFile } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import type { SnAuth } from '../../api/table-api.client';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TableApiClient } from '../../api/table-api.client';
import { hashContent } from '../../common/hashing/content-hash';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { RecordMetadataService } from '../../record-metadata/record-metadata.service';
import type { RecordMetadata } from '../../record-metadata/record-metadata.types';
import type { ColumnChange } from '../sync.types';

export interface PushInput {
  snAuth: SnAuth;
  changes: ColumnChange[];
}

export interface PushResult {
  pushed: string[];
  skipped: string[];
}

@Injectable()
export class PushStage {
  private readonly logger = new Logger(PushStage.name);

  constructor(
    private readonly api: TableApiClient,
    private readonly records: RecordMetadataService,
  ) {}

  /** Push every record that has locally-changed, non-conflicted columns. */
  async push(input: PushInput): Promise<PushResult> {
    const result: PushResult = { pushed: [], skipped: [] };
    const byFolder = new Map<string, ColumnChange[]>();
    for (const c of input.changes) {
      if (c.klass !== 'keep-local' && c.klass !== 'merge') continue;
      const list = byFolder.get(c.folder) ?? [];
      list.push(c);
      byFolder.set(c.folder, list);
    }

    for (const [folder, changes] of byFolder) {
      const meta = await this.records.read(folder);
      if (!meta) continue;
      if (!meta.$sys_id) {
        this.logger.warn(
          `Skipping "${folder}": no $sys_id in record_metadata.json (aify never creates records).`,
        );
        result.skipped.push('');
        continue;
      }
      const body: Record<string, string> = {};
      const pushedColumns: { column: string; content: string }[] = [];
      for (const c of changes) {
        if (meta.$conflicts[c.column] === true) continue; // never push a conflicted column
        if (meta.$hash[c.column] === undefined) continue; // never PATCH an untracked field
        const content = await readFile(c.filePath, 'utf8');
        body[c.column] = content;
        pushedColumns.push({ column: c.column, content });
      }
      if (pushedColumns.length === 0) continue;

      const table = changes[0].table;
      const updated = await this.api.patch(input.snAuth, table, meta.$sys_id, body);
      this.refreshMeta(meta, pushedColumns, updated.sys_updated_on, updated.sys_mod_count);
      await this.records.write(folder, meta);
      result.pushed.push(meta.$sys_id);
    }
    return result;
  }

  private refreshMeta(
    meta: RecordMetadata,
    columns: { column: string; content: string }[],
    sysUpdatedOn: string | undefined,
    sysModCount: string | undefined,
  ): void {
    for (const { column, content } of columns) {
      meta[column] = content; // new merge base
      meta.$hash[column] = hashContent(content);
    }
    if (sysUpdatedOn) meta.$sys_updated_on = sysUpdatedOn;
    if (sysModCount !== undefined) meta.$sys_mod_count = Number(sysModCount);
  }
}
