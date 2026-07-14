# config/tracked-tables

Which ServiceNow tables/columns aify tracks, and how their configuration is layered.

## Files
- `tracked-tables.types.ts` — `TrackedColumn`, `TrackedTable`, `ColumnType`, `TrackConfig`.
- `default-tables.ts` — `INTERIM_DEFAULT_TABLES` (interim default set from spec OS-14; replaced
  by `tracked_table_list.txt` when the owner delivers it) and `parseTrackedTableList(content)`
  (rows split by `||`, fields by `|` as `table|column|type`; strips a trailing sys_id from the
  table via `split('_')` → drop last → `join('_')`).
- `tracked-tables.service.ts` — `TrackedTablesService.getProjectTrackTables(projectRoot)`.
  Deep-merges default → `~/.aify/track_tables.json` (global) → project `.aify.config.json`
  (project wins; nothing lost). Tables merge by name, columns by name, `column_types` by spread
  (OS-15). Injects `GlobalConfigService` (for `trackTablesPath()`) and `ProjectConfigService`.
- `default-tables.spec.ts` / `tracked-tables.service.spec.ts` — Vitest specs covering the
  sys_id-stripping parser and the deep-merge (keep default column, override column type).

## Notes
- Precedence is **project > global > default**; `column_types` follow the same last-writer-wins
  rule as columns.
