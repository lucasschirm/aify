/**
 * @file tracked-tables.types.ts
 * Shape of the tracked-table configuration: which tables/columns aify syncs and how each column
 * type maps to a file (file_name/extension/behavior). Shared by the default set, the list-file
 * parser, and the deep-merge service.
 */
export interface TrackedColumn {
  name: string;
  type: string;
}

export interface TrackedTable {
  name: string;
  columns: TrackedColumn[];
}

export interface ColumnType {
  file_name: string;
  extension: string;
  behavior: string;
}

export interface TrackConfig {
  tables: TrackedTable[];
  column_types: Record<string, ColumnType>;
}
