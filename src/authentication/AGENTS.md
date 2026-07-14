# authentication

Manages ServiceNow connection credentials for the `aify auth` command group.

Passwords are stored only in the OS keychain via `keytar` (OS-17); the database `auth`
table holds metadata only.

## Files

| File | Purpose |
|------|---------|
| `credential-store.service.ts` | `CredentialStore` — keytar wrapper (service name `aify`, account = alias): `setPassword` / `getPassword` / `deletePassword`. |
| `credential-store.service.spec.ts` | Unit tests; `keytar` is mocked with `vi.mock('keytar')` — never touches a real keychain. |

## Testing notes

- `keytar` is always mocked in tests.
- Add new files and their purpose to this table as the module grows.
