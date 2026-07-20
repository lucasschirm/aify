# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

`aify` is a ServiceNow CLI (published as `@lucasschirm/aify`, invoked as `aify`) that connects to a ServiceNow instance using **basic authentication** and the **Table API** to fetch application metadata and sync it to local files with a merge/conflict structure.

**Status:** actively developed. The CLI is implemented under `src/` as a **NestJS** application (nest-commander commands for `auth` and `sync`, plus api/config/database/sync/authentication domains). Each domain folder has its own `AGENTS.md` — read the nearest one before editing.

## Stack & commands

- Node.js **>= 22**, **CommonJS** (`"type": "commonjs"`), TypeScript 5.x with `experimentalDecorators` + `emitDecoratorMetadata` (NestJS DI). `package.json` `main`/`bin` is `dist/main.js`; `nest build` compiles `src/` → `dist/`.
- Package manager is **pnpm**. Use `pnpm`, not `npm`/`yarn`.
- Framework: **NestJS** + **nest-commander** for the CLI; **sequelize-typescript** + sqlite for local storage; **keytar** for OS-keychain credentials; **@inquirer/prompts** for interactive input.
- **Tooling & gates** (a change is "done" only when these are green):
  - `pnpm typecheck` — `tsc --noEmit`. The **type authority**; vitest runs on SWC and does NOT type-check.
  - `pnpm lint` — `biome ci .` (formatter + linter; `noExplicitAny` is an error).
  - `pnpm test` — `vitest run` (unit + spec).
  - `pnpm test:e2e` — command-level E2E via `nest-commander-testing`'s `CommandTestFactory` (see `src/test/README.md`).
  - `vitest run --coverage` — coverage thresholds of **80%** (lines/functions/branches/statements) are enforced in `vitest.config.ts`; a run below threshold exits non-zero.
- **NestJS note:** DI requires value imports for runtime metadata, so `// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata` is an expected, correct pattern — not a lint violation to remove.

## ServiceNow Table API — the integration contract

The full Table API reference is vendored locally; read it before writing any request logic:

`reference_docs/ServiceNowDocs/markdown/api-reference/rest-apis/c_TableAPI.md`

Key facts from that doc that shape the implementation:

- **Endpoints:** `GET /api/now/table/{tableName}` (query/list) and `GET /api/now/table/{tableName}/{sys_id}` (single record). Base URL is `https://<instance>.service-now.com`.
- **Auth:** basic auth (username/password) per the project goal — send credentials via the standard `Authorization: Basic` header.
- **Pagination:** responses paginate via `sysparm_offset` / `sysparm_limit` and return `Link` response headers with `rel="next"`/`"prev"`/`"first"`/`"last"`. Any "download all metadata" logic must follow `rel="next"` (or walk `sysparm_offset`) until exhausted — do not assume a single response holds every row.
- Metadata for applications/customizations lives in `sys_*` tables (e.g. `sys_app`, `sys_metadata`, `sys_scope`); confirm exact table names against the instance and the reference doc when implementing.

## reference_docs/

`reference_docs/ServiceNowDocs/` is a large **vendored clone** of the ServiceNow documentation (it carries its own `.git`; it is not a submodule of this repo). It exists as an offline reference for the Table API and related ServiceNow concepts — it is not part of the shipped product. Prefer reading these markdown files over fetching ServiceNow docs from the web.

`convert-urls-to-relative.sh` is a one-off maintenance helper for that vendored copy: it rewrites `raw.githubusercontent.com/ServiceNow/ServiceNowDocs/...` links inside the markdown into repo-relative paths so the docs cross-link locally. It only touches files under `reference_docs/ServiceNowDocs/markdown` and is unrelated to the CLI runtime.
