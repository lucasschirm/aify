/**
 * @file default-tables.ts
 * DEFAULT_TABLES — the shipped default tracked-table set (spec OS-14), sourced from
 * `src/config/base.json`. That JSON was generated once from
 * `reference_docs/plans/sys_dictionary.csv`; one `column_types` entry per distinct CSV
 * `internal_type` so each script variant (Script, Script (Plain), Script (server side),
 * HTML, HTML Template, HTML Script, …) is tracked individually. This file also exports
 * `parseTrackedTableList()`, which parses the future `tracked_table_list.txt` (||/|-delimited)
 * and strips a trailing sys_id from each table name (split('_') → drop last → join('_')).
 */
import baseConfig from '../base.json';
import type { TrackConfig, TrackedTable } from './tracked-tables.types';

/**
 * Shipped default tracked-table configuration (spec OS-14). Deep-merged with
 * `~/.aify/track_tables.json` (global) and `.aify.config.json` (project) by
 * TrackedTablesService.getProjectTrackTables() — project wins, nothing lost (OS-15).
 */
export const DEFAULT_TABLES: TrackConfig = baseConfig as TrackConfig;

/**
 * Parse the tracked_table_list.txt format: rows split by '||', fields by '|' as
 * table|column|type; strip a trailing sys_id from the table via split('_') → pop() → join('_').
 * Returns tables grouped by name with an empty column_types (types come from the merge).
 */
export function parseTrackedTableList(content: string): TrackConfig {
  const byName = new Map<string, TrackedTable>();
  const tables: TrackedTable[] = [];
  for (const rawRow of content.split('||')) {
    const row = rawRow.trim();
    if (!row) continue;
    const parts = row.split('|').map((s) => s.trim());
    const rawTable = parts[0];
    const column = parts[1];
    const type = parts[2];
    if (!rawTable || !column || !type) continue;
    const tableParts = rawTable.split('_');
    tableParts.pop(); // drop the trailing sys_id segment
    const table = tableParts.join('_');
    if (!table) continue;
    let entry = byName.get(table);
    if (!entry) {
      entry = { name: table, columns: [] };
      byName.set(table, entry);
      tables.push(entry);
    }
    if (!entry.columns.some((c) => c.name === column)) {
      entry.columns.push({ name: column, type });
    }
  }
  return { tables, column_types: {} };
}
