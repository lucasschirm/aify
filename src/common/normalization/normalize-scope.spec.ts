/**
 * normalize-scope.spec.ts
 * Test cases for normalizeScope (spec "Normalization", C4).
 */
import { describe, expect, it } from 'vitest';
import { normalizeScope } from './normalize-scope';

describe('normalizeScope', () => {
  it('replaces @ and / runs with a single underscore and trims the result', () => {
    expect(normalizeScope('@myscope/name')).toBe('myscope_name');
  });

  it('replaces dots but preserves existing underscores and hyphens', () => {
    expect(normalizeScope('my_scope-name.sql')).toBe('my_scope-name_sql');
  });

  it('normalizes a vendor scope', () => {
    expect(normalizeScope('@devsnc/library')).toBe('devsnc_library');
  });

  it('collapses mixed separator runs into a single underscore', () => {
    expect(normalizeScope('a @/. b')).toBe('a_b');
  });
});
