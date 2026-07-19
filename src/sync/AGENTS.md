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
- `stages/pull.stage.ts` — `PullStage.run(snAuth, appSysId, trackConfig)`: detects changed
  records via `sys_metadata` (filtered by `sys_scope` + `sys_class_nameIN<tracked tables>`),
  then fetches full record data per tracked table. Returns `PullResult` (records by table).
- `stages/write.stage.ts` — `WriteStage.run(projectRoot, scope, pullResult, trackConfig)`:
  materializes the on-disk layout `${scope}/${table}/${slug}/${column}.${ext}` +
  `record_metadata.json` per record. Matches existing folders by `sys_id` and renames on
  display-value change (OS-11); disambiguates slug collisions with `__<first 8 of sys_id>`.
- `stages/pull.stage.spec.ts` / `stages/write.stage.spec.ts` — Vitest specs (HTTP mocked via
  nock for pull; temp dirs for write).

## Notes
- The pull uses `sys_metadata` as the change-detection table (one request per scope, all
  tracked tables in one `IN` query), then fetches full record data per table. Deletions
  (`sys_metadata_delete`) and the 1800-char URL split (OS-25) are deferred.
- The write stage implements the `--force-pull` path: overwrite all columns from the instance,
  refresh `$hash`/`$sys_updated_on`/`$sys_mod_count`, clear `$conflicts`. 3-way merge and
  conflict-check are deferred.
- `PullStage` and `WriteStage` are imported as runtime imports (not `import type`) in
  `sync.service.ts` so NestJS DI `emitDecoratorMetadata` resolves them correctly.
