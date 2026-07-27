/**
 * @file pull.stage.ts
 * @description PullStage (Sync Step 1). Fetches application metadata by querying each tracked
 * table directly (`sys_scope=<appSysId>` + optional incremental date filter on first pull omission),
 * creates new record folders/files, ignores unchanged records, applies deletions from
 * `sys_metadata_delete` (OS-9), and carries changed existing records forward to conflict-check.
 */

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Optional } from '@nestjs/common';
import { dateGenerate } from '../../api/encoded-query.builder';
import type { SnAuth, SnRecord } from '../../api/table-api.client';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TableApiClient } from '../../api/table-api.client';
import { writeFileAtomic } from '../../common/fs/atomic-write';
import { hashContent } from '../../common/hashing/content-hash';
import { slugifyDisplayValue } from '../../common/normalization/slugify';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { GlobalConfigService } from '../../config/global/global-config.service';
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

@Injectable()
export class PullStage {
  constructor(
    private readonly api: TableApiClient,
    private readonly records: RecordMetadataService,
    @Optional() private readonly globalConfig?: GlobalConfigService,
  ) {}

  /**
   * Hot-mode change detector (OS-13): issues ONE lightweight `sys_metadata` request filtered by
   * `sys_scope` (and optional date) and returns the changed rows without fetching child tables or
   * writing files. `SyncService.pollOnce` runs the full pipeline only when this is non-empty.
   */
  async detectChanges(input: PullInput): Promise<SnRecord[]> {
    const { scope, snAuth, lastUpdated } = input;
    const dateClause = lastUpdated ? `^sys_updated_on>${dateGenerate(lastUpdated)}` : '';
    return this.api.list(snAuth, 'sys_metadata', {
      query: `sys_scope=${scope.sysId}${dateClause}`,
      fields: ['sys_id', 'sys_class_name', 'sys_updated_on'],
    });
  }

  /** Run the pull for one scope. */
  async run(input: PullInput): Promise<PullResult> {
    const { root, scope, snAuth, trackConfig, lastUpdated } = input;
    const map = await this.records.loadScopeMap(root, scope.scope);
    const dateClause = lastUpdated ? `^sys_updated_on>${dateGenerate(lastUpdated)}` : '';

    const result: PullResult = { changed: [], created: [], deleted: [] };

    for (const table of trackConfig.tables) {
      const columns = table.columns;
      const fields = [
        ...columns.map((c) => c.name),
        'sys_id',
        'sys_updated_on',
        'sys_mod_count',
        'sys_name',
      ];
      const query = `sys_scope=${scope.sysId}${dateClause}`;

      let records: SnRecord[];
      try {
        records = await this.api.list(snAuth, table.name, { query, fields });
      } catch (err) {
        const base = err instanceof Error ? err.message : String(err);
        await this.globalConfig?.debug(
          `Pull failed for table ${table.name} (scope ${scope.scope}): ${base} | query: ${query} | fields: ${fields.join(',')}`,
        );
        throw new Error(`Failed to pull table ${table.name} for scope ${scope.scope}: ${base}`);
      }

      for (const rec of records) {
        const existing = map.get(rec.sys_id);
        if (
          existing &&
          existing.meta.$sys_updated_on === rec.sys_updated_on &&
          Number(existing.meta.$sys_mod_count) === Number(rec.sys_mod_count)
        ) {
          continue; // unchanged
        }

        if (existing) {
          result.changed.push({
            table: table.name,
            sysId: rec.sys_id,
            folder: existing.folder,
            meta: existing.meta,
            remote: rec,
          });
        } else {
          result.created.push(
            await this.createRecord(root, scope.scope, table.name, rec, trackConfig),
          );
        }
      }
    }

    // deletions (skip on first pull — nothing pulled yet)
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

  /** Write a brand-new record's files + record_metadata.json; return the created folder path. */
  private async createRecord(
    root: string,
    scope: string,
    table: string,
    record: SnRecord,
    track: TrackConfig,
  ): Promise<string> {
    const display = record.sys_name ?? record.sys_id;
    const folder = this.records.recordFolder(root, scope, table, display, record.sys_id);
    const columns = track.tables.find((t) => t.name === table)?.columns ?? [];
    const meta: RecordMetadata = {
      $sys_id: record.sys_id,
      $table: table,
      $display_value: display,
      $parsed_display_value: slugifyDisplayValue(display, record.sys_id),
      $sys_updated_on: record.sys_updated_on,
      $sys_mod_count: Number(record.sys_mod_count),
      $hash: {},
      $conflicts: {},
    };
    for (const col of columns) {
      const type = track.column_types[col.type];
      const extension = type?.extension ?? 'txt';
      const content = record[col.name] ?? '';
      await writeFileAtomic(join(folder, `${col.name}.${extension}`), content);
      meta[col.name] = content;
      meta.$hash[col.name] = hashContent(content);
      meta.$conflicts[col.name] = false;
    }
    await this.records.write(folder, meta);
    return folder;
  }
}
