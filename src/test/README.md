# `src/test/` — E2E Command Tests

End-to-end command tests for the `aify` CLI. Each spec boots a real
nest-commander application via [`CommandTestFactory`](https://nest-commander.jaymcdoniel.dev/docs/testing/installation)
from `nest-commander-testing` and invokes a command exactly as the user would,
then asserts on the captured stdout/stderr.

These are **command-level E2E** tests: the full NestJS DI graph for a command
module is wired up and commander parses real argv. They are *not* unit tests
(services are not mocked unless they touch the outside world) and *not* full
process E2E (we do not spawn `dist/main.js`).

---

## Setup

`nest-commander-testing` is a devDependency. It reuses `@nestjs/testing` under
the hood and exposes a `CommandTestFactory` with three static methods:

| Method | Purpose |
|--------|---------|
| `createTestingCommand(metadata, options?)` | Returns a `TestingModuleBuilder` (chain `.overrideProvider(...).useValue(...)` then `.compile()`). |
| `run(app, args?)` | Runs the command and **closes** the app afterwards. |
| `runWithoutClosing(app, args?)` | Runs the command and returns the still-open app — use when you need to query the DB *after* the command finishes. |

---

## Hermeticity rules

Every E2E spec MUST stay hermetic — no real network, no real keychain, no writes
to `~/.aify`. Override the providers that touch the outside world:

| Provider | Override with |
|----------|---------------|
| `CredentialStore` | `vi.fn` mock (`setPassword` / `getPassword` / `deletePassword`). |
| `TableApiClient` | `vi.fn` mock (`test` / `list` / `getOne` / `patch`). |
| `Sequelize` | `DatabaseModule.forRoot(':memory:')` — provides a global in-memory SQLite. |

Do **not** import the root `AppModule` directly — it constructs
`GlobalConfigService` and touches `~/.aify`. Import the specific domain module
(e.g. `AuthenticationModule`) alongside `DatabaseModule.forRoot(':memory:')`
and override its external dependencies.

---

## Capturing commander output

Commander does **not** use `console.log`. Two important behaviors to handle:

1. **Help and error text are written via `process.stdout.write` / `process.stderr.write`**
   (commander's configured `writeOut` / `writeErr`). Spy on those, not
   `console.log`.
2. **`help()` calls `process.exit(0)` after writing.** Stub `process.exit` in
   `beforeEach` and restore it in `afterEach` so the test process is not killed.
   The thrown error is swallowed by commander's internal
   `.catch(serviceErrorHandler)` (which writes to stderr), so `run()` resolves
   normally rather than rejecting — spy `process.stderr.write` to keep the test
   output clean.

---

## Recipe

```ts
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
    // 1. Stub process.exit — commander's help() calls it after writing.
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {
        throw new Error('process.exit called');
      }) as (code?: string | number | null) => never);

    // 2. Spy on stdout/stderr — commander writes there, not console.log.
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    // 3. Mock the providers that touch the outside world.
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

    // 4. Compile the command module with overrides.
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

  it('prints help with the group description and all subcommands', async () => {
    await CommandTestFactory.run(commandInstance, ['auth']);

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');

    expect(output).toContain('Manage ServiceNow connections.');
    expect(output).toContain('add');
    expect(output).toContain('list');
  });
});
```

---

## Output assertion patterns

### Exact match (single `console.log` call)

When a command prints exactly one line via `console.log`:

```ts
it('logs a success message', async () => {
  await CommandTestFactory.run(commandInstance, ['auth', 'add', '--alias', 'prod']);

  expect(logSpy).toHaveBeenCalledWith('Connection "prod" saved and set as current.');
});
```

### Exact match (commander help / multi-write)

Commander help is written in chunks via `process.stdout.write`. Reassemble the
calls before asserting:

```ts
const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
expect(output).toBe(expectedHelpString);
```

### Substring match

```ts
expect(output).toContain('Manage ServiceNow connections.');
```

### Regex match

```ts
expect(output).toMatch(/Usage: aify auth <command>/);
```

### Partial match with `expect.stringContaining`

```ts
expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Connection'));
```

### Asserting stderr (errors)

```ts
it('writes an auth failure to stderr', async () => {
  tableApi.test.mockRejectedValueOnce(new Error('Unauthorized'));
  await CommandTestFactory.run(commandInstance, ['auth', 'add', '--alias', 'prod']);

  const errOutput = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
  expect(errOutput).toContain('Authentication failed');
});
```

### Asserting nothing was printed

```ts
expect(stdoutSpy).not.toHaveBeenCalled();
expect(logSpy).not.toHaveBeenCalled();
```

---

## Passing flags and arguments

`CommandTestFactory.run(app, args)` takes an argv-style array. The first entry
is the command name; subsequent entries are positional args and flags, one per
array slot (exactly as the user would type them, but split on whitespace):

```ts
// aify auth add --alias prod --instance acme.service-now.com --username admin
await CommandTestFactory.run(commandInstance, [
  'auth',
  'add',
  '--alias', 'prod',
  '--instance', 'acme.service-now.com',
  '--username', 'admin',
  '--force',
]);
```

---

## Mocking inquirer prompts

If a command uses `PromptService` (the `@inquirer/prompts` wrapper), either
override `PromptService` with a mock or use `CommandTestFactory.setAnswers` to
feed answers to the built-in inquirer mock:

```ts
// Option A: override PromptService directly (preferred in this repo).
const prompt = {
  input: vi.fn().mockResolvedValue('prod'),
  password: vi.fn().mockResolvedValue('s3cret'),
  confirm: vi.fn().mockResolvedValue(true),
  select: vi.fn().mockResolvedValue('prod'),
};
// ... .overrideProvider(PromptService).useValue(prompt) ...

// Option B: use the built-in inquirer mock.
CommandTestFactory.setAnswers(['prod', 'acme.service-now.com', 'admin', 's3cret']);
```

This repo prefers Option A because `PromptService` is already an injectable
wrapper — overriding it keeps the test explicit about which prompts are
expected.

---

## Querying the DB after the command runs

`CommandTestFactory.run` closes the app when it finishes. To inspect the
database (or any provider state) *after* the command, use
`runWithoutClosing` and close the app yourself:

```ts
it('persists the auth row', async () => {
  const app = await CommandTestFactory.runWithoutClosing(commandInstance, [
    'auth', 'add', '--alias', 'prod', /* ... */
  ]);

  const authCount = await app.get(Sequelize).model('auth').count();
  expect(authCount).toBe(1);

  await app.close();
});
```

---

## Files

| File | Purpose |
|------|---------|
| `auth.e2e.spec.ts` | E2E for the `aify auth` group — runs `auth` with no subcommand and asserts the help output contains the description and all registered subcommands. |
| `sync.e2e.spec.ts` | E2E for `aify sync` — runs the REAL `TableApiClient` against a `nock`-mocked ServiceNow instance (only `CredentialStore`, `PromptService`, `SpinnerService` are overridden). Covers first-pull create, incremental take-remote, local-edit push, merge conflicts, `Link` pagination, `sys_metadata_delete` deletion, `--force-pull`, `--force-push`, and the empty-scopes error path. |

Add new files and their purpose to this table as the suite grows.
