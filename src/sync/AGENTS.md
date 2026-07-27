# sync

The sync subsystem: pulls ServiceNow metadata for tracked scopes to local files, with a
git-like pull → conflict-check → write → push flow (spec "Step 1–4").

## Files
- `sync.command.ts` — `aify sync` command (`--scope`, `--force`). Delegates to `SyncService`.
- `sync.service.ts` — `SyncService.syncOnce()`: validates current connection + tracked scopes,
  then runs `PullStage` → `WriteStage` per scope. Conflict-check, push, and hot mode are
  deferred to a future cycle; this first cycle implements `--force-pull` semantics (pull
  everything in the scope, overwrite local files).
- `sync.module.ts` — NestJS module wiring `SyncService`, `SyncCommand`, `PullStage`,
  `WriteStage`. Imports `AuthenticationModule` (for `TableApiClient`), `ConfigModule`, `UiModule`.
- `sync.types.ts` — `SyncOptions`, `ConflictClass`, `ColumnChange`, `Prompter`, `PROMPTER`.
- `stages/pull.stage.ts` — `PullStage.run(snAuth, appSysId, trackConfig)`: discovers records by
  querying each tracked table directly (`sys_scope=<appSysId>` + optional incremental
  `sys_updated_on>` filter), compares the returned rows with local metadata, and builds a
  `PullResult` of created/changed records. Deletions are still detected via `sys_metadata_delete`.
- `stages/write.stage.ts` — `WriteStage.run(projectRoot, scope, pullResult, trackConfig)`:
  materializes the on-disk layout `${scope}/${table}/${slug}/${column}.${ext}` +
  `record_metadata.json` per record. Matches existing folders by `sys_id` and renames on
  display-value change (OS-11); disambiguates slug collisions with `__<first 8 of sys_id>`.
- `stages/pull.stage.spec.ts` / `stages/write.stage.spec.ts` — Vitest specs (HTTP mocked via
  nock for pull; temp dirs for write).

## Notes
- The pull queries every tracked table directly by `sys_scope` (one request per table per scope),
  optionally filtered by `sys_updated_on>` on incremental pulls, and compares the returned rows
  with local metadata to decide created/changed/unchanged. This finds all application records,
  including base records that may not appear in `sys_metadata`. Deletions are still detected via
  `sys_metadata_delete`; the 1800-char URL split (OS-25) is no longer needed because each table
  is fetched in a single paginated request.
- The write stage implements the `--force-pull` path: overwrite all columns from the instance,
  refresh `$hash`/`$sys_updated_on`/`$sys_mod_count`, clear `$conflicts`. 3-way merge and
  conflict-check are deferred.
- `PullStage` and `WriteStage` are imported as runtime imports (not `import type`) in
  `sync.service.ts` so NestJS DI `emitDecoratorMetadata` resolves them correctly.
