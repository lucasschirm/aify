# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

`aify` is intended to be a ServiceNow CLI that connects to a ServiceNow instance using **basic authentication** and the **Table API** to fetch application metadata and download all of that metadata into local files.

**Status:** greenfield. No application source code exists yet — only project scaffolding, vendored reference documentation, and a docs-maintenance script. When building the CLI, treat this document's "purpose" as the spec and confirm design decisions (command surface, output file layout, config/credential handling) before implementing.

## Stack & commands

- Node.js, **ES modules** (`"type": "module"` in `package.json`).
- Package manager is **pnpm** (`devEngines.packageManager` pins `^11.9.0`; it auto-downloads on mismatch). Use `pnpm`, not `npm`/`yarn`.
- `package.json` `main` is `index.js` (not yet created). No real `test`/`build`/`lint` scripts are defined yet — the `test` script is still the placeholder stub. Add these as the project takes shape.

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
