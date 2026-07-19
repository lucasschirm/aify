# common/hashing

Content hashing for change detection (spec OS-12). NOT security — fast non-cryptographic hash
of LF-normalized text so CRLF/LF differences don't read as edits.

## Files
- `content-hash.ts` — `hashContent(text)` → `"xxh3:<hex>"`. LF-normalizes input before hashing.
  The spec calls for `xxhash-addon` (XXH3); until that dependency is wired in, this falls back
  to a SHA-256-derived 64-bit hex with the same `xxh3:` prefix so callers and tests are stable.
  Swap the body for `xxh3.hash64(text)` when `xxhash-addon` is installed.

## Notes
- Used by `sync/stages/write.stage.ts` to populate `record_metadata.json`'s `$hash.<column>`.
