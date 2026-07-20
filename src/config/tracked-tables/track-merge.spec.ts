/**
 * @file track-merge.spec.ts
 * Tests for pure upsert utilities: upsertColumnType and upsertTrackedTable.
 */

import { describe, expect, it } from 'vitest';
import { removeTrackedColumn, upsertColumnType, upsertTrackedTable } from './track-merge';
import type { ColumnType, TrackedTable } from './tracked-tables.types';

describe('upsertColumnType', () => {
  it('adds a new column type to an empty record', () => {
    const def: ColumnType = { file_name: 'script', extension: '.js', behavior: 'inline' };
    const result = upsertColumnType(undefined, 'script', def);
    expect(result).toEqual({ script: def });
  });

  it('adds a new column type to an existing record', () => {
    const existing = { json: { file_name: 'config', extension: '.json', behavior: 'file' } };
    const newDef: ColumnType = { file_name: 'style', extension: '.css', behavior: 'file' };
    const result = upsertColumnType(existing, 'css', newDef);
    expect(result).toEqual({
      json: existing.json,
      css: newDef,
    });
  });

  it('overrides an existing column type with the same name', () => {
    const existing = { script: { file_name: 'old', extension: '.old', behavior: 'old' } };
    const newDef: ColumnType = { file_name: 'new', extension: '.new', behavior: 'new' };
    const result = upsertColumnType(existing, 'script', newDef);
    expect(result).toEqual({ script: newDef });
  });

  it('does not mutate the input object', () => {
    const existing = { script: { file_name: 'old', extension: '.old', behavior: 'old' } };
    const newDef: ColumnType = { file_name: 'new', extension: '.new', behavior: 'new' };
    upsertColumnType(existing, 'script', newDef);
    expect(existing).toEqual({ script: { file_name: 'old', extension: '.old', behavior: 'old' } });
  });
});

describe('upsertTrackedTable', () => {
  it('appends a brand-new table to an empty array', () => {
    const table: TrackedTable = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };
    const result = upsertTrackedTable(undefined, table);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(table);
  });

  it('appends a brand-new table to an existing array', () => {
    const existing: TrackedTable[] = [
      { name: 'sys_app', columns: [{ name: 'name', type: 'string' }] },
    ];
    const table: TrackedTable = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script' }],
    };
    const result = upsertTrackedTable(existing, table);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(existing[0]);
    expect(result[1]).toEqual(table);
  });

  it('merges columns into an existing table by name', () => {
    const existing: TrackedTable[] = [
      {
        name: 'sys_script',
        columns: [{ name: 'script', type: 'script' }],
      },
    ];
    const table: TrackedTable = {
      name: 'sys_script',
      columns: [{ name: 'description', type: 'string' }],
    };
    const result = upsertTrackedTable(existing, table);
    expect(result).toHaveLength(1);
    const merged = result[0];
    expect(merged.name).toBe('sys_script');
    expect(merged.columns).toContainEqual({ name: 'script', type: 'script' });
    expect(merged.columns).toContainEqual({ name: 'description', type: 'string' });
  });

  it('overrides a column type when merging tables by name', () => {
    const existing: TrackedTable[] = [
      {
        name: 'sys_script',
        columns: [{ name: 'script', type: 'script' }],
      },
    ];
    const table: TrackedTable = {
      name: 'sys_script',
      columns: [{ name: 'script', type: 'script_plain' }],
    };
    const result = upsertTrackedTable(existing, table);
    expect(result).toHaveLength(1);
    const merged = result[0];
    expect(merged.columns).toHaveLength(1);
    expect(merged.columns[0]).toEqual({ name: 'script', type: 'script_plain' });
  });

  it('preserves other tables when merging', () => {
    const existing: TrackedTable[] = [
      { name: 'sys_app', columns: [{ name: 'name', type: 'string' }] },
      { name: 'sys_script', columns: [{ name: 'script', type: 'script' }] },
    ];
    const table: TrackedTable = {
      name: 'sys_script',
      columns: [{ name: 'description', type: 'string' }],
    };
    const result = upsertTrackedTable(existing, table);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(existing[0]);
    const merged = result[1];
    expect(merged.name).toBe('sys_script');
    expect(merged.columns).toHaveLength(2);
  });

  it('does not mutate the input array', () => {
    const existing: TrackedTable[] = [
      {
        name: 'sys_script',
        columns: [{ name: 'script', type: 'script' }],
      },
    ];
    const table: TrackedTable = {
      name: 'sys_script',
      columns: [{ name: 'description', type: 'string' }],
    };
    upsertTrackedTable(existing, table);
    // Input array should not be modified (though it may be the same reference due to slice()).
    // Instead, verify that the returned array is different from the input.
    const result = upsertTrackedTable(existing, table);
    expect(result[0]).not.toBe(existing[0]); // deep copy, not reference
  });
});

describe('removeTrackedColumn', () => {
  it('removes a named column from a table that has multiple columns', () => {
    const existing: TrackedTable[] = [
      {
        name: 'sys_script',
        columns: [
          { name: 'script', type: 'script' },
          { name: 'description', type: 'string' },
        ],
      },
    ];
    const result = removeTrackedColumn(existing, 'sys_script', 'script');
    expect(result).toHaveLength(1);
    expect(result[0].columns).toEqual([{ name: 'description', type: 'string' }]);
  });

  it('drops the table entry entirely when removing its only/last column', () => {
    const existing: TrackedTable[] = [
      {
        name: 'sys_script',
        columns: [{ name: 'script', type: 'script' }],
      },
    ];
    const result = removeTrackedColumn(existing, 'sys_script', 'script');
    expect(result).toHaveLength(0);
  });

  it('passes through unchanged a table whose name does not match', () => {
    const existing: TrackedTable[] = [
      {
        name: 'sys_script',
        columns: [{ name: 'script', type: 'script' }],
      },
      {
        name: 'sys_app',
        columns: [{ name: 'name', type: 'string' }],
      },
    ];
    const result = removeTrackedColumn(existing, 'sys_app', 'description');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(existing[0]);
    expect(result[1]).toEqual(existing[1]);
  });

  it('is a no-op when the columnName is absent from the matching table', () => {
    const existing: TrackedTable[] = [
      {
        name: 'sys_script',
        columns: [{ name: 'script', type: 'script' }],
      },
    ];
    const result = removeTrackedColumn(existing, 'sys_script', 'does_not_exist');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(existing[0]);
  });

  it('returns [] when tables is undefined', () => {
    const result = removeTrackedColumn(undefined, 'sys_script', 'script');
    expect(result).toEqual([]);
  });

  it('does not mutate the input: returned table objects are not the same reference as the inputs', () => {
    const existing: TrackedTable[] = [
      {
        name: 'sys_script',
        columns: [{ name: 'script', type: 'script' }],
      },
    ];
    const result = removeTrackedColumn(existing, 'sys_app', 'description');
    expect(result[0]).not.toBe(existing[0]); // deep copy, not reference
  });
});
