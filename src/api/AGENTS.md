# src/api

ServiceNow Table API access layer: encoded-query builders, the HTTP client, table schema client, and schema service.

| File | Purpose |
|------|---------|
| `encoded-query.builder.ts` | Pure builders — `dateGenerate` (A2 date filters), `inClause` (A7 IN operator), `splitByUrlLimit` (OS-25 1800-char URL cap). No I/O. |
| `table-api.types.ts` | `RetryPolicy`, `SnAuth`, `ListOptions`, `SnRecord` types. |
| `table-schema.types.ts` | `SchemaElement` type representing a single column/field in a ServiceNow table (name, internal_type, max_length, booleans, optional reference fields). |
| `sn-http.client.ts` | `SnHttpClient`: shared HTTP transport for ServiceNow APIs. Handles basic-auth header generation (`authHeader`), instance URL normalization (`base`), and request sending with retry logic (`send`). Retries transient failures (network, ≥500, 429) per `RetryPolicy`; a 401 throws `AuthError` and is NEVER retried (OS-23); other failures throw `ConnectionError`. Defines `AuthError` and `ConnectionError` exception classes. |
| `table-api.client.ts` | `TableApiClient` (`list`/`getOne`/`patch`) delegating HTTP transport to `SnHttpClient` and encoding the spec's endpoint rules: versioned /api/now/v2/table paths and `Link` rel=next pagination (followed until exhausted by `list`; ignored by `test`). Re-exports `AuthError`, `ConnectionError`, `SnHttpClient` for backward compatibility. |
| `table-schema-api.client.ts` | `TableSchemaApiClient.fetchSchemaXml` — GET `${instance}/${table}.do?SCHEMA` and parse the XML response into `SchemaElement[]` via `fast-xml-parser`. Handles single-element normalization and reference-column coercion. |
| `table-schema.service.ts` | `TableSchemaService` — stateful service with an in-memory per-table cache. Provides `getSchema(tableName)` (cached access to `SchemaElement[]`) and `getUniqueColumnTypes(tableName)` (deduplicated types with tracked status resolved from project config). |
| `api.module.ts` | `ApiModule` NestJS wiring; imports `ConfigModule` and `AuthenticationModule` (never the reverse, to avoid DI cycles), provides and exports HTTP clients and schema services. |
| `__fixtures__/table-schema.xml` | Committed test fixture — XML schema of `sys_script_include` with 23 elements including reference columns. |
| `*.spec.ts` | Vitest cases — `table-schema-api.client.spec.ts` tests XML parsing, coercion, and reference-field handling; `table-schema.service.spec.ts` tests caching, deduplication, and tracked-type resolution. HTTP mocked with `nock`. |
