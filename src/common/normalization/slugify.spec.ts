/**
 * slugify.spec.ts
 * Test cases for slugifyDisplayValue (spec "Normalization", OS-11).
 */
import { describe, expect, it } from 'vitest';
import { slugifyDisplayValue } from './slugify';

describe('slugifyDisplayValue', () => {
  it('slugifies a display value with spaces and a separator', () => {
    expect(slugifyDisplayValue('My Record - Name', 'a1b2c3d4e5f6')).toBe('my-record-name');
  });

  it('transliterates accented characters to ASCII', () => {
    expect(slugifyDisplayValue('café', 'a1b2c3d4e5f6')).toBe('cafe');
  });

  it('falls back to the first 8 chars of sys_id when the slug is empty', () => {
    expect(slugifyDisplayValue('!!!', 'a1b2c3d4e5f6g7')).toBe('a1b2c3d4');
  });
});
