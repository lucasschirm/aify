/**
 * @file sn-http.client.spec.ts
 * Tests for SnHttpClient — basic auth, retry logic, error handling (401 never retried,
 * transient/non-ok errors, network errors).
 */
import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthError, ConnectionError, SnHttpClient } from './sn-http.client';
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

describe('SnHttpClient.authHeader', () => {
  it('generates the correct Basic auth header', () => {
    const client = new SnHttpClient({ maxAttempts: 3, delayMs: 1 });
    const header = client.authHeader(auth);

    expect(header).toBe(basic);
  });

  it('handles different credentials', () => {
    const client = new SnHttpClient({ maxAttempts: 3, delayMs: 1 });
    const altAuth: SnAuth = {
      instanceUrl: 'https://dev.service-now.com/',
      username: 'testuser',
      password: 'testpass',
    };
    const altBasic = `Basic ${Buffer.from('testuser:testpass').toString('base64')}`;

    expect(client.authHeader(altAuth)).toBe(altBasic);
  });
});

describe('SnHttpClient.base', () => {
  it('strips trailing slashes from the instance URL', () => {
    const client = new SnHttpClient({ maxAttempts: 3, delayMs: 1 });

    expect(client.base(auth)).toBe('https://dev12345.service-now.com');
  });

  it('handles URL with multiple trailing slashes', () => {
    const client = new SnHttpClient({ maxAttempts: 3, delayMs: 1 });
    const authWithSlashes: SnAuth = {
      instanceUrl: 'https://dev12345.service-now.com///',
      username: 'admin',
      password: 'secret',
    };

    expect(client.base(authWithSlashes)).toBe('https://dev12345.service-now.com');
  });

  it('handles URL without trailing slash', () => {
    const client = new SnHttpClient({ maxAttempts: 3, delayMs: 1 });
    const authNoSlash: SnAuth = {
      instanceUrl: 'https://dev12345.service-now.com',
      username: 'admin',
      password: 'secret',
    };

    expect(client.base(authNoSlash)).toBe('https://dev12345.service-now.com');
  });
});

describe('SnHttpClient.send', () => {
  it('sends the Basic auth header and returns the Response on 200', async () => {
    const scope = nock(HOST, { reqheaders: { authorization: basic } })
      .get('/api/now/v2/table/sys_metadata')
      .reply(200, { result: [{ sys_id: '1' }] });

    const client = new SnHttpClient({ maxAttempts: 3, delayMs: 1 });
    const response = await client.send(auth, `${HOST}/api/now/v2/table/sys_metadata`, {
      method: 'GET',
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as { result: Array<{ sys_id: string }> };
    expect(json.result[0].sys_id).toBe('1');
    expect(scope.isDone()).toBe(true);
  });

  it('retries a transient 500 then succeeds within maxAttempts', async () => {
    nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .reply(500, { error: { message: 'boom' } });
    nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .reply(200, { result: [{ sys_id: '9' }] });

    const client = new SnHttpClient({ maxAttempts: 3, delayMs: 1 });
    const response = await client.send(auth, `${HOST}/api/now/v2/table/sys_metadata`, {
      method: 'GET',
    });

    expect(response.status).toBe(200);
    expect(nock.isDone()).toBe(true);
  });

  it('throws AuthError on 401 and does NOT retry', async () => {
    const scope = nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .reply(401, { error: { message: 'User Not Authenticated' } });

    const client = new SnHttpClient({ maxAttempts: 3, delayMs: 100 });

    await expect(
      client.send(auth, `${HOST}/api/now/v2/table/sys_metadata`, { method: 'GET' }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(scope.isDone()).toBe(true);
    // Single interceptor consumed; no retries attempted.
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('throws ConnectionError when a 500 exhausts retries', async () => {
    nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .reply(500, { error: { message: 'boom' } });

    const client = new SnHttpClient({ maxAttempts: 1, delayMs: 1 });

    await expect(
      client.send(auth, `${HOST}/api/now/v2/table/sys_metadata`, { method: 'GET' }),
    ).rejects.toBeInstanceOf(ConnectionError);
    expect(nock.isDone()).toBe(true);
  });

  it('throws ConnectionError on non-transient non-ok status (e.g., 400)', async () => {
    nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .reply(400, { error: { message: 'Bad request' } });

    const client = new SnHttpClient({ maxAttempts: 3, delayMs: 1 });

    await expect(
      client.send(auth, `${HOST}/api/now/v2/table/sys_metadata`, { method: 'GET' }),
    ).rejects.toBeInstanceOf(ConnectionError);
  });

  it('honors an overridden Accept header via init.headers', async () => {
    const scope = nock(HOST, {
      reqheaders: { accept: 'application/xml', authorization: basic },
    })
      .get('/api/now/v2/table/sys_metadata')
      .reply(200, '<result/>');

    const client = new SnHttpClient({ maxAttempts: 3, delayMs: 1 });
    const response = await client.send(auth, `${HOST}/api/now/v2/table/sys_metadata`, {
      method: 'GET',
      headers: { Accept: 'application/xml' },
    });

    expect(response.status).toBe(200);
    expect(scope.isDone()).toBe(true);
  });

  it('includes Content-Type and body for PATCH requests', async () => {
    const scope = nock(HOST, {
      reqheaders: { authorization: basic, 'content-type': 'application/json' },
    })
      .patch('/api/now/v2/table/sys_metadata/abcdef', JSON.stringify({ label: 'Updated' }))
      .reply(200, { result: { sys_id: 'abcdef', label: 'Updated' } });

    const client = new SnHttpClient({ maxAttempts: 3, delayMs: 1 });
    const response = await client.send(auth, `${HOST}/api/now/v2/table/sys_metadata/abcdef`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Updated' }),
    });

    expect(response.status).toBe(200);
    expect(scope.isDone()).toBe(true);
  });

  it('throws ConnectionError on network error', async () => {
    // nock will throw a network error if no interceptor matches.
    const client = new SnHttpClient({ maxAttempts: 1, delayMs: 1 });

    // Explicitly use nock to throw a network error by not mocking the request.
    nock.disableNetConnect();
    await expect(
      client.send(auth, `${HOST}/api/now/v2/table/sys_metadata`, { method: 'GET' }),
    ).rejects.toBeInstanceOf(ConnectionError);
    nock.enableNetConnect();
  });

  it('retries on transient 429 (rate-limit) error', async () => {
    nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .reply(429, { error: { message: 'Rate limited' } });
    nock(HOST)
      .get('/api/now/v2/table/sys_metadata')
      .reply(200, { result: [{ sys_id: '5' }] });

    const client = new SnHttpClient({ maxAttempts: 3, delayMs: 1 });
    const response = await client.send(auth, `${HOST}/api/now/v2/table/sys_metadata`, {
      method: 'GET',
    });

    expect(response.status).toBe(200);
    expect(nock.isDone()).toBe(true);
  });

  it('retries on network error then succeeds within maxAttempts', async () => {
    // First request throws a network error, second succeeds
    nock(HOST).get('/x').replyWithError('Network error');
    nock(HOST).get('/x').reply(200, { ok: true });

    const client = new SnHttpClient({ maxAttempts: 3, delayMs: 1 });
    const response = await client.send(auth, `${HOST}/x`, { method: 'GET' });

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(nock.isDone()).toBe(true);
  });

  it('throws ConnectionError when network error exhausts maxAttempts', async () => {
    nock(HOST).get('/x').replyWithError('Network error');

    const client = new SnHttpClient({ maxAttempts: 1, delayMs: 1 });

    await expect(client.send(auth, `${HOST}/x`, { method: 'GET' })).rejects.toBeInstanceOf(
      ConnectionError,
    );
  });
});
