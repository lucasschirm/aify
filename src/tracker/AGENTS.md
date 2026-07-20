# src/tracker/

The tracker subsystem configures which ServiceNow tables and columns `aify` tracks during `aify sync`,
and defines how each column type maps to a local file format (file name template, extension, and behavior).

## Services

| File | Purpose |
|------|---------|
| `tracker-target.service.ts` | Resolves whether a tracker operation targets the global configuration or a project-specific one. Handles the decision: if `--global` is set, use global; if in a project, use project; otherwise prompt the user. |
| `tracker-type.service.ts` | Handles interactive column type configuration. Prompts for type name, file name template, extension, and behavior, then persists to the resolved target (global or project). |
| `tracker.service.ts` | Handles `tracker add` — prompts for table name and fetches schema, preselects already-tracked columns with package-tracked columns disabled (read-only), allows toggling column selection, confirms before removing unchecked columns from their source layer (project or global), and persists only newly-added columns after ensuring their types are configured. |

## Commands

| File | Purpose |
|------|---------|
| `tracker.command.ts` | Parent `aify tracker` command group. Running without a subcommand prints help. |
| `tracker-tables.command.ts` | Parent `aify tracker tables` command group. Running without a subcommand prints help. |
| `tracker-tables-add.command.ts` | Subcommand `aify tracker tables add` — Track a new table and its columns. Delegates to `TrackerService.add`. |
| `tracker-types.command.ts` | Parent `aify tracker types` command group. Running without a subcommand prints help. |
| `tracker-types-add.command.ts` | Subcommand `aify tracker types add` — Configure a new column type. Supports `--global` (global config) and `--table` (select from schema). Delegates to `TrackerTypeService.addType`. |

## Module

| File | Purpose |
|------|---------|
| `tracker.module.ts` | NestJS module wiring the tracker services and commands. Imports `ApiModule`, `ConfigModule`, and `AuthenticationModule`. |

## Tests

| File | Purpose |
|------|---------|
| `tracker-target.service.spec.ts` | Unit tests for `TrackerTargetService`: `--global` flag, project root detection, confirmation prompt, and null handling. |
| `tracker-type.service.spec.ts` | Unit tests for `TrackerTypeService`: prompt sequences, schema selection, project vs. global persistence. |
| `tracker.service.spec.ts` | Unit tests for `TrackerService`: table tracking, column selection, missing type resolution, and persistence. |
| `commands/tracker.command.spec.ts` | Unit tests for parent `TrackerCommand`: verifies help is called when run with no subcommand. |
| `commands/tracker-tables.command.spec.ts` | Unit tests for parent `TrackerTablesCommand`: verifies help is called when run with no subcommand. |
| `commands/tracker-tables-add.command.spec.ts` | Unit tests for `TrackerTablesAddCommand`: delegation to `TrackerService.add`, null-target short-circuit. |
| `commands/tracker-types.command.spec.ts` | Unit tests for parent `TrackerTypesCommand`: verifies help is called when run with no subcommand. |
| `commands/tracker-types-add.command.spec.ts` | Unit tests for `TrackerTypesAddCommand`: delegation to `TrackerTypeService.addType`, null-target short-circuit. |
