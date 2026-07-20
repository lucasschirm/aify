# Application Module

This module contains the business logic for tracking ServiceNow scoped applications locally via the `aify app` command group.

## Files

### Services
- **application.service.ts** — Core service for initializing (tracking) applications. Queries `sys_scope` on the instance by scope or sys_id, scaffolds the local `${scope}/sys_package.json` directory, adds the scope to `.aify.config.json`, and creates/updates an `Application` row in the database.

### Commands
- **commands/app-init.command.ts** — Parent `AppCommand` (with `@Command`) that groups all app subcommands, plus `AppInitCommand` (@SubCommand `init`), which resolves the project root, delegates to `ApplicationService.init`, and optionally prompts the user to run sync. Includes `--yes` flag for non-interactive mode.
- **commands/app-list.command.ts** — `AppListCommand` (@SubCommand `list`) that displays all tracked applications and their last sync time as a formatted table. Queries local Application rows by scope and renders via the pure `renderAppList` function.

### Module
- **application.module.ts** — NestJS module that imports `AuthenticationModule`, `ConfigModule`, `DatabaseModule`, `SyncModule`, and provides `ApplicationService`, `AppCommand`, `AppInitCommand`, `AppListCommand`.

## Tests

### Unit Tests
- **application.service.spec.ts** — Tests `ApplicationService.init` for success (scaffolding, config update, row insert), not-found (instance query returns empty), and no-connection (auth.current returns null) cases. Uses in-memory SQLite via `bootstrapTestDb`.
- **commands/app-list.command.spec.ts** — Tests the pure `renderAppList` function (with dates and nulls) and the `AppListCommand` via test module (project not found vs. in project with rows). Spies on `Application.findOne`.
- **commands/app-init.command.spec.ts** — Tests `AppInitCommand.run` with no param (usage error), `--yes` flag (no prompt), and confirm prompt flows. Spies on `console.log` and `console.error`.

### E2E Tests
- **../test/app.e2e.spec.ts** — Command-level e2e via `CommandTestFactory` (ApplicationModule + in-memory DB, temp cwd/HOME). Verifies `app list` outputs applications and last-sync times; asserts "Not in an aify project" when no config exists and proper table rendering with multiple rows.
