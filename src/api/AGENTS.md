# src/api

ServiceNow Table API access layer: encoded-query builders and the HTTP client.

| File | Purpose |
|------|---------|
| `encoded-query.builder.ts` | Pure builders — `dateGenerate` (A2 date filters), `inClause` (A7 IN operator), `splitByUrlLimit` (OS-25 1800-char URL cap). No I/O. |
| `table-api.types.ts` | `RetryPolicy`, `SnAuth`, `ListOptions`, `SnRecord` types. |
| `table-api.client.ts` | `TableApiClient` (`list`/`getOne`/`patch`) over Node `fetch` + basic auth. `list` follows `Link` rel=next pagination. Transient failures (network, ≥500, 429) retry per `RetryPolicy`; a 401 throws `AuthError` and is NEVER retried (OS-23); other failures throw `ConnectionError`. |
| `*.spec.ts` | Vitest cases — exact encoded-query strings, exact request query, pagination chain, 401 no-retry, 500-then-success retry (HTTP mocked with `nock`). |
