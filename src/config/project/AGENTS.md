# config/project

Project marker file (`.aify.config.json`) lifecycle and mutations.

## Files
- `project-config.types.ts` — `AifyProjectConfig`, the full `.aify.config.json` schema
  (`hot`, `project.scopes`, `tables`, `column_types`, `network.retry`/`network.errorMessage`,
  `auth.failedAttempts`). Leaf types (`TrackedTable`/`ColumnType`/`RetryPolicy`) are imported
  type-only from their canonical modules.
- `project-config.service.ts` — `ProjectConfigService`. `findProjectRoot()` walks up from a
  start dir for `.aify.config.json`, stopping at the home directory or filesystem root;
  `ensureProjectRoot()` creates an empty `{}` config at cwd if none is found; `read`/`write`
  load/persist the config; `addScope` appends a `{ sysId, scope }` (deduped by `sysId`);
  `incrementAuthFailures`/`resetAuthFailures` manage `auth.failedAttempts`;
  `addColumnType(root, name, def)` and `addTrackedTable(root, table)` upsert and persist
  column types and tables to the project config (uses `upsertColumnType`/`upsertTrackedTable`
  from `../tracked-tables/track-merge`); `removeTrackedColumn(root, tableName, columnName)`
  removes a column and drops the table if empty (uses `removeTrackedColumn` from
  `../tracked-tables/track-merge`).
- `project-config.service.spec.ts` — Vitest spec. Uses temp dirs with `process.env.HOME` set so
  the parent walk finds a config in a parent yet stops at home; covers create-if-missing,
  addScope dedupe, the failure counter, and the new addColumnType/addTrackedTable writers.

## Notes
- aify makes **no** `.gitignore` changes and never prompts about it (OS-10).
