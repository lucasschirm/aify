# config/global

Global aify folder management (`~/.aify`).

## Files
- `global-config.service.ts` — `GlobalConfigService`. Creates/seeds `~/.aify` atomically and
  idempotently from the packaged `templates/` (copies `template_db.sqlite3` → `aifydb.sqlite3`
  with `COPYFILE_EXCL`, never clobbering an existing DB). Exposes `dbPath()`,
  `trackTablesPath()`, and `log(message)` which appends a line to
  `~/.aify/logs/<YYYY-MM-DD>.log` (per-day plain text, OS-19). All paths resolve through
  `os.homedir()` — never a literal `~`.
- `global-config.service.spec.ts` — Vitest spec. Points `process.env.HOME` at a temp dir and a
  fake templates dir; asserts idempotent seeding, no-clobber, and per-day logging.

## Notes
- Passwords are **never** stored here — keytar/OS keychain holds them (OS-17).
- The install-root `templates/` directory is resolved from the compiled entry (`__dirname`),
  not `process.cwd()`.
