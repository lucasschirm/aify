/**
 * @file project-config.service.spec.ts
 * Tests for ProjectConfigService — bounded parent walk, config CRUD, scopes, auth-failure counter.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectConfigService } from './project-config.service';

describe('ProjectConfigService', () => {
  let base: string; // temp root; home is a subdir so we can test "above home"
  let home: string;
  let originalHome: string | undefined;
  let service: ProjectConfigService;

  beforeEach(async () => {
    base = await mkdtemp(path.join(tmpdir(), 'aify-proj-'));
    home = path.join(base, 'home');
    await mkdir(home, { recursive: true });
    originalHome = process.env.HOME;
    process.env.HOME = home;
    service = new ProjectConfigService();
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(base, { recursive: true, force: true });
  });

  it('finds .aify.config.json in a parent directory', async () => {
    const root = path.join(home, 'workspace', 'app');
    const deep = path.join(root, 'src', 'nested');
    await mkdir(deep, { recursive: true });
    await writeFile(path.join(root, '.aify.config.json'), '{}');
    expect(await service.findProjectRoot(deep)).toBe(root);
  });

  it('stops at the home directory and does not search above it', async () => {
    // Config sits ABOVE home (in base); the bounded walk must never reach it.
    await writeFile(path.join(base, '.aify.config.json'), '{}');
    const start = path.join(home, 'a', 'b');
    await mkdir(start, { recursive: true });
    expect(await service.findProjectRoot(start)).toBeNull();
  });

  it('creates an empty config at cwd when none exists (ensureProjectRoot)', async () => {
    const dir = path.join(home, 'fresh');
    await mkdir(dir, { recursive: true });
    const root = await service.ensureProjectRoot(dir);
    expect(root).toBe(dir);
    const written = JSON.parse(await readFile(path.join(dir, '.aify.config.json'), 'utf8'));
    expect(written).toEqual({});
  });

  it('adds a scope and does not duplicate it', async () => {
    const dir = path.join(home, 'scoped');
    await mkdir(dir, { recursive: true });
    await service.ensureProjectRoot(dir);
    await service.addScope(dir, { sysId: 'abc', scope: 'my_scope' });
    await service.addScope(dir, { sysId: 'abc', scope: 'my_scope' }); // dedupe by sysId
    const config = await service.read(dir);
    expect(config.project?.scopes).toEqual([{ sysId: 'abc', scope: 'my_scope' }]);
  });

  it('increments and resets the auth-failure counter', async () => {
    const dir = path.join(home, 'auth');
    await mkdir(dir, { recursive: true });
    await service.ensureProjectRoot(dir);
    expect(await service.incrementAuthFailures(dir)).toBe(1);
    expect(await service.incrementAuthFailures(dir)).toBe(2);
    await service.resetAuthFailures(dir);
    const config = await service.read(dir);
    expect(config.auth?.failedAttempts).toBe(0);
  });
});

async function mkdtemp(prefix: string): Promise<string> {
  const { randomBytes } = await import('node:crypto');
  const tmp = path.join(tmpdir(), randomBytes(6).toString('hex'));
  await mkdir(tmp, { recursive: true });
  return tmp;
}
