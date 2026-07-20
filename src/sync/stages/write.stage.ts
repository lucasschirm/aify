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
 * Returns the merged text and whether any conflicts were found. Edits whose base ranges do not
 * overlap merge cleanly; edits whose base ranges overlap produce git-style
 * `<<<<<<< HEAD` / `=======` / `>>>>>>> New-HEAD` markers (OS-26). Never silently merges
 * overlapping edits.
 */
export function threeWayMerge(
  base: string,
  local: string,
  remote: string,
): { merged: string; conflict: boolean } {
  const baseLines = base.split('\n');
  const localHunks = structuredPatch('', '', base, local, '', '', { context: 0 }).hunks as Hunk[];
  const remoteHunks = structuredPatch('', '', base, remote, '', '', { context: 0 }).hunks as Hunk[];

  const result: string[] = [];
  let conflict = false;
  let bi = 0;
  let li = 0;
  let ri = 0;

  const hunkStart = (h: Hunk): number => h.oldStart - 1;
  const hunkEnd = (h: Hunk): number => h.oldStart - 1 + h.oldLines;

  while (li < localHunks.length || ri < remoteHunks.length) {
    const lh = localHunks[li];
    const rh = remoteHunks[ri];
    const lStart = lh ? hunkStart(lh) : Number.POSITIVE_INFINITY;
    const lEnd = lh ? hunkEnd(lh) : Number.POSITIVE_INFINITY;
    const rStart = rh ? hunkStart(rh) : Number.POSITIVE_INFINITY;
    const rEnd = rh ? hunkEnd(rh) : Number.POSITIVE_INFINITY;

    if (lh && (!rh || lEnd <= rStart)) {
      // Local hunk lies entirely before the next remote hunk — no overlap.
      copyBase(bi, lStart);
      applyAdded(lh);
      bi = lEnd;
      li++;
    } else if (rh && (!lh || rEnd <= lStart)) {
      // Remote hunk lies entirely before the next local hunk — no overlap.
      copyBase(bi, rStart);
      applyAdded(rh);
      bi = rEnd;
      ri++;
    } else {
      // Overlapping base ranges → conflict region. Grow it to swallow every consecutive hunk
      // (from either side) that touches the region.
      const regionStart = Math.min(lStart, rStart);
      let regionEnd = Math.max(lEnd, rEnd);
      const lRegion: Hunk[] = [];
      const rRegion: Hunk[] = [];
      for (;;) {
        let grew = false;
        if (li < localHunks.length && hunkStart(localHunks[li]) < regionEnd) {
          const h = localHunks[li++];
          lRegion.push(h);
          regionEnd = Math.max(regionEnd, hunkEnd(h));
          grew = true;
        }
        if (ri < remoteHunks.length && hunkStart(remoteHunks[ri]) < regionEnd) {
          const h = remoteHunks[ri++];
          rRegion.push(h);
          regionEnd = Math.max(regionEnd, hunkEnd(h));
          grew = true;
        }
        if (!grew) break;
      }
      copyBase(bi, regionStart);
      const localBlock = projectRegion(lRegion, regionStart, regionEnd);
      const remoteBlock = projectRegion(rRegion, regionStart, regionEnd);
      if (localBlock.join('\n') === remoteBlock.join('\n')) {
        result.push(...localBlock);
      } else {
        conflict = true;
        result.push('<<<<<<< HEAD', ...localBlock, '=======', ...remoteBlock, '>>>>>>> New-HEAD');
      }
      bi = regionEnd;
    }
  }
  copyBase(bi, baseLines.length);

  return { merged: result.join('\n'), conflict };

  /** Copy base lines [from, to) into result. */
  function copyBase(from: number, to: number): void {
    for (let i = from; i < to; i++) result.push(baseLines[i]);
  }

  /** Append a hunk's added lines (skip removed/context). */
  function applyAdded(hunk: Hunk): void {
    for (const line of hunk.lines) if (line.startsWith('+')) result.push(line.slice(1));
  }

  /** Reconstruct one side's version of base[rs, re) by applying that side's hunks. */
  function projectRegion(hunks: Hunk[], rs: number, re: number): string[] {
    const out: string[] = [];
    let i = rs;
    for (const h of hunks) {
      const hs = hunkStart(h);
      const he = hunkEnd(h);
      for (let k = i; k < hs; k++) out.push(baseLines[k]);
      for (const line of h.lines) if (line.startsWith('+')) out.push(line.slice(1));
      i = he;
    }
    for (let k = i; k < re; k++) out.push(baseLines[k]);
    return out;
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
      meta.$conflicts[change.column] = true;
      // Pin the merge base to the conflict-time remote the user is resolving against. Once the user
      // clears the markers, the next sync compares the resolution against this base: an unchanged
      // remote classifies as `keep-local` (push), while a remote that changed again re-merges
      // (base = this remote, local = resolution, remote = newer). This is what lets a resolved
      // conflict reach the instance instead of re-generating the same markers forever.
      meta[change.column] = change.remote;
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
