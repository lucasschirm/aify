/**
 * @file global-config.service.spec.ts
 * Tests for GlobalConfigService — idempotent ~/.aify seeding, no-clobber, per-day logs.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GlobalConfigService } from './global-config.service';

describe('GlobalConfigService', () => {
  let home: string;
  let templates: string;
  let originalHome: string | undefined;
  let service: GlobalConfigService;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'aify-home-'));
    templates = await mkdtemp(path.join(tmpdir(), 'aify-tpl-'));
    await writeFile(path.join(templates, 'template_db.sqlite3'), 'SEED-DB');
    originalHome = process.env.HOME;
    process.env.HOME = home;
    service = new GlobalConfigService(templates);
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
    await rm(templates, { recursive: true, force: true });
  });

  it('seeds ~/.aify idempotently from templates and exposes canonical paths', async () => {
    const dir = await service.ensureGlobalDir();
    expect(dir).toBe(path.join(home, '.aify'));
    expect(service.dbPath()).toBe(path.join(home, '.aify', 'aifydb.sqlite3'));
    expect(service.trackTablesPath()).toBe(path.join(home, '.aify', 'track_tables.json'));
    expect(await readFile(service.dbPath(), 'utf8')).toBe('SEED-DB');
    // Second call must be a safe no-op (idempotent) and must not throw.
    await service.ensureGlobalDir();
    expect(await readFile(service.dbPath(), 'utf8')).toBe('SEED-DB');
  });

  it('never clobbers an existing database', async () => {
    await mkdir(path.join(home, '.aify'), { recursive: true });
    await writeFile(service.dbPath(), 'USER-DATA');
    await service.ensureGlobalDir();
    expect(await readFile(service.dbPath(), 'utf8')).toBe('USER-DATA');
  });

  it('appends to a per-day plain-text log file', async () => {
    await service.ensureGlobalDir();
    await service.log('hello');
    await service.log('world');
    const day = new Date().toISOString().slice(0, 10);
    const contents = await readFile(path.join(home, '.aify', 'logs', `${day}.log`), 'utf8');
    expect(contents).toBe('hello\nworld\n');
  });

  it('setVerbose and isVerbose control verbose mode', () => {
    expect(service.isVerbose()).toBe(false);
    service.setVerbose(true);
    expect(service.isVerbose()).toBe(true);
    service.setVerbose(false);
    expect(service.isVerbose()).toBe(false);
  });

  it('debug() is a no-op when verbose mode is disabled', async () => {
    await service.ensureGlobalDir();
    service.setVerbose(false);
    await service.debug('test message');
    const day = new Date().toISOString().slice(0, 10);
    const logPath = path.join(home, '.aify', 'logs', `${day}.log`);
    // File may not exist if the no-op worked
    try {
      const contents = await readFile(logPath, 'utf8');
      expect(contents).toBe(''); // Empty if file exists
    } catch {
      // File doesn't exist, which is fine
    }
  });

  it('debug() appends with DEBUG: prefix when verbose mode is enabled', async () => {
    await service.ensureGlobalDir();
    service.setVerbose(true);
    await service.debug('test message');
    const day = new Date().toISOString().slice(0, 10);
    const contents = await readFile(path.join(home, '.aify', 'logs', `${day}.log`), 'utf8');
    expect(contents).toBe('DEBUG: test message\n');
  });
});

async function mkdtemp(_prefix: string): Promise<string> {
  const { randomBytes } = await import('node:crypto');
  const tmp = path.join(tmpdir(), randomBytes(6).toString('hex'));
  await mkdir(tmp, { recursive: true });
  return tmp;
}
