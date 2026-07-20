# scripts

Build-time scripts (not shipped as runtime code; run via package scripts).

| File | Purpose |
|------|---------|
| `build-template-db.ts` | `buildTemplateDb(targetPath?)` — builds an EMPTY `templates/template_db.sqlite3` from the Sequelize models. Run with `pnpm build:template-db`. The file ships in the npm package (`files` allowlist, TASK_030) and seeds `~/.aify/aifydb.sqlite3` on first use. |
