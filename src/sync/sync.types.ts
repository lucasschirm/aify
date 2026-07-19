/**
 * @file sync.types.ts
 * @description Shared types for the sync subsystem. `SyncOptions` controls a single sync run;
 * `ConflictClass` and `ColumnChange` describe conflicts detected between local and remote metadata.
 */

/** Options for `aify sync` and `aify app sync`. */
export interface SyncOptions {
  /** Restrict the sync to a single tracked scope. */
  scope?: string;
  /** Keep running after the initial sync: watch files and poll the instance. */
  hot?: boolean;
  /** Pull everything from the instance, overwriting local changes. */
  forcePull?: boolean;
  /** Push local changes to the instance, overwriting remote changes. */
  forcePush?: boolean;
  /** Skip interactive confirmations (non-interactive mode). */
  yes?: boolean;
}

/** Decision a `WriteStage` makes for one changed column. */
export type ConflictClass = 'noop' | 'take-remote' | 'keep-local' | 'merge';

/** One tracked column that changed locally, remotely, or both. */
export interface ColumnChange {
  sysId: string;
  table: string;
  column: string;
  localChanged: boolean;
  remoteChanged: boolean;
  klass: ConflictClass;
  base: string;
  local: string;
  remote: string;
  folder: string;
  filePath: string;
  /** Remote `$sys_updated_on` — used by WriteStage to refresh record metadata. */
  remoteUpdatedOn?: string;
  /** Remote `$sys_mod_count` — used by WriteStage to refresh record metadata. */
  remoteModCount?: number;
}
