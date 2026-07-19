/**
 * @file pull.stage.ts
 * @description PullStage (Sync Step 1). Fetches changed metadata from `sys_metadata` (IN over tracked
 * tables + optional date filter, first pull omits date), fetches tracked-column data per child table
 * by `sys_idIN…`, creates new record folders/files, ignores unchanged records, applies deletions from
 * `sys_metadata_delete` (OS-9), and carries changed existing records forward to conflict-check.
 */

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { dateGenerate, inClause } from '../../api/encoded-query.builder';
import type { SnAuth, SnRecord } from '../../api/table-api.client';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TableApiClient } from '../../api/table-api.client';
import { writeFileAtomic } from '../../common/fs/atomic-write';
import { hashContent } from '../../common/hashing/content-hash';
import { slugifyDisplayValue } from '../../common/normalization/slugify';
import type { TrackConfig } from '../../config/tracked-tables/tracked-tables.types';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { RecordMetadataService } from '../../record-metadata/record-metadata.service';
import type { RecordMetadata } from '../../record-metadata/record-metadata.types';

export interface PullInput {
  root: string;
  scope: { sysId: string; scope: string };
  snAuth: SnAuth;
  trackConfig: TrackConfig;
  /** Scope's last sync timestamp ("YYYY-MM-DD HH:MM:SS"); undefined ⇒ first pull (omit date). */
  lastUpdated?: string;
}

/** An existing record that changed remotely and is carried into conflict-check. */
export interface PulledRecord {
  table: string;
  sysId: string;
  folder: string;
  meta: RecordMetadata;
  remote: SnRecord;
}

export interface PullResult {
  changed: PulledRecord[];
  created: string[];
  deleted: string[];
}

const URL_LIMIT = 1800;

@Injectable()
export class PullStage {
  constructor(
    private readonly api: TableApiClient,
    private readonly records: RecordMetadataService,
  ) {}

  /**
   * Hot-mode change detector (OS-13): issues ONE lightweight `sys_metadata` request (same query
   * `run()` builds) and returns the changed rows without fetching child tables or writing files.
   * `SyncService.pollOnce` runs the full pipeline only when this is non-empty.
   */
  async detectChanges(input: PullInput): Promise<SnRecord[]> {
    const { scope, snAuth, trackConfig, lastUpdated } = input;
    const tables = trackConfig.tables.map((t) => t.name);
    const dateClause = lastUpdated ? `^sys_updated_on>${dateGenerate(lastUpdated)}` : '';
    return this.api.list(snAuth, 'sys_metadata', {
      query: `sys_scope=${scope.sysId}${dateClause}^${inClause('sys_class_name', tables)}`,
      fields: ['sys_id', 'sys_class_name', 'sys_updated_on'],
    });
  }

  /** Run the pull for one scope. */
  async run(input: PullInput): Promise<PullResult> {
    const { root, scope, snAuth, trackConfig, lastUpdated } = input;
    const map = await this.records.loadScopeMap(root, scope.scope);
    const tables = trackConfig.tables.map((t) => t.name);
    const dateClause = lastUpdated ? `^sys_updated_on>${dateGenerate(lastUpdated)}` : '';

    // 1. changed / added metadata rows
    const metaRows = await this.api.list(snAuth, 'sys_metadata', {
      query: `sys_scope=${scope.sysId}${dateClause}^${inClause('sys_class_name', tables)}`,
      fields: ['sys_id', 'sys_class_name', 'sys_updated_on', 'sys_mod_count', 'sys_name'],
    });

    const changedIdsByTable = new Map<string, string[]>();
    const rowBySysId = new Map<string, SnRecord>();
    for (const row of metaRows) {
      const existing = map.get(row.sys_id);
      if (
        existing &&
        existing.meta.$sys_updated_on === row.sys_updated_on &&
        Number(existing.meta.$sys_mod_count) === Number(row.sys_mod_count)
      ) {
        continue; // unchanged
      }
      rowBySysId.set(row.sys_id, row);
      const list = changedIdsByTable.get(row.sys_class_name) ?? [];
      list.push(row.sys_id);
      changedIdsByTable.set(row.sys_class_name, list);
    }

    // 2. child-table data for changed ids
    const result: PullResult = { changed: [], created: [], deleted: [] };
    for (const [table, ids] of changedIdsByTable) {
      const columns = trackConfig.tables.find((t) => t.name === table)?.columns ?? [];
      const fields = [...columns.map((c) => c.name), 'sys_id', 'sys_updated_on', 'sys_mod_count'];
      const data: SnRecord[] = [];
      for (const chunk of this.chunkIds(table, ids)) {
        data.push(
          ...(await this.api.list(snAuth, table, { query: inClause('sys_id', chunk), fields })),
        );
      }
      for (const rec of data) {
        const metaRow = rowBySysId.get(rec.sys_id);
        if (!metaRow) continue;
        const existing = map.get(rec.sys_id);
        if (existing) {
          result.changed.push({
            table,
            sysId: rec.sys_id,
            folder: existing.folder,
            meta: existing.meta,
            remote: rec,
          });
        } else {
          result.created.push(
            await this.createRecord(root, scope.scope, table, metaRow, rec, trackConfig),
          );
        }
      }
    }

    // 3. deletions (skip on first pull — nothing pulled yet)
    if (lastUpdated) {
      const dels = await this.api.list(snAuth, 'sys_metadata_delete', {
        query: `sys_scope=${scope.sysId}^sys_updated_on>${dateGenerate(lastUpdated)}`,
        fields: ['sys_id', 'sys_class_name', 'sys_updated_on'],
      });
      for (const del of dels) {
        const hit = map.get(del.sys_id);
        if (!hit) continue; // no local match ⇒ no-op
        await rm(hit.folder, { recursive: true, force: true });
        result.deleted.push(hit.folder);
      }
    }
    return result;
  }

  /** Split a sys_id list so each `sys_idIN…` query keeps the request URL ≤ 1800 chars (OS-25). */
  private chunkIds(table: string, ids: string[]): string[][] {
    const prefixLen = `/api/now/v2/table/${table}?sysparm_query=sys_idIN`.length;
    const chunks: string[][] = [];
    let cur: string[] = [];
    for (const id of ids) {
      const projected = prefixLen + cur.concat(id).join(',').length;
      if (cur.length && projected > URL_LIMIT) {
        chunks.push(cur);
        cur = [];
      }
      cur.push(id);
    }
    if (cur.length) chunks.push(cur);
    return chunks;
  }

  /** Write a brand-new record's files + record_metadata.json; return the created folder path. */
  private async createRecord(
    root: string,
    scope: string,
    table: string,
    metaRow: SnRecord,
    data: SnRecord,
    track: TrackConfig,
  ): Promise<string> {
    const display = metaRow.sys_name ?? data.sys_id;
    const folder = this.records.recordFolder(root, scope, table, display, data.sys_id);
    const columns = track.tables.find((t) => t.name === table)?.columns ?? [];
    const meta: RecordMetadata = {
      $sys_id: data.sys_id,
      $table: table,
      $display_value: display,
      $parsed_display_value: slugifyDisplayValue(display, data.sys_id),
      $sys_updated_on: data.sys_updated_on,
      $sys_mod_count: Number(data.sys_mod_count),
      $hash: {},
      $conflicts: {},
    };
    for (const col of columns) {
      const type = track.column_types[col.type];
      const extension = type?.extension ?? 'txt';
      const content = data[col.name] ?? '';
      await writeFileAtomic(join(folder, `${col.name}.${extension}`), content);
      meta[col.name] = content;
      meta.$hash[col.name] = hashContent(content);
      meta.$conflicts[col.name] = false;
    }
    await this.records.write(folder, meta);
    return folder;
  }
}
