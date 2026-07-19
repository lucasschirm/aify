/**
 * @file encoded-query.builder.spec.ts
 * Tests for encoded-query builder — dateGenerate, inClause, splitByUrlLimit.
 */
import { describe, expect, it } from 'vitest';
import { dateGenerate, inClause, splitByUrlLimit } from './encoded-query.builder';

describe('dateGenerate', () => {
  it('returns the UTC timestamp as a plain literal (NOT wrapped in gs.dateGenerate)', () => {
    // gs.dateGenerate() interprets its arguments in the session's time zone and converts
    // to UTC — but sys_updated_on from the Table API is already UTC, so wrapping it would
    // silently shift the "changed since" threshold by the session's UTC offset.
    expect(dateGenerate('2026-01-19 04:52:04')).toBe('2026-01-19 04:52:04');
    expect(dateGenerate('2026-01-19 04:52:04')).not.toContain('gs.dateGenerate');
  });

  it('tolerates surrounding whitespace in the timestamp', () => {
    expect(dateGenerate('  2026-01-19 04:52:04  ')).toBe('2026-01-19 04:52:04');
  });
});

describe('inClause', () => {
  it('joins values with the IN operator and no surrounding spaces', () => {
    expect(inClause('sys_class_name', ['sys_script', 'sys_script_include'])).toBe(
      'sys_class_nameINsys_script,sys_script_include',
    );
  });

  it('handles a single value', () => {
    expect(inClause('f', ['a'])).toBe('fINa');
  });

  it('joins multiple generic values', () => {
    expect(inClause('f', ['a', 'b', 'c'])).toBe('fINa,b,c');
  });
});

describe('splitByUrlLimit', () => {
  it('returns a single URL when the IN list fits (default 1800 limit)', () => {
    expect(splitByUrlLimit('https://h/q?', 'f', ['a', 'b', 'c'])).toEqual(['https://h/q?fINa,b,c']);
  });

  it('splits into multiple ≤limit URLs, each with its own IN clause', () => {
    const urls = splitByUrlLimit('https://h/q?', 'f', ['aaa', 'bbb', 'ccc'], 20);
    expect(urls).toEqual(['https://h/q?fINaaa', 'https://h/q?fINbbb', 'https://h/q?fINccc']);
    for (const url of urls) {
      expect(url.length).toBeLessThanOrEqual(20);
    }
  });

  it('emits one URL per value when even a single value hits the cap', () => {
    const urls = splitByUrlLimit('https://h/q?', 'f', ['aa', 'bb'], 16);
    expect(urls).toEqual(['https://h/q?fINaa', 'https://h/q?fINbb']);
  });
});
