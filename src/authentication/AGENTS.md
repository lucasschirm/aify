# authentication

Manages ServiceNow connection credentials for the `aify auth` command group.

Passwords are stored only in the OS keychain via `keytar` (OS-17); the database `auth`
table holds metadata only.

## Files

| File | Purpose |
|------|---------|
| `credential-store.service.ts` | `CredentialStore` — keytar wrapper (service name `aify`, account = alias): `setPassword` / `getPassword` / `deletePassword`. |
| `credential-store.service.spec.ts` | Unit tests; `keytar` is mocked with `vi.mock('keytar')` — never touches a real keychain. |
| `auth.service.ts` | `AuthService` (add/testConnection/current) + `AuthInput` + `parseInstance`. Tests connection before persisting; passwords go to keytar. |
| `auth.service.spec.ts` | Tests AuthService with in-memory SQLite, mocked TableApiClient and CredentialStore. |
| `authentication.module.ts` | NestJS module wiring the services and `auth` commands. |
| `authentication.module.spec.ts` | Module compilation smoke test. |
| `prompt.service.ts` | `PromptService` — injectable, mockable wrapper over `@inquirer/prompts` (input/password/confirm/select). |
| `commands/auth.command.ts` | Parent `aify auth` group (subcommands registered here). |
| `commands/auth-add.command.ts` | `aify auth add` — masked password prompt, no `--password` flag. |
| `commands/auth-add.command.spec.ts` | Tests AuthAddCommand with mocked AuthService and PromptService. |
| `commands/auth-list.command.ts` | `aify auth list` — prints saved connections as a formatted cli-table3 table with columns `is_current, alias, instance, username, last_used`. Exports the pure `renderAuthList(rows)` renderer + `AuthListRow` for unit testing. |
| `commands/auth-list.command.spec.ts` | Tests `renderAuthList` (exact cli-table3 output, empty-state row spanning all columns) and `AuthListCommand` (maps `AuthService.list` rows to presentation rows and prints the table) with a mocked AuthService via `@nestjs/testing`. |

## Testing notes

- `keytar` is always mocked in tests.
- `TableApiClient` and `CredentialStore` are mocked in auth service tests.
- Add new files and their purpose to this table as the module grows.
