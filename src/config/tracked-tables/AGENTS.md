# config/tracked-tables

Which ServiceNow tables/columns aify tracks, and how their configuration is layered.

## Files
- `tracked-tables.types.ts` — `TrackedColumn`, `TrackedTable`, `ColumnType`, `TrackConfig`, and
  `TrackSource` (type = `'package' | 'global' | 'project'` — the winning layer for a tracked column).
- `default-tables.ts` — `DEFAULT_TABLES` (the shipped default tracked-table set, spec OS-14),
  imported from `../base.json` (generated once from
  `reference_docs/plans/sys_dictionary.csv` by `scripts/build-base-config.ts` — see
  `scripts/AGENTS.md`). Also exports `parseTrackedTableList(content)` for the future
  `tracked_table_list.txt` (rows split by `||`, fields by `|` as `table|column|type`; strips a
  trailing sys_id from the table via `split('_')` → drop last → `join('_')`).
- `track-merge.ts` — Pure upsert and removal helpers: `upsertColumnType(existing, name, def)`
  returns a new record with the column type added/overridden; `upsertTrackedTable(tables, table)`
  returns a new array with the table appended or merged by name (columns merge with
  override-wins on type); `removeTrackedColumn(tables, tableName, columnName)` returns a new
  array with the column removed and the table dropped if empty. No I/O, no mutations.
- `tracked-tables.service.ts` — `TrackedTablesService.getProjectTrackTables(projectRoot)`.
  Deep-merges `DEFAULT_TABLES` → `~/.aify/track_tables.json` (global) → project
  `.aify.config.json` (project wins; nothing lost). Tables merge by name, columns by name,
  `column_types` by spread (OS-15). Also `getColumnSources(projectRoot, tableName)` resolves
  the winning source layer for each column of a table (returns `Map<string, TrackSource>`).
  Injects `GlobalConfigService` (for `trackTablesPath()`) and `ProjectConfigService`.
- `global-track-tables.service.ts` — `GlobalTrackTablesService` injectable service. `read()`
  returns the global `~/.aify/track_tables.json` config (or empty defaults if missing);
  `addColumnType(name, def)` and `addTrackedTable(table)` upsert and persist;
  `removeTrackedColumn(tableName, columnName)` removes and persists. Injects
  `GlobalConfigService` for path and directory creation.
- `default-tables.spec.ts` / `tracked-tables.service.spec.ts` / `track-merge.spec.ts` /
  `global-track-tables.service.spec.ts` — Vitest specs covering the sys_id-stripping parser,
  the CSV-derived default (42 tables, 8 `column_types`), deep-merge behavior, pure merge and
  removal utilities, column source resolution, and global track_tables.json read/write.

## Notes
- `../base.json` is the shipped default per OS-14. It carries **one `column_types` entry per
  distinct CSV `internal_type`** (8 keys: `script` → `.js`, `script_plain` → `.client.js`,
  `script_server_side` → `.server.js`, `json` → `.json`, `css` → `.css`, `html` → `.html`,
  `html_template` → `.template.html`, `html_script` → `.script.html`), so each script variant
  is tracked individually. The legacy `glidescript`/`javascript`/`string` keys are no longer in
  the base; projects that need them can add them via global/project config (the deep-merge keeps
  whatever `column_types` they declare).
- Precedence is **project > global > default**; `column_types` follow the same last-writer-wins
  rule as columns.
