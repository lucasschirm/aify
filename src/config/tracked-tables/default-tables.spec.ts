/**
 * @file default-tables.spec.ts
 * Tests for parseTrackedTableList parser and DEFAULT_TABLES (sourced from ../base.json, which
 * was generated from reference_docs/plans/sys_dictionary.csv).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TABLES, parseTrackedTableList } from './default-tables';

describe('parseTrackedTableList', () => {
  it('parses ||/| rows and strips the trailing sys_id from the table name', () => {
    const sysA = '0123456789abcdef0123456789abcdef';
    const sysB = 'ffffffffffffffffffffffffffffffff';
    const content = `a_b_${sysA}|script|glidescript||c_d_${sysB}|operation_script|glidescript`;
    const parsed = parseTrackedTableList(content);
    expect(parsed.tables).toEqual([
      { name: 'a_b', columns: [{ name: 'script', type: 'glidescript' }] },
      { name: 'c_d', columns: [{ name: 'operation_script', type: 'glidescript' }] },
    ]);
    expect(parsed.column_types).toEqual({});
  });

  it('groups multiple rows for the same table and skips blank rows', () => {
    const sys = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const content = `sys_ui_policy_${sys}|script_true|javascript|| ||sys_ui_policy_${sys}|script_false|javascript`;
    const parsed = parseTrackedTableList(content);
    expect(parsed.tables).toEqual([
      {
        name: 'sys_ui_policy',
        columns: [
          { name: 'script_true', type: 'javascript' },
          { name: 'script_false', type: 'javascript' },
        ],
      },
    ]);
  });

  it('ships the default set sourced from sys_dictionary.csv (one column_type per internal_type)', () => {
    const names = DEFAULT_TABLES.tables.map((t) => t.name);
    expect(names).toContain('sys_script');
    expect(names).toContain('sys_ws_operation');
    // 42 tables from the CSV baseline.
    expect(DEFAULT_TABLES.tables).toHaveLength(42);
    // 8 column_types — one per distinct CSV internal_type.
    expect(Object.keys(DEFAULT_TABLES.column_types).sort()).toEqual(
      [
        'css',
        'html',
        'html_script',
        'html_template',
        'json',
        'script',
        'script_plain',
        'server_script',
      ].sort(),
    );
    expect(DEFAULT_TABLES.column_types.script.extension).toBe('js');
    expect(DEFAULT_TABLES.column_types.script_plain.extension).toBe('client.js');
    expect(DEFAULT_TABLES.column_types.server_script.extension).toBe('server.js');
    expect(DEFAULT_TABLES.column_types.html_template.extension).toBe('template.html');
  });
});
