/**
 * @file write.stage.ts
 * @description WriteStage (Sync Step 3). Applies the 4-quadrant decision table:
 *   take-remote → write instance value + refresh `$hash`/`$conflicts`;
 *   keep-local → leave file, to be pushed in Step 4;
 *   merge → 3-way merge (base = HEAD, local = user edits, remote = incoming, OS-27).
 * Clean merge → write + clear `$conflicts`; conflicted merge → git markers (OS-26) +
 * `$conflicts=true` + hash the conflicted content + print the spec message.
 * `--force-pull` overwrites every column. Emits `AIFY_FILE_WRITTEN` before every aify disk write
 * so hot-mode watcher can suppress its own changes.
 */

import { relative } from 'node:path';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { EventEmitter2 } from '@nestjs/event-emitter';
import { structuredPatch } from 'diff';
import { writeFileAtomic } from '../../common/fs/atomic-write';
import { hashContent } from '../../common/hashing/content-hash';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { RecordMetadataService } from '../../record-metadata/record-metadata.service';
import type { RecordMetadata } from '../../record-metadata/record-metadata.types';
import { AIFY_FILE_WRITTEN, type AifyFileWrittenPayload } from '../hot/hot-events';
import type { ColumnChange } from '../sync.types';

interface Hunk {
  oldStart: number;
  oldLines: number;
  lines: string[];
}

/**
 * 3-way merge of `base` (common ancestor), `local` (user edits), and `remote` (incoming).
 * Returns the merged text and whether any conflicts were found. Non-overlapping edits merge
 * cleanly; overlapping edits produce git-style `<<<<<<< HEAD` / `=======` / `>>>>>>> New-HEAD`
 * markers (OS-26).
 */
function threeWayMerge(
  base: string,
  local: string,
  remote: string,
): {
  merged: string;
  conflict: boolean;
} {
  const baseLines = base.split('\n');
  const localHunks = structuredPatch('', '', base, local, '', '', { context: 0 }).hunks as Hunk[];
  const remoteHunks = structuredPatch('', '', base, remote, '', '', { context: 0 }).hunks as Hunk[];

  const result: string[] = [];
  let conflict = false;
  let bi = 0; // base line cursor

  // Merge two sorted hunk lists by their base-line range.
  let li = 0;
  let ri = 0;
  while (li < localHunks.length || ri < remoteHunks.length) {
    const lh = localHunks[li];
    const rh = remoteHunks[ri];
    // Pick the hunk that starts earliest in base; if both start at the same
    // base line, they overlap → conflict region.
    const lStart = lh ? lh.oldStart - 1 : Infinity;
    const rStart = rh ? rh.oldStart - 1 : Infinity;

    if (lh && (lStart < rStart || !rh)) {
      // Local-only hunk — copy base lines before it, then apply local hunk.
      copyBase(bi, lStart);
      applyHunk(lh, 'local');
      bi = lStart + lh.oldLines;
      li++;
    } else if (rh && (rStart < lStart || !lh)) {
      // Remote-only hunk — copy base lines before it, then apply remote hunk.
      copyBase(bi, rStart);
      applyHunk(rh, 'remote');
      bi = rStart + rh.oldLines;
      ri++;
    } else {
      // Overlapping hunks at the same base position → conflict.
      copyBase(bi, lStart);
      const localBlock = extractAdded(lh);
      const remoteBlock = extractAdded(rh);
      if (localBlock.join('\n') === remoteBlock.join('\n')) {
        // Same change on both sides — take it once.
        result.push(...localBlock);
      } else {
        conflict = true;
        result.push('<<<<<<< HEAD', ...localBlock, '=======', ...remoteBlock, '>>>>>>> New-HEAD');
      }
      bi = lStart + Math.max(lh.oldLines, rh.oldLines);
      li++;
      ri++;
    }
  }
  copyBase(bi, baseLines.length);

  return { merged: result.join('\n'), conflict };

  /** Copy base lines [from, to) into result. */
  function copyBase(from: number, to: number): void {
    for (let i = from; i < to; i++) result.push(baseLines[i]);
  }

  /** Apply a hunk's additions (skip removed/context lines). */
  function applyHunk(hunk: Hunk, _side: 'local' | 'remote'): void {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) result.push(line.slice(1));
    }
  }

  /** Extract only the added lines from a hunk. */
  function extractAdded(hunk: Hunk): string[] {
    return hunk.lines.filter((l) => l.startsWith('+')).map((l) => l.slice(1));
  }
}

const MARKER = /^(<{7}|={7}|>{7})/m;

/** True when the text still holds git conflict markers. */
export function hasConflictMarkers(text: string): boolean {
  return MARKER.test(text);
}

/** Pull's guard (OS-26): resolved ⇔ no markers AND content hash differs from the stored one. */
export function isConflictResolved(fileContent: string, storedConflictHash: string): boolean {
  return !hasConflictMarkers(fileContent) && hashContent(fileContent) !== storedConflictHash;
}

export interface WriteInput {
  root: string;
  changes: ColumnChange[];
  forcePull?: boolean;
}

export interface WriteResult {
  conflicted: string[];
}

@Injectable()
export class WriteStage {
  constructor(
    private readonly records: RecordMetadataService,
    private readonly events: EventEmitter2,
  ) {}

  /** Apply every change to disk + record_metadata.json; return the paths left conflicted. */
  async apply(input: WriteInput): Promise<WriteResult> {
    const result: WriteResult = { conflicted: [] };
    for (const change of input.changes) {
      const meta = await this.records.read(change.folder);
      if (!meta) continue;
      if (input.forcePull) {
        await this.takeRemote(change, meta);
      } else {
        switch (change.klass) {
          case 'noop':
            break;
          case 'keep-local':
            break; // pushed in Step 4
          case 'take-remote':
            await this.takeRemote(change, meta);
            break;
          case 'merge':
            await this.merge(input.root, change, meta, result);
            break;
        }
      }
      await this.records.write(change.folder, meta);
    }
    return result;
  }

  private async takeRemote(change: ColumnChange, meta: RecordMetadata): Promise<void> {
    this.events.emit(AIFY_FILE_WRITTEN, {
      filePath: change.filePath,
    } satisfies AifyFileWrittenPayload);
    await writeFileAtomic(change.filePath, change.remote);
    meta[change.column] = change.remote;
    meta.$hash[change.column] = hashContent(change.remote);
    meta.$conflicts[change.column] = false;
    this.refreshMetaTimestamps(meta, change);
  }

  private async merge(
    root: string,
    change: ColumnChange,
    meta: RecordMetadata,
    result: WriteResult,
  ): Promise<void> {
    const { merged, conflict } = threeWayMerge(change.base, change.local, change.remote);
    this.events.emit(AIFY_FILE_WRITTEN, {
      filePath: change.filePath,
    } satisfies AifyFileWrittenPayload);
    await writeFileAtomic(change.filePath, merged);
    meta.$hash[change.column] = hashContent(merged);
    if (conflict) {
      meta.$conflicts[change.column] = true; // do NOT advance the merge base
      const rel = relative(root, change.filePath);
      result.conflicted.push(rel);
      // eslint-disable-next-line no-console
      console.log(
        `The file "${rel}" has one or more conflicts after merge. Sync was not completed for this file.`,
      );
    } else {
      meta[change.column] = merged;
      meta.$conflicts[change.column] = false;
      this.refreshMetaTimestamps(meta, change);
    }
  }

  private refreshMetaTimestamps(meta: RecordMetadata, change: ColumnChange): void {
    if (change.remoteUpdatedOn) {
      meta.$sys_updated_on = change.remoteUpdatedOn;
    }
    if (change.remoteModCount !== undefined) {
      meta.$sys_mod_count = change.remoteModCount;
    }
  }
}
