/**
 * @file auth.e2e.spec.ts
 * @description E2E test for the `aify auth` command group. Boots the real
 *   nest-commander application via `CommandTestFactory`, runs `auth` with no
 *   subcommand (which triggers commander's `help()`), and asserts the help
 *   output contains the group description and every registered subcommand.
 *
 *   Hermeticity: `CredentialStore` and `TableApiClient` are mocked so no real
 *   keychain or network is touched; `DatabaseModule.forRoot(':memory:')`
 *   provides an in-memory SQLite so no `~/.aify/aifydb.sqlite3` is opened.
 *   `process.exit` is stubbed because commander's `help()` calls
 *   `process.exit(0)` after writing; `process.stdout.write` is spied because
 *   commander writes help directly to stdout (not via `console.log`).
 */
import type { TestingModule } from '@nestjs/testing';
import { CommandTestFactory } from 'nest-commander-testing';
import { Sequelize } from 'sequelize-typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableApiClient } from '../api/table-api.client';
import { AuthenticationModule } from '../authentication/authentication.module';
import { CredentialStore } from '../authentication/credential-store.service';
import { DatabaseModule } from '../database/database.module';

describe('auth command (E2E)', () => {
  let commandInstance: TestingModule;
  let sequelize: Sequelize;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // Stub process.exit: commander's help() calls process.exit(0) after writing.
    // Without this the test process would terminate. The thrown error is caught
    // by commander's internal .catch(serviceErrorHandler) which writes it to
    // stderr — so the run promise resolves normally, not rejects.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as (code?: string | number | null) => never);

    // Spy on process.stdout.write: commander writes help via its configured
    // writeOut (default process.stdout.write), NOT via console.log.
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    // Suppress the serviceErrorHandler's stderr write for the swallowed exit error.
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const credentials = {
      setPassword: vi.fn().mockResolvedValue(undefined),
      getPassword: vi.fn().mockResolvedValue(null),
      deletePassword: vi.fn().mockResolvedValue(undefined),
    };
    const tableApi = {
      test: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      getOne: vi.fn().mockResolvedValue(undefined),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    // DatabaseModule.forRoot(':memory:') provides a global in-memory Sequelize
    // so DatabaseModule's constructor dependency resolves and no ~/.aify DB is
    // opened. AuthenticationModule imports the bare DatabaseModule; the global
    // forRoot instance satisfies its Sequelize injection.
    commandInstance = await CommandTestFactory.createTestingCommand({
      imports: [DatabaseModule.forRoot(':memory:'), AuthenticationModule],
    })
      .overrideProvider(CredentialStore)
      .useValue(credentials as unknown as CredentialStore)
      .overrideProvider(TableApiClient)
      .useValue(tableApi as unknown as TableApiClient)
      .compile();

    sequelize = commandInstance.get(Sequelize);
  });

  afterEach(async () => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
    if (sequelize) await sequelize.close();
  });

  it('prints help with the group description and all subcommands when run with no subcommand', async () => {
    // `auth` with no subcommand calls `this.command.help()` (see auth.command.ts),
    // which writes the commander help banner to stdout and then calls process.exit(0).
    // The stubbed process.exit throws; commander's internal .catch(serviceErrorHandler)
    // swallows that error (writing it to the mocked stderr), so run() resolves normally.
    await CommandTestFactory.run(commandInstance, ['auth']);

    // Reassemble everything commander wrote to stdout across one or more write calls.
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');

    // The @Command description on the auth group.
    expect(output).toContain('Manage ServiceNow connections.');
    // Every subcommand registered in auth.command.ts.
    expect(output).toContain('add');
    expect(output).toContain('list');
    expect(output).toContain('remove');
    expect(output).toContain('update');
    expect(output).toContain('verify');
  });
});
