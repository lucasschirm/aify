# database

SQLite persistence for aify (Sequelize + sequelize-typescript + sqlite3).

| File | Purpose |
|------|---------|
| `sequelize.factory.ts` | `buildSequelize(storagePath)` — builds a SQLite Sequelize instance and registers all models. Does NOT sync. |
| `database.module.ts` | `DatabaseModule.forRoot(storagePath)` — provides the Sequelize instance (global) and runs `sync()` on init (create-missing-tables only; never alters/drops existing columns, OS-29). Schema evolution is deferred to umzug migrations (planned). Exposes the `SEQUELIZE` token. |
| `models/instance.model.ts` | `Instance` — a ServiceNow instance. `instance` VARCHAR(200) UNIQUE (host only); `url` VARCHAR(2048) (full URL). No timestamps. |
| `models/auth.model.ts` | `Auth` — credential METADATA only (no password; keytar holds it, OS-17). `alias` UNIQUE globally (OS-16); `instanceId` FK→Instance; `isCurrent` global flag enforced by `@AfterCreate` / `@AfterUpdate` / `@AfterUpsert` hooks that bulk-flip every other row to false (with `hooks:false` so the hook does not re-fire); `lastUsedAt`. |
| `models/application.model.ts` | `Application` — a tracked scoped application. `scope` VARCHAR(120) UNIQUE, `sysId` VARCHAR(32) UNIQUE, `displayValue` VARCHAR(120) UNIQUE. No instance link (OS-20). |

Tests use in-memory SQLite (`:memory:`). The DB file at runtime is `~/.aify/aifydb.sqlite3`,
seeded from the packaged `templates/template_db.sqlite3`.
