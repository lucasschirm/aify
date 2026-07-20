/**
 * @file app.e2e.spec.ts
 * @description E2E test for the `aify app list` command. Boots the real nest-commander
 *   application via `CommandTestFactory`, runs `app list` against seeded Application rows,
 *   and asserts the help and list outputs contain the expected data.
 *
 *   Hermeticity: `CredentialStore` and `PromptService` are mocked; `DatabaseModule.forRoot(':memory:')`
 *   provides an in-memory SQLite so no `~/.aify/aifydb.sqlite3` is opened. `process.exit` is stubbed
 *   because commander's `help()` calls `process.exit(0)` after writing; `process.stdout.write` is spied
 *   because commander writes help directly to stdout (not via `console.log`). HOME and cwd are
 *   relocated to temp directories so config file walks never touch the real machine.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { TestingModule } from '@nestjs/testing';
import { CommandTestFactory } from 'nest-commander-testing';
import { Sequelize } from 'sequelize-typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationModule } from '../application/application.module';
import { CredentialStore } from '../authentication/credential-store.service';
import { PromptService } from '../authentication/prompt.service';
import { DatabaseModule } from '../database/database.module';
import { Application } from '../database/models/application.model';

describe('app command (E2E)', () => {
  let projectRoot: string;
  let homeRoot: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let commandInstance: TestingModule;
  let sequelize: Sequelize;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  async function writeProjectConfig(scopes: { sysId: string; scope: string }[]): Promise<void> {
    await writeFile(
      join(projectRoot, '.aify.config.json'),
      JSON.stringify({ project: { scopes } }, null, 2),
    );
  }

  function stdoutOutput(): string {
    const stdoutPart = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    const logPart = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    return stdoutPart + logPart;
  }

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalHome = process.env.HOME;

    projectRoot = await mkdtemp(join(tmpdir(), 'aify-app-e2e-'));
    homeRoot = await mkdtemp(join(tmpdir(), 'aify-home-e2e-'));

    process.chdir(projectRoot);
    process.env.HOME = homeRoot;

    // Stub process.exit to prevent the test process from terminating.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null) => never);

    // Spy on process.stdout.write, process.stderr.write, and console.log for output capture.
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const credentials = {
      setPassword: vi.fn().mockResolvedValue(undefined),
      getPassword: vi.fn().mockResolvedValue(null),
      deletePassword: vi.fn().mockResolvedValue(undefined),
    };

    const promptService = {
      confirm: vi.fn().mockResolvedValue(true),
      awaitKeypress: vi.fn().mockResolvedValue(true),
      input: vi.fn(),
      password: vi.fn(),
      select: vi.fn(),
    };

    commandInstance = await CommandTestFactory.createTestingCommand({
      imports: [
        EventEmitterModule.forRoot(),
        DatabaseModule.forRoot(':memory:'),
        ApplicationModule,
      ],
    })
      .overrideProvider(CredentialStore)
      .useValue(credentials as unknown as CredentialStore)
      .overrideProvider(PromptService)
      .useValue(promptService as unknown as PromptService)
      .compile();

    // Initialize to ensure DatabaseModule's onModuleInit runs
    await commandInstance.init();
    sequelize = commandInstance.get(Sequelize);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    logSpy.mockRestore();
    exitSpy.mockRestore();
    if (sequelize) await sequelize.close();
    try {
      await rm(projectRoot, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
    try {
      await rm(homeRoot, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('prints "Not in an aify project" when cwd is not an aify project', async () => {
    await CommandTestFactory.run(commandInstance, ['app', 'list']);

    const output = stdoutOutput();
    expect(output).toContain('Not in an aify project');
  });

  it('lists tracked applications with their last sync times', async () => {
    // Create a project config with one scope
    await writeProjectConfig([{ sysId: 'scope-id-1', scope: 'x_acme_app' }]);

    // Seed an Application row
    const syncTime = new Date('2024-01-15T10:30:00Z');
    await Application.create({
      scope: 'x_acme_app',
      sysId: 'scope-id-1',
      displayValue: 'Acme Application',
      lastSyncedAt: syncTime,
    });

    await CommandTestFactory.run(commandInstance, ['app', 'list']);

    const output = stdoutOutput();
    expect(output).toContain('x_acme_app');
    expect(output).toContain('Acme Application');
    expect(output).toContain('2024-01-15T10:30:00.000Z');
  });

  it('shows "never" for applications that have never been synced', async () => {
    // Create a project config with one scope
    await writeProjectConfig([{ sysId: 'scope-id-1', scope: 'x_test_app' }]);

    // Seed an Application row with no lastSyncedAt
    await Application.create({
      scope: 'x_test_app',
      sysId: 'scope-id-1',
      displayValue: 'Test Application',
      lastSyncedAt: null,
    });

    await CommandTestFactory.run(commandInstance, ['app', 'list']);

    const output = stdoutOutput();
    expect(output).toContain('x_test_app');
    expect(output).toContain('Test Application');
    expect(output).toContain('never');
  });

  it('shows multiple tracked applications', async () => {
    // Create a project config with two scopes
    await writeProjectConfig([
      { sysId: 'scope-id-1', scope: 'x_acme_app' },
      { sysId: 'scope-id-2', scope: 'x_test_app' },
    ]);

    // Seed two Application rows
    const syncTime1 = new Date('2024-01-15T10:30:00Z');
    const syncTime2 = new Date('2024-01-16T14:45:00Z');
    await Application.create({
      scope: 'x_acme_app',
      sysId: 'scope-id-1',
      displayValue: 'Acme Application',
      lastSyncedAt: syncTime1,
    });
    await Application.create({
      scope: 'x_test_app',
      sysId: 'scope-id-2',
      displayValue: 'Test Application',
      lastSyncedAt: syncTime2,
    });

    await CommandTestFactory.run(commandInstance, ['app', 'list']);

    const output = stdoutOutput();
    expect(output).toContain('x_acme_app');
    expect(output).toContain('Acme Application');
    expect(output).toContain('2024-01-15T10:30:00.000Z');
    expect(output).toContain('x_test_app');
    expect(output).toContain('Test Application');
    expect(output).toContain('2024-01-16T14:45:00.000Z');
  });
});
