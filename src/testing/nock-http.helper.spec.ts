import { afterEach, describe, expect, it } from 'vitest';
import { mockTableList, mockTableListWithLink, resetHttpMocks } from './nock-http.helper';

const BASE = 'https://dev00001.service-now.com';

afterEach(() => {
  resetHttpMocks();
});

describe('nock-http helper', () => {
  it('intercepts a Table API list request and returns the mocked result', async () => {
    mockTableList(BASE, 'sys_scope', [{ sys_id: 'abc123', scope: 'x_test_app' }]);

    const res = await fetch(`${BASE}/api/now/v2/table/sys_scope?sysparm_limit=1`);
    const body = (await res.json()) as { result: Array<Record<string, string>> };

    expect(res.status).toBe(200);
    expect(body.result).toHaveLength(1);
    expect(body.result[0].sys_id).toBe('abc123');
  });

  it('sets a Link rel="next" header for pagination tests', async () => {
    const next = `${BASE}/api/now/v2/table/sys_scope?sysparm_offset=1`;
    mockTableListWithLink(BASE, 'sys_scope', [{ sys_id: 'p1' }], next);

    const res = await fetch(`${BASE}/api/now/v2/table/sys_scope`);

    expect(res.headers.get('link')).toContain('rel="next"');
  });
});
