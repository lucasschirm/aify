# record-metadata

The folder↔record bridge for aify.

## Files
- `record-metadata.types.ts` — `RecordMetadata` shape of `record_metadata.json`.
- `record-metadata.service.ts` — `RecordMetadataService`: resolves record folders by display-value
  slug + sys_id, reads/writes `record_metadata.json` atomically, loads a whole scope into a
  sys_id-keyed map, and renames folders when a display value changes.
- `record-metadata.module.ts` — NestJS module exporting `RecordMetadataService`.
- `record-metadata.service.spec.ts` — unit tests (temp dirs).

## Notes
- Folder disambiguation uses `__<first 8 chars of sys_id>` when two records would collide on slug.
- `recordFolder` is synchronous and uses `fs.existsSync` / `fs.readFileSync` for collision checks.
