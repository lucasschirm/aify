/**
 * @file project-config.types.ts
 * Full shape of the project marker file .aify.config.json (spec: ".aify.config.json full
 * schema"). Leaf types (TrackedTable/ColumnType/RetryPolicy) are imported type-only from
 * their canonical homes so this file carries no runtime dependency on those modules.
 */
import type { ColumnType, TrackedTable } from '../tracked-tables/tracked-tables.types';

export interface AifyProjectConfig {
  hot?: { pullInterval: number };
  project?: { scopes: { sysId: string; scope: string }[] };
  tables?: TrackedTable[];
  column_types?: Record<string, ColumnType>;
  network?: { retry?: never; errorMessage?: string };
  auth?: { failedAttempts: number };
}
