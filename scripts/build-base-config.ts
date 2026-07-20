/**
 * @file build-base-config.ts
 * One-off baseline generator: reads reference_docs/plans/sys_dictionary.csv and emits
 * src/config/base.json in the canonical TrackConfig shape (spec OS-14). The CSV's
 * `internal_type` is mapped to a slugified `column_types` key — one entry per distinct
 * internal_type, so each script variant (Script, Script (Plain), Script (server side),
 * HTML, HTML Template, HTML Script, …) is tracked individually.
 *
 * Not a build step. Run once via `pnpm tsx scripts/build-base-config.ts` to (re)generate
 * the committed baseline; re-running is idempotent (byte-identical output). The shipped
 * default is `src/config/base.json`, imported by `src/config/tracked-tables/default-tables.ts`
 * and deep-merged with global (~/.aify/track_tables.json) and project (.aify.config.json)
 * layers by TrackedTablesService (OS-15).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type {
  ColumnType,
  TrackConfig,
  TrackedTable,
} from '../src/config/tracked-tables/tracked-tables.types';

/** Default CSV input: <repo>/reference_docs/plans/sys_dictionary.csv. */
const DEFAULT_CSV_PATH = join(__dirname, '..', 'reference_docs', 'plans', 'sys_dictionary.csv');

/** Default JSON output: <repo>/src/config/base.json (shipped with the package). */
const DEFAULT_OUTPUT_PATH = join(__dirname, '..', 'src', 'config', 'base.json');

/**
 * The `column_types` table — one entry per distinct CSV `internal_type`. Keys are
 * slugified internal_type values; `file_name` is `${column_name}` (per spec C3, the file
 * is per column and the slug is the folder). Extensions distinguish the script variants.
 */
const COLUMN_TYPES: Record<string, ColumnType> = {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder token substituted at runtime, not a JS template literal
  script: { file_name: '${column_name}', extension: 'js', behavior: 'javascript' },
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder token substituted at runtime, not a JS template literal
  script_plain: { file_name: '${column_name}', extension: 'client.js', behavior: 'javascript' },
  script_server_side: {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder token substituted at runtime, not a JS template literal
    file_name: '${column_name}',
    extension: 'server.js',
    behavior: 'javascript',
  },
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder token substituted at runtime, not a JS template literal
  json: { file_name: '${column_name}', extension: 'json', behavior: 'application/json' },
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder token substituted at runtime, not a JS template literal
  css: { file_name: '${column_name}', extension: 'css', behavior: 'text/css' },
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder token substituted at runtime, not a JS template literal
  html: { file_name: '${column_name}', extension: 'html', behavior: 'text/html' },
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder token substituted at runtime, not a JS template literal
  html_template: { file_name: '${column_name}', extension: 'template.html', behavior: 'text/html' },
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder token substituted at runtime, not a JS template literal
  html_script: { file_name: '${column_name}', extension: 'script.html', behavior: 'text/html' },
};

/** CSV row shape — only the fields we consume. */
interface SysDictionaryRow {
  name: string; // table name
  element: string; // column name
  internal_type: string; // aify type key source
}

/**
 * Slugify a CSV `internal_type` into a `column_types` key: lowercase, replace `[/\s()]+`
 * runs with `_`, collapse repeats, trim leading/trailing `_`.
 *
 * @example 'Script (server side)' → 'script_server_side'
 * @example 'HTML Template' → 'html_template'
 */
function slugifyInternalType(internalType: string): string {
  return internalType
    .toLowerCase()
    .replace(/[/\s()]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parse CSV content and build the canonical TrackConfig. Pure — no I/O — so the test can
 * feed inline CSV. Rows are grouped by `name` (table), columns deduped by `element` (first
 * occurrence wins). `column_types` is the full 8-entry table above (one per distinct CSV
 * internal_type), independent of which types actually appear in the CSV.
 *
 * @param csvContent Raw CSV text (header row + data rows, RFC-4180 quoting).
 * @returns A TrackConfig with tables (grouped, columns deduped) and the 8 column_types.
 */
export function buildBaseConfig(csvContent: string): TrackConfig {
  // csv-parse sync API: when called with a string + callback-less, returns an array of records.
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as unknown as SysDictionaryRow[];

  const byName = new Map<string, TrackedTable>();
  const tables: TrackedTable[] = [];
  for (const row of rows) {
    const table = row.name;
    const column = row.element;
    const internalType = row.internal_type;
    if (!table || !column || !internalType) continue;
    const type = slugifyInternalType(internalType);
    if (!type) continue;

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

  // Stable ordering: tables by name, columns by first-seen order (already stable).
  tables.sort((a, b) => a.name.localeCompare(b.name));

  return { tables, column_types: { ...COLUMN_TYPES } };
}

/**
 * Read the CSV at `csvPath`, build the TrackConfig, and write pretty-printed JSON to
 * `outputPath` (creating parent dirs as needed). Overwrites any existing file.
 *
 * @param csvPath Source CSV path. Defaults to reference_docs/plans/sys_dictionary.csv.
 * @param outputPath Destination JSON path. Defaults to src/config/base.json.
 * @returns The absolute path of the written file.
 */
export function writeBaseConfig(
  csvPath: string = DEFAULT_CSV_PATH,
  outputPath: string = DEFAULT_OUTPUT_PATH,
): string {
  const csvContent = readFileSync(csvPath, 'utf8');
  const config = buildBaseConfig(csvContent);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return outputPath;
}

// Executed directly via `pnpm tsx scripts/build-base-config.ts`. One-off baseline generator.
if (require.main === module) {
  try {
    const path = writeBaseConfig();
    // biome-ignore lint/suspicious/noConsole: build script user feedback
    console.log(`Built base config at ${path}`);
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: build script error output
    console.error(error);
    process.exit(1);
  }
}
