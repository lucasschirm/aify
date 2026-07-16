/**
 * @file default-tables.ts
 * INTERIM_DEFAULT_TABLES — the interim default tracked-table set (spec OS-14), used until
 * reference_docs/plans/tracked_table_list.txt is delivered — plus parseTrackedTableList(),
 * which parses that future ||/|-delimited file and strips a trailing sys_id from each table
 * name (split('_') → drop last → join('_'); sys_ids contain no '_').
 */
import type { ColumnType, TrackConfig, TrackedTable } from './tracked-tables.types';

/** column_types from the spec's track_tables.json example (S1/S3). */
const DEFAULT_COLUMN_TYPES: Record<string, ColumnType> = {
  string: { file_name: 'column_name', extension: 'txt', behavior: 'text/plain' },
  glidescript: { file_name: 'column_name', extension: 'glide.js', behavior: 'glidescript' },
  javascript: { file_name: 'column_name', extension: 'client.js', behavior: 'javascript' },
  css: { file_name: 'column_name', extension: 'css', behavior: 'text/css' },
  json: { file_name: 'column_name', extension: 'json', behavior: 'application/json' },
  html: { file_name: 'column_name', extension: 'html', behavior: 'text/html' },
};

/** Interim default set (spec OS-14 table). Replaced by the list file when it is delivered. */
export const INTERIM_DEFAULT_TABLES: TrackConfig = {
  tables: [
    { name: 'sys_script', columns: [{ name: 'script', type: 'glidescript' }] },
    { name: 'sys_script_include', columns: [{ name: 'script', type: 'glidescript' }] },
    { name: 'sys_script_client', columns: [{ name: 'script', type: 'javascript' }] },
    { name: 'sys_ui_script', columns: [{ name: 'script', type: 'javascript' }] },
    { name: 'sys_ui_action', columns: [{ name: 'script', type: 'glidescript' }] },
    { name: 'catalog_script_client', columns: [{ name: 'script', type: 'javascript' }] },
    {
      name: 'sys_ui_policy',
      columns: [
        { name: 'script_true', type: 'javascript' },
        { name: 'script_false', type: 'javascript' },
      ],
    },
    {
      name: 'sys_ui_policy_action',
      columns: [
        { name: 'script_true', type: 'javascript' },
        { name: 'script_false', type: 'javascript' },
      ],
    },
    { name: 'sys_script_fix', columns: [{ name: 'script', type: 'glidescript' }] },
    { name: 'sysevent_script_action', columns: [{ name: 'script', type: 'glidescript' }] },
    { name: 'sys_processor', columns: [{ name: 'script', type: 'glidescript' }] },
    { name: 'sys_web_service', columns: [{ name: 'operation_script', type: 'glidescript' }] },
    { name: 'sys_ws_operation', columns: [{ name: 'operation_script', type: 'glidescript' }] },
  ],
  column_types: DEFAULT_COLUMN_TYPES,
};

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
