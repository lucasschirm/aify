/**
 * @file table-api.client.spec.ts
 * Tests for TableApiClient — list/getOne/patch, pagination, error handling, retry.
 */
import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthError, ConnectionError, TableApiClient } from './table-api.client';
import type { SnAuth } from './table-api.types';

const HOST = 'https://dev12345.service-now.com';
const auth: SnAuth = {
  instanceUrl: 'https://dev12345.service-now.com/',
  username: 'admin',
  password: 'secret',
};
const basic = `Basic ${Buffer.from('admin:secret').toString('base64')}`;

beforeEach(() => {
  nock.cleanAll();
});

afterEach(() => {
  if (!nock.isDone()) {
    throw new Error(`Not all nock interceptors were consumed: ${nock.pendingMocks()}`);
  }
});

describe('TableApiClient.list', () => {
  it('sends the exact query string with a Basic auth header', async () => {
    const scope = nock(HOST, { reqheaders: { authorization: basic } })
      .get('/api/now/v2/table/sys_metadata')
      .query({
        sysparm_query: 'sys_scope=abc',
        sysparm_fields: 'sys_id,sys_updated_on',
        sysparm_limit: '1',
      })
      .reply(200, { result: [{ sys_id: '1' }] });

    const client = new TableApiClient({ maxAttempts: 3, delayMs: 1 });
    const records = await client.list(auth, 'sys_metadata', {
      query: 'sys_scope=abc',
      fields: ['sys_id', 'sys_updated_on'],
      limit: 1,
    });

    expect(records).toEqual([{ sys_id: '1' }]);
    expect(scope.isDone()).toBe(true);
  });

  it('follows the Link rel="next" header until exhausted', async () => {
    const nextUrl = `${HOST}/api/now/v2/table/sys_metadata?sysparm_offset=1&sysparm_limit=1`;
    nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .query({ sysparm_limit: '1' })
      .reply(200, { result: [{ sys_id: '1' }] }, { Link: `<${nextUrl}>;rel="next"` });
    nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .query({ sysparm_offset: '1', sysparm_limit: '1' })
      .reply(200, { result: [{ sys_id: '2' }] });

    const client = new TableApiClient({ maxAttempts: 3, delayMs: 1 });
    const records = await client.list(auth, 'sys_metadata', { limit: 1 });

    expect(records).toEqual([{ sys_id: '1' }, { sys_id: '2' }]);
    expect(nock.pendingMocks()).toEqual([]);
  });
});

describe('TableApiClient.test', () => {
  it('sends a single request with sysparm_limit=1 and does NOT follow a Link rel="next"', async () => {
    // A rel="next" link is present but must be ignored — test() is a one-shot credential probe.
    const nextUrl = `${HOST}/api/now/v2/table/sys_metadata?sysparm_offset=1&sysparm_limit=1`;
    const scope = nock(HOST, { reqheaders: { authorization: basic } })
      .get('/api/now/v2/table/sys_metadata')
      .query({ sysparm_limit: '1' })
      .reply(200, { result: [{ sys_id: '1' }] }, { Link: `<${nextUrl}>;rel="next"` });

    const client = new TableApiClient({ maxAttempts: 3, delayMs: 1 });
    await client.test(auth);

    expect(scope.isDone()).toBe(true);
    // No second request was made despite the next link.
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('throws AuthError on 401 and never retries', async () => {
    const scope = nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .query({ sysparm_limit: '1' })
      .reply(401, { error: { message: 'User Not Authenticated' } });

    const client = new TableApiClient({ maxAttempts: 3, delayMs: 100 });

    await expect(client.test(auth)).rejects.toBeInstanceOf(AuthError);
    expect(scope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('throws ConnectionError when a transient 500 exhausts retries', async () => {
    nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .query({ sysparm_limit: '1' })
      .reply(500, { error: { message: 'boom' } });

    const client = new TableApiClient({ maxAttempts: 1, delayMs: 1 });

    await expect(client.test(auth)).rejects.toBeInstanceOf(ConnectionError);
    expect(nock.isDone()).toBe(true);
  });
});

describe('TableApiClient.getOne', () => {
  it('returns the record when found', async () => {
    nock(HOST, { reqheaders: { authorization: basic } })
      .get('/api/now/v2/table/sys_metadata/abcdef0123456789abcdef0123456789')
      .reply(200, { result: { sys_id: 'abcdef0123456789abcdef0123456789', label: 'Test' } });

    const client = new TableApiClient({ maxAttempts: 3, delayMs: 1 });
    const record = await client.getOne(auth, 'sys_metadata', 'abcdef0123456789abcdef0123456789');

    expect(record).toEqual({ sys_id: 'abcdef0123456789abcdef0123456789', label: 'Test' });
  });

  it('returns null when the server returns 404', async () => {
    // The server returns 404 which is NOT a transient error and NOT auth.
    // Since getOne's purpose is "get or null", treat not-found as null.
    nock(HOST, { reqheaders: { authorization: basic } })
      .get('/api/now/v2/table/sys_metadata/nonexistent')
      .reply(404);

    const client = new TableApiClient({ maxAttempts: 3, delayMs: 1 });
    const record = await client.getOne(auth, 'sys_metadata', 'nonexistent');

    expect(record).toBeNull();
  });
});

describe('TableApiClient.patch', () => {
  it('PATCHes columns and returns the updated record', async () => {
    nock(HOST, { reqheaders: { authorization: basic } })
      .patch('/api/now/v2/table/sys_metadata/abcdef0123456789abcdef0123456789')
      .reply(200, { result: { sys_id: 'abcdef0123456789abcdef0123456789', label: 'Updated' } });

    const client = new TableApiClient({ maxAttempts: 3, delayMs: 1 });
    const record = await client.patch(auth, 'sys_metadata', 'abcdef0123456789abcdef0123456789', {
      label: 'Updated',
    });

    expect(record).toEqual({ sys_id: 'abcdef0123456789abcdef0123456789', label: 'Updated' });
  });
});

describe('TableApiClient error handling', () => {
  it('throws AuthError on 401 and never retries', async () => {
    const scope = nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .query(true)
      .reply(401, { error: { message: 'User Not Authenticated' } });

    const client = new TableApiClient({ maxAttempts: 3, delayMs: 100 });

    await expect(client.list(auth, 'sys_metadata')).rejects.toBeInstanceOf(AuthError);
    expect(scope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('retries a transient 500 then succeeds within maxAttempts', async () => {
    nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .query(true)
      .reply(500, { error: { message: 'boom' } });
    nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .query(true)
      .reply(200, { result: [{ sys_id: '9' }] });

    const client = new TableApiClient({ maxAttempts: 3, delayMs: 1 });
    const records = await client.list(auth, 'sys_metadata');

    expect(records).toEqual([{ sys_id: '9' }]);
    expect(nock.isDone()).toBe(true);
  });

  it('throws ConnectionError for non-auth errors when maxAttempts exhausted', async () => {
    nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .query(true)
      .reply(500, { error: { message: 'boom' } });

    const client = new TableApiClient({ maxAttempts: 1, delayMs: 1 });

    await expect(client.list(auth, 'sys_metadata')).rejects.toBeInstanceOf(ConnectionError);
  });
});
