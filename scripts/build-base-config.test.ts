/**
 * @file build-base-config.test.ts
 * Tests for the one-off base-config generator: CSV parsing, internal_type → type-key
 * slugification, table grouping, column dedup, and the 8-entry column_types table.
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBaseConfig, writeBaseConfig } from './build-base-config';

/** A tiny CSV exercising every internal_type and a quoted field with a comma + doubled quote. */
const SAMPLE_CSV = [
  '"name","element","internal_type","reference","default_value","display","text_index","audit","sys_updated_on","sys_updated_by","sys_scope","sys_created_on"',
  '"sys_script","script","Script","","","false","false","false","2026-04-30 00:00:00","system","Global","2026-04-30 00:00:00"',
  '"sys_script","script","Script","","","false","false","false","2026-04-30 00:00:00","system","Global","2026-04-30 00:00:00"',
  '"sys_script_client","script","Script (Plain)","","","false","false","false","2026-04-30 00:00:00","system","Global","2026-04-30 00:00:00"',
  '"sys_processor","script","Script (server side)","","","false","false","false","2026-04-30 00:00:00","system","Global","2026-04-30 00:00:00"',
  '"sp_widget","css","CSS","","","false","false","false","2026-04-30 00:00:00","system","Global","2026-04-30 00:00:00"',
  '"sp_widget","option_schema","JSON","","","false","false","false","2026-04-30 00:00:00","system","Global","2026-04-30 00:00:00"',
  '"sp_ng_template","template","HTML Template","","","false","false","false","2026-04-30 00:00:00","system","Global","2026-04-30 00:00:00"',
  '"sysevent_email_action","message_html","HTML Script","","","false","false","false","2026-04-30 00:00:00","system","Global","2026-04-30 00:00:00"',
  '"sp_page","css","CSS","","","false","false","false","2026-04-30 00:00:00","system","Global","2026-04-30 00:00:00"',
  '"sp_portal","title","HTML","","<h1>""Hello, World""</h1>","false","false","false","2026-04-30 00:00:00","system","Global","2026-04-30 00:00:00"',
].join('\n');

describe('buildBaseConfig', () => {
  it('maps each distinct internal_type to its own slugified column_types key', () => {
    const config = buildBaseConfig(SAMPLE_CSV);
    expect(Object.keys(config.column_types).sort()).toEqual(
      [
        'css',
        'html',
        'html_script',
        'html_template',
        'json',
        'script',
        'script_plain',
        'script_server_side',
      ].sort(),
    );
  });

  it('uses the agreed extensions for the 8 column_types', () => {
    const { column_types: ct } = buildBaseConfig(SAMPLE_CSV);
    expect(ct.script.extension).toBe('js');
    expect(ct.script_plain.extension).toBe('client.js');
    expect(ct.script_server_side.extension).toBe('server.js');
    expect(ct.json.extension).toBe('json');
    expect(ct.css.extension).toBe('css');
    expect(ct.html.extension).toBe('html');
    expect(ct.html_template.extension).toBe('template.html');
    expect(ct.html_script.extension).toBe('script.html');
  });

  it('file_name is ${column_name} for every column_type (spec C3)', () => {
    const { column_types: ct } = buildBaseConfig(SAMPLE_CSV);
    for (const key of Object.keys(ct)) {
      expect(ct[key].file_name).toBe('${column_name}');
    }
  });

  it('groups rows by table name and dedups columns by element name (first wins)', () => {
    const config = buildBaseConfig(SAMPLE_CSV);
    const byName = new Map(config.tables.map((t) => [t.name, t]));

    // sys_script appears twice with the same column → deduped to one column.
    expect(byName.get('sys_script')?.columns).toEqual([{ name: 'script', type: 'script' }]);

    // sp_widget has two distinct columns.
    expect(byName.get('sp_widget')?.columns).toEqual([
      { name: 'css', type: 'css' },
      { name: 'option_schema', type: 'json' },
    ]);

    // sp_page and sp_widget both have a `css` column — independent entries per table.
    expect(byName.get('sp_page')?.columns).toEqual([{ name: 'css', type: 'css' }]);
  });

  it('sorts tables alphabetically by name', () => {
    const config = buildBaseConfig(SAMPLE_CSV);
    const names = config.tables.map((t) => t.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('parses a quoted field containing a doubled quote and a comma (RFC-4180)', () => {
    const config = buildBaseConfig(SAMPLE_CSV);
    const portal = config.tables.find((t) => t.name === 'sp_portal');
    expect(portal?.columns).toEqual([{ name: 'title', type: 'html' }]);
  });

  it('skips rows missing name, element, or internal_type', () => {
    const csv = [
      '"name","element","internal_type"',
      '"only_table","","Script"',
      '"","only_column","Script"',
      '"only_table","only_column",""',
      '"good_table","good_column","Script"',
    ].join('\n');
    const config = buildBaseConfig(csv);
    expect(config.tables).toEqual([
      { name: 'good_table', columns: [{ name: 'good_column', type: 'script' }] },
    ]);
  });
});

describe('writeBaseConfig', () => {
  it('writes a parseable JSON file with the real CSV baseline (42 tables, 8 column_types)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aify-base-'));
    const out = join(dir, 'base.json');
    const csvPath = join(__dirname, '..', 'reference_docs', 'plans', 'sys_dictionary.csv');

    const returned = writeBaseConfig(csvPath, out);
    expect(returned).toBe(out);
    expect(existsSync(out)).toBe(true);

    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.tables).toHaveLength(42);
    expect(Object.keys(written.column_types).sort()).toEqual(
      [
        'css',
        'html',
        'html_script',
        'html_template',
        'json',
        'script',
        'script_plain',
        'script_server_side',
      ].sort(),
    );

    const names = written.tables.map((t: { name: string }) => t.name);
    expect(names).toContain('sys_script');
    expect(names).toContain('sys_ws_operation');
    expect(written.column_types.script.extension).toBe('js');
    expect(written.column_types.html_template.extension).toBe('template.html');
  });

  it('is idempotent — regenerating over an existing file yields byte-identical content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aify-base-'));
    const out = join(dir, 'base.json');
    const csvPath = join(__dirname, '..', 'reference_docs', 'plans', 'sys_dictionary.csv');

    writeBaseConfig(csvPath, out);
    const first = readFileSync(out, 'utf8');
    writeBaseConfig(csvPath, out);
    const second = readFileSync(out, 'utf8');
    expect(second).toBe(first);
  });
});
