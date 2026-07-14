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
  `incrementAuthFailures`/`resetAuthFailures` manage `auth.failedAttempts`.
- `project-config.service.spec.ts` — Vitest spec. Uses temp dirs with `process.env.HOME` set so
  the parent walk finds a config in a parent yet stops at home; covers create-if-missing,
  addScope dedupe, and the failure counter.

## Notes
- aify makes **no** `.gitignore` changes and never prompts about it (OS-10).
