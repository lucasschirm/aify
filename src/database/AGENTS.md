# database

SQLite persistence for aify (Sequelize + sequelize-typescript + sqlite3).

| File | Purpose |
|------|---------|
| `sequelize.factory.ts` | `buildSequelize(storagePath)` — builds a SQLite Sequelize instance and registers all models. Does NOT sync. |
| `database.module.ts` | `DatabaseModule.forRoot(storagePath)` — provides the Sequelize instance (global) and runs `sync({ alter: true })` on init (never drops columns, OS-29). Exposes the `SEQUELIZE` token. |
| `models/` | The Sequelize models: `Instance`, `Auth`, `Application` (added in TASK_008–010). |

Tests use in-memory SQLite (`:memory:`). The DB file at runtime is `~/.aify/aifydb.sqlite3`,
seeded from the packaged `templates/template_db.sqlite3`.
