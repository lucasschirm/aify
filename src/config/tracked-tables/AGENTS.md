# config/tracked-tables

Which ServiceNow tables/columns aify tracks, and how their configuration is layered.

## Files
- `tracked-tables.types.ts` — `TrackedColumn`, `TrackedTable`, `ColumnType`, `TrackConfig`.
- `default-tables.ts` — `DEFAULT_TABLES` (the shipped default tracked-table set, spec OS-14),
  imported from `../base.json` (generated once from
  `reference_docs/plans/sys_dictionary.csv`). Also exports `parseTrackedTableList(content)` for the future
  `tracked_table_list.txt` (rows split by `||`, fields by `|` as `table|column|type`; strips a
  trailing sys_id from the table via `split('_')` → drop last → `join('_')`).
- `tracked-tables.service.ts` — `TrackedTablesService.getProjectTrackTables(projectRoot)`.
  Deep-merges `DEFAULT_TABLES` → `~/.aify/track_tables.json` (global) → project
  `.aify.config.json` (project wins; nothing lost). Tables merge by name, columns by name,
  `column_types` by spread (OS-15). Injects `GlobalConfigService` (for `trackTablesPath()`) and
  `ProjectConfigService`.
- `default-tables.spec.ts` / `tracked-tables.service.spec.ts` — Vitest specs covering the
  sys_id-stripping parser, the CSV-derived default (42 tables, 8 `column_types`), and the
  deep-merge (keep default column, override column type).

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
