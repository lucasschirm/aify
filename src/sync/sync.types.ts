/**
 * @file sync.types.ts
 * @description Shared types for the sync subsystem. `SyncOptions` controls a single sync
 * run; `ConflictClass` and `ColumnChange` describe conflicts detected between local and
 * remote metadata. `Prompter` is the interface `SyncService` uses for interactive prompts.
 */

export interface SyncOptions {
  /** Restrict the sync to a single scope (default: all tracked scopes). */
  scope?: string;
  /** Skip conflict checks and overwrite local files. */
  force?: boolean;
  /** Run once and exit (default); when false, enters hot mode (watch + poll). */
  once?: boolean;
}

export type ConflictClass = 'local-newer' | 'remote-newer' | 'both-changed';

export interface ColumnChange {
  table: string;
  sysId: string;
  column: string;
  folder: string;
  filePath: string;
  remoteSysUpdatedOn: string;
  remoteSysModCount: number;
  conflictClass: ConflictClass;
}

/** Interface for interactive prompts used by SyncService. */
export interface Prompter {
  confirm(message: string): Promise<boolean>;
  select<T>(message: string, choices: { name: string; value: T }[]): Promise<T>;
}

/** Symbol token for Prompter DI. */
export const PROMPTER = Symbol('PROMPTER');
