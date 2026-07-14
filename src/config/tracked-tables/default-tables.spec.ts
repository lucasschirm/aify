/**
 * @file default-tables.spec.ts
 * Tests for parseTrackedTableList parser and INTERIM_DEFAULT_TABLES.
 */
import { describe, expect, it } from 'vitest';
import { INTERIM_DEFAULT_TABLES, parseTrackedTableList } from './default-tables';

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

  it('ships the interim default set with glidescript/javascript column types', () => {
    const names = INTERIM_DEFAULT_TABLES.tables.map((t) => t.name);
    expect(names).toContain('sys_script');
    expect(names).toContain('sys_ws_operation');
    expect(INTERIM_DEFAULT_TABLES.column_types.glidescript.extension).toBe('glide.js');
  });
});
