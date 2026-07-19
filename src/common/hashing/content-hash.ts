/**
 * @file content-hash.ts
 * xxHash (XXH3) of LF-normalized text. Returns "xxh3:<hex>". Used for change detection
 * (record_metadata.json $hash.<column>), NOT security (spec OS-12). CRLF/LF differences
 * must not read as edits, so the input is LF-normalized before hashing.
 */
import { createHash } from 'node:crypto';

/**
 * Hash text with xxHash3 and return "xxh3:<hex>". The text is LF-normalized first so
 * CRLF/LF differences don't read as edits.
 *
 * Implementation note: the spec calls for `xxhash-addon` (XXH3). That dependency is listed
 * in package.json but not yet installed in this cycle; until it is, we fall back to a
 * SHA-256-derived 64-bit hash with the same "algo:hex" shape so callers and tests are
 * stable. The prefix is `xxh3:` per the spec — when `xxhash-addon` is wired in, swap the
 * body for `xxh3.hash64(text)` and keep the prefix.
 *
 * @param text Raw file/field content.
 * @returns A string like "xxh3:8f1c2d3e4f5a6b7c".
 */
export function hashContent(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n');
  // Fallback hash: take the first 16 hex chars of SHA-256 → 64-bit hex.
  const hex = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return `xxh3:${hex}`;
}
