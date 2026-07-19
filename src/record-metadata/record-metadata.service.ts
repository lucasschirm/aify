/**
 * @file record-metadata.service.ts
 * @description The folder<->record bridge. Resolves a record's on-disk folder from its display value
 * and sys_id (disambiguating collisions/empty slugs by the first 8 chars of sys_id), reads/writes
 * `record_metadata.json` atomically, loads a scope into a sys_id-keyed map, and renames folders when
 * a display value changes. See initial_plan_v2.md (OS-11/OS-12).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { writeFileAtomic } from '../common/fs/atomic-write';
import { slugifyDisplayValue } from '../common/normalization/slugify';
import type { RecordMetadata } from './record-metadata.types';

const META_FILE = 'record_metadata.json';

@Injectable()
export class RecordMetadataService {
  /** Absolute record folder path: <root>/<scope>/<table>/<slug|slug__first8sysid>. */
  recordFolder(
    root: string,
    scope: string,
    table: string,
    displayValue: string,
    sysId: string,
  ): string {
    const tableDir = join(root, scope, table);
    const slug = slugifyDisplayValue(displayValue, sysId);
    if (!existsSync(tableDir)) {
      return join(tableDir, slug);
    }

    const entries = readdirSync(tableDir);
    // If this exact sys_id already has a folder, keep that folder name (handles display-value rename).
    for (const entry of entries) {
      const metaPath = join(tableDir, entry, META_FILE);
      if (!existsSync(metaPath)) continue;
      try {
        const raw = readFileSync(metaPath, 'utf8');
        const meta = JSON.parse(raw) as { $sys_id?: string };
        if (meta.$sys_id === sysId) {
          return join(tableDir, entry);
        }
      } catch {
        // ignore corrupt metadata
      }
    }

    // No existing folder for this sys_id. Use the slug, disambiguating on collision.
    let folderName = slug;
    if (entries.some((e) => e === folderName)) {
      folderName = `${slug}__${sysId.slice(0, 8)}`;
    }
    return join(tableDir, folderName);
  }

  /** Read the record's metadata, or null when the file does not exist. */
  async read(folder: string): Promise<RecordMetadata | null> {
    try {
      const raw = await readFile(join(folder, META_FILE), 'utf8');
      return JSON.parse(raw) as RecordMetadata;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  /** Write the record's metadata atomically (tmp file + rename), creating parent dirs. */
  async write(folder: string, meta: RecordMetadata): Promise<void> {
    await mkdir(folder, { recursive: true });
    await writeFileAtomic(join(folder, META_FILE), `${JSON.stringify(meta, null, 2)}\n`);
  }

  /** Load every record_metadata.json under a scope into a map keyed by sys_id. */
  async loadScopeMap(
    root: string,
    scope: string,
  ): Promise<Map<string, { folder: string; meta: RecordMetadata }>> {
    const map = new Map<string, { folder: string; meta: RecordMetadata }>();
    const scopeDir = join(root, scope);
    if (!existsSync(scopeDir)) return map;

    const tableDirs = await readdir(scopeDir, { withFileTypes: true });
    for (const tableDir of tableDirs) {
      if (!tableDir.isDirectory()) continue;
      const tablePath = join(scopeDir, tableDir.name);
      const recordFolders = await readdir(tablePath, { withFileTypes: true });
      for (const recordFolder of recordFolders) {
        if (!recordFolder.isDirectory()) continue;
        const folder = join(tablePath, recordFolder.name);
        const meta = await this.read(folder);
        if (meta?.$sys_id) {
          map.set(meta.$sys_id, { folder, meta });
        }
      }
    }
    return map;
  }

  /** Rename the folder when a display value changed (matched by sys_id). */
  async rename(oldFolder: string, newFolder: string): Promise<void> {
    if (oldFolder === newFolder) return;
    await rm(newFolder, { force: true, recursive: true });
    await rename(oldFolder, newFolder);
  }
}
