/**
 * @file track-merge.ts
 * Pure upsert helpers for tracked-table configuration: merge a single column type or table
 * into existing records without mutating inputs. Used by project and global config writers
 * to persist user-selected tables and column types.
 */

import type { ColumnType, TrackedColumn, TrackedTable } from './tracked-tables.types';

/**
 * Upsert a column type into a column_types record.
 *
 * @param existing The existing column_types record, or undefined.
 * @param name The column type name (e.g., "script", "json").
 * @param def The ColumnType definition { file_name, extension, behavior }.
 * @returns A new column_types record with the entry added or overridden.
 */
export function upsertColumnType(
  existing: Record<string, ColumnType> | undefined,
  name: string,
  def: ColumnType,
): Record<string, ColumnType> {
  return {
    ...(existing ?? {}),
    [name]: def,
  };
}

/**
 * Upsert a table into a tables array, merging columns by name if the table already exists.
 *
 * @param tables The existing tables array, or undefined.
 * @param table The TrackedTable to add or merge.
 * @returns A new tables array with the table added or updated (new columns appended, existing overridden).
 */
export function upsertTrackedTable(
  tables: TrackedTable[] | undefined,
  table: TrackedTable,
): TrackedTable[] {
  const existing = tables ?? [];
  const existingTableIndex = existing.findIndex((t) => t.name === table.name);

  if (existingTableIndex === -1) {
    // Brand new table; append it.
    return [
      ...existing.map((t) => ({ name: t.name, columns: t.columns.map((c) => ({ ...c })) })),
      {
        name: table.name,
        columns: table.columns.map((c) => ({ name: c.name, type: c.type })),
      },
    ];
  }

  // Merge columns by name: existing first (preserves order), then new/overridden.
  const existingTable = existing[existingTableIndex];
  const colsByName = new Map<string, TrackedColumn>();
  for (const col of existingTable.columns) {
    colsByName.set(col.name, col);
  }
  for (const col of table.columns) {
    colsByName.set(col.name, { name: col.name, type: col.type }); // override wins
  }

  return existing.map((t, i) =>
    i === existingTableIndex
      ? { name: t.name, columns: [...colsByName.values()] }
      : { name: t.name, columns: t.columns.map((c) => ({ ...c })) },
  );
}

/**
 * Remove a column from a table's `columns` array (immutably). If that leaves the table with
 * zero columns, drop the table entry entirely. Non-matching tables/columns pass through unchanged.
 *
 * @param tables The existing tables array, or undefined.
 * @param tableName The name of the table from which to remove the column.
 * @param columnName The name of the column to remove.
 * @returns A new tables array with the column removed and the table dropped if empty.
 */
export function removeTrackedColumn(
  tables: TrackedTable[] | undefined,
  tableName: string,
  columnName: string,
): TrackedTable[] {
  const existing = tables ?? [];
  const result: TrackedTable[] = [];
  for (const t of existing) {
    if (t.name !== tableName) {
      result.push({ name: t.name, columns: t.columns.map((c) => ({ ...c })) });
      continue;
    }
    const remaining = t.columns.filter((c) => c.name !== columnName).map((c) => ({ ...c }));
    if (remaining.length > 0) {
      result.push({ name: t.name, columns: remaining });
    }
    // otherwise: drop the now-empty table entirely
  }
  return result;
}
