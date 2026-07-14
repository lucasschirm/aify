# src/api

ServiceNow Table API access layer: encoded-query builders and the HTTP client.

| File | Purpose |
|------|---------|
| `encoded-query.builder.ts` | Pure builders — `dateGenerate` (A2 date filters), `inClause` (A7 IN operator), `splitByUrlLimit` (OS-25 1800-char URL cap). No I/O. |
| `encoded-query.builder.spec.ts` | Vitest cases asserting exact encoded-query strings and URL splitting. |

> `table-api.client.ts` / `table-api.types.ts` are added in TASK_016; update this file then.
