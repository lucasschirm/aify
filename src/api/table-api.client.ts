/**
 * @file table-api.client.ts
 * ServiceNow Table API client with list/getOne/patch methods. Delegates HTTP transport
 * (basic auth, retry logic, error mapping) to SnHttpClient and encodes the spec's
 * endpoint rules: versioned /api/now/v2/table paths, Link rel=next pagination, and
 * never-retried 401 (OS-23).
 */
import { Optional } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { GlobalConfigService } from '../config/global/global-config.service';
import { ConnectionError, SnHttpClient } from './sn-http.client';
import type { ListOptions, RetryPolicy, SnAuth, SnRecord } from './table-api.types';

export { AuthError, ConnectionError, SnHttpClient } from './sn-http.client';
export type { SnAuth, SnRecord } from './table-api.types';

const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 3, delayMs: 2000 };

export class TableApiClient {
  private readonly snHttp: SnHttpClient;

  constructor(
    @Optional() retry: RetryPolicy = DEFAULT_RETRY,
    @Optional() globalConfig?: GlobalConfigService,
    @Optional() snHttp?: SnHttpClient,
  ) {
    this.snHttp = snHttp ?? new SnHttpClient(retry, globalConfig);
  }

  /** GET a list of records, following Link rel="next" pagination until exhausted. */
  async list(auth: SnAuth, table: string, options: ListOptions = {}): Promise<SnRecord[]> {
    const params = new URLSearchParams();
    if (options.query) params.set('sysparm_query', options.query);
    if (options.fields?.length) params.set('sysparm_fields', options.fields.join(','));
    if (options.limit !== undefined) params.set('sysparm_limit', String(options.limit));
    const query = params.toString();
    let url: string | undefined =
      `${this.snHttp.base(auth)}/api/now/v2/table/${table}${query ? `?${query}` : ''}`;
    const records: SnRecord[] = [];
    while (url) {
      const response = await this.snHttp.send(auth, url, { method: 'GET' });
      const body = (await response.json()) as { result: SnRecord[] };
      records.push(...body.result);
      url = this.nextLink(response.headers.get('link'));
    }
    return records;
  }

  /**
   * Verify credentials with a SINGLE lightweight request (`sysparm_limit=1`) and NO
   * pagination following. Use this for `auth add`/`auth update` connection tests — never
   * `list`, which follows `Link rel="next"` until exhausted and would walk every row in the
   * table one at a time when `limit: 1` is set. Propagates `AuthError` (401, never retried)
   * and `ConnectionError` (network/transient/non-auth HTTP failures) from `send`.
   */
  async test(auth: SnAuth, table = 'sys_metadata'): Promise<void> {
    const url = `${this.snHttp.base(auth)}/api/now/v2/table/${table}?sysparm_limit=1`;
    await this.snHttp.send(auth, url, { method: 'GET' });
  }

  async getOne(
    auth: SnAuth,
    table: string,
    sysId: string,
    fields?: string[],
  ): Promise<SnRecord | null> {
    const params = new URLSearchParams();
    if (fields?.length) params.set('sysparm_fields', fields.join(','));
    const query = params.toString();
    const url = `${this.snHttp.base(auth)}/api/now/v2/table/${table}/${sysId}${query ? `?${query}` : ''}`;
    try {
      const response = await this.snHttp.send(auth, url, { method: 'GET' });
      const body = (await response.json()) as { result?: SnRecord };
      return body.result ?? null;
    } catch (err) {
      if (err instanceof ConnectionError && err.status === 404) return null;
      throw err;
    }
  }

  /** PATCH the given columns of a record and return the updated record. */
  async patch(
    auth: SnAuth,
    table: string,
    sysId: string,
    body: Record<string, string>,
  ): Promise<SnRecord> {
    const url = `${this.snHttp.base(auth)}/api/now/v2/table/${table}/${sysId}`;
    const response = await this.snHttp.send(auth, url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as { result: SnRecord };
    return json.result;
  }

  private nextLink(header: string | null): string | undefined {
    if (!header) return undefined;
    for (const part of header.split(',')) {
      const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
      if (match && match[2] === 'next') return match[1];
    }
    return undefined;
  }
}
