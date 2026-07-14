# src/testing/

Reusable test harness shared by every spec. Not shipped to end users at runtime
(excluded from coverage where appropriate), but lives under `src/` so specs import it
with relative paths and it is type-checked with the rest of the source.

## Files
- `nock-http.helper.ts` — `mockTableList`, `mockTableListWithLink`, `resetHttpMocks`:
  intercept ServiceNow Table API requests so tests never hit a live instance.
- `sqlite-test.helper.ts` — `createInMemorySequelize`, `bootstrapTestDb`: spin up an
  isolated in-memory SQLite Sequelize for database tests.

## Conventions
- HTTP is always mocked with nock; DB tests always use `:memory:`.
- Call `resetHttpMocks()` / `sequelize.close()` in `afterEach`.