/**
 * Reusable HTTP-mock helpers for aify tests.
 *
 * Wraps `nock` so specs never hit a live ServiceNow instance. Provides Table API
 * list interceptors (with and without a paginated Link header) plus a reset hook.
 */
import nock from 'nock';

/** Intercept one Table API list request and reply 200 with `{ result }`. */
export function mockTableList(
  baseUrl: string,
  table: string,
  records: Record<string, string>[],
): nock.Scope {
  return nock(baseUrl)
    .get(new RegExp(`/api/now/v2/table/${table}`))
    .query(true)
    .reply(200, { result: records });
}

/** Like `mockTableList` but also sets a `Link` rel="next" header for pagination tests. */
export function mockTableListWithLink(
  baseUrl: string,
  table: string,
  records: Record<string, string>[],
  nextUrl: string,
): nock.Scope {
  return nock(baseUrl)
    .get(new RegExp(`/api/now/v2/table/${table}`))
    .query(true)
    .reply(200, { result: records }, { Link: `<${nextUrl}>;rel="next"` });
}

/** Remove every registered interceptor. Call in `afterEach`. */
export function resetHttpMocks(): void {
  nock.cleanAll();
}
