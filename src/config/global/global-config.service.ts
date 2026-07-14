/**
 * @file global-config.service.ts
 * Owns the global aify folder (~/.aify): creates and seeds it from the packaged
 * templates/ directory, exposes canonical paths (db, track_tables), and appends
 * per-day plain-text log lines (OS-19). Paths resolve via os.homedir() (never "~").
 */
import { Injectable } from '@nestjs/common';
import { constants as fsConstants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

@Injectable()
export class GlobalConfigService {
  /** Directory holding the shipped template_db.sqlite3 (packaged with the CLI). */
  private readonly templatesDir: string;

  constructor(templatesDir?: string) {
    // Compiled to dist/config/global/; templates/ ships at the package root.
    this.templatesDir = templatesDir ?? path.join(__dirname, '..', '..', '..', 'templates');
  }

  /** Absolute path to ~/.aify (resolved fresh so tests can relocate HOME). */
  private globalDir(): string {
    return path.join(os.homedir(), '.aify');
  }

  /** ~/.aify/logs */
  private logsDir(): string {
    return path.join(this.globalDir(), 'logs');
  }

  dbPath(): string {
    return path.join(this.globalDir(), 'aifydb.sqlite3');
  }

  trackTablesPath(): string {
    return path.join(this.globalDir(), 'track_tables.json');
  }

  /**
   * Create and seed ~/.aify on first use. Idempotent + atomic: mkdir is recursive
   * (no-op if present); the template DB is copied with COPYFILE_EXCL so an existing
   * aifydb.sqlite3 is never clobbered. Returns the global dir path.
   */
  async ensureGlobalDir(): Promise<string> {
    const dir = this.globalDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(this.logsDir(), { recursive: true });
    await this.seedDb();
    return dir;
  }

  /** Copy templates/template_db.sqlite3 → ~/.aify/aifydb.sqlite3 without clobbering. */
  private async seedDb(): Promise<void> {
    const src = path.join(this.templatesDir, 'template_db.sqlite3');
    const dest = this.dbPath();
    try {
      await fs.copyFile(src, dest, fsConstants.COPYFILE_EXCL);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Destination already exists → keep it (no-clobber, idempotent).
    }
  }

  /**
   * Append a message as a line to ~/.aify/logs/<YYYY-MM-DD>.log (plain text,
   * one file per day) (OS-19). Creates the logs directory if needed.
   */
  async log(message: string): Promise<void> {
    await fs.mkdir(this.logsDir(), { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(this.logsDir(), `${day}.log`);
    await fs.appendFile(file, `${message}\n`, 'utf8');
  }
}
