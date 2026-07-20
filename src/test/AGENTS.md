# src/test/

End-to-end (E2E) command tests for the `aify` CLI. Each spec boots a real
nest-commander application via `CommandTestFactory` from `nest-commander-testing`
and invokes a command exactly as the user would, then asserts on the captured
stdout/stderr.

## Scope

These are **command-level E2E** tests: the full NestJS DI graph for a command
module is wired up and commander parses real argv. They are *not* unit tests
(services are not mocked unless they touch the outside world) and *not* full
process E2E (we do not spawn `dist/main.js`).

## Hermeticity rules

Every E2E spec MUST stay hermetic — no real network, no real keychain, no writes
to `~/.aify`. Override the providers that touch the outside world:

| Provider | Override with |
|----------|---------------|
| `CredentialStore` | `vi.fn` mock (`setPassword`/`getPassword`/`deletePassword`). |
| `TableApiClient` | `vi.fn` mock (`test`/`list`/`getOne`/`patch`). |
| `Sequelize` | in-memory instance from `bootstrapTestDb([Instance, Auth, Application])` in `src/testing/sqlite-test.helper.ts`. |

Do **not** import the root `AppModule` directly — it constructs
`GlobalConfigService` and touches `~/.aify`. Import the specific domain module
(e.g. `AuthenticationModule`) and override its external dependencies.

## Commander output capture

Commander writes help via `process.stdout.write` (its configured `writeOut`),
**not** `console.log`. To assert on help/error output, spy on
`process.stdout.write` (and `process.stderr.write` for errors). Commander's
`help()` also calls `process.exit(0)` after writing — stub `process.exit` in
`beforeEach` and restore it in `afterEach` so the test process is not killed.

## Files

| File | Purpose |
|------|---------|
| `auth.e2e.spec.ts` | E2E for the `aify auth` group — runs `auth` with no subcommand and asserts the help output contains the description and all registered subcommands. |
| `sync.e2e.spec.ts` | E2E for `aify sync` — real `TableApiClient` against a `nock`-mocked instance; covers pull/push/conflict/pagination/delete/force flags. |
| `sync.hot.e2e.spec.ts` | E2E for `aify sync --hot` — real chokidar `WatcherService` + real `EventEmitter2`; covers watch→push, poll→pull, self-write suppression, ignored files, scope-limited watching, `--force-pull` poll-only, poll error-resilience, and shutdown. |

## Notes

- `CommandTestFactory.run` calls `app.close()` after the command finishes. For
  tests that need to query the DB *after* the command runs, use
  `CommandTestFactory.runWithoutClosing` and close the app explicitly in
  `afterEach`.
- Add new files and their purpose to the table above as the suite grows.
