/**
 * @file table-api.client.ts
 * ServiceNow Table API HTTP client over Node's global fetch (basic auth). Encodes the spec's
 * endpoint rules: versioned /api/now/v2/table paths, Link rel=next pagination, and (added in
 * later cycles) RetryPolicy-driven retry with a never-retried 401 (OS-23).
 */
import { Optional } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { GlobalConfigService } from '../config/global/global-config.service';
import type { ListOptions, RetryPolicy, SnAuth, SnRecord } from './table-api.types';

export type { SnAuth, SnRecord } from './table-api.types';

const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 3, delayMs: 2000 };

/** Raised on a 401. NEVER retried (OS-23) — credentials are wrong, retrying risks a lockout. */
export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

/** Raised on a non-auth request/network failure. Retried per RetryPolicy. */
export class ConnectionError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ConnectionError';
    this.status = status;
  }
}

export class TableApiClient {
  constructor(
    @Optional() private readonly retry: RetryPolicy = DEFAULT_RETRY,
    @Optional() private readonly globalConfig?: GlobalConfigService,
  ) {}

  /** GET a list of records, following Link rel="next" pagination until exhausted. */
  async list(auth: SnAuth, table: string, options: ListOptions = {}): Promise<SnRecord[]> {
    const params = new URLSearchParams();
    if (options.query) params.set('sysparm_query', options.query);
    if (options.fields?.length) params.set('sysparm_fields', options.fields.join(','));
    if (options.limit !== undefined) params.set('sysparm_limit', String(options.limit));
    const query = params.toString();
    let url: string | undefined =
      `${this.base(auth)}/api/now/v2/table/${table}${query ? `?${query}` : ''}`;
    const records: SnRecord[] = [];
    while (url) {
      const response = await this.send(auth, url, { method: 'GET' });
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
    const url = `${this.base(auth)}/api/now/v2/table/${table}?sysparm_limit=1`;
    await this.send(auth, url, { method: 'GET' });
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
    const url = `${this.base(auth)}/api/now/v2/table/${table}/${sysId}${query ? `?${query}` : ''}`;
    const headers = {
      Authorization: this.authHeader(auth),
      Accept: 'application/json',
    };
    let lastError: ConnectionError | undefined;
    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt += 1) {
      let response: Response;
      await this.globalConfig?.debug(`GET ${url}`);
      try {
        response = await fetch(url, { method: 'GET', headers });
      } catch (cause) {
        await this.globalConfig?.debug(`→ network error ${url}: ${(cause as Error).message}`);
        lastError = new ConnectionError((cause as Error).message);
        break;
      }
      await this.globalConfig?.debug(`→ ${response.status} ${url}`);
      if (response.status === 401) {
        throw new AuthError('Authentication failed (401). Check the username and password.');
      }
      if (response.status === 404) return null; // not found = null
      if (this.isTransient(response.status)) {
        if (attempt < this.retry.maxAttempts) {
          await this.delay(this.retry.delayMs);
          continue;
        }
        throw new ConnectionError(
          `Request failed with status ${response.status}.`,
          response.status,
        );
      }
      if (!response.ok) {
        throw new ConnectionError(
          `Request failed with status ${response.status}.`,
          response.status,
        );
      }
      const body = (await response.json()) as { result?: SnRecord };
      return body.result ?? null;
    }
    throw lastError ?? new ConnectionError('Request failed.');
  }

  /** PATCH the given columns of a record and return the updated record. */
  async patch(
    auth: SnAuth,
    table: string,
    sysId: string,
    body: Record<string, string>,
  ): Promise<SnRecord> {
    const url = `${this.base(auth)}/api/now/v2/table/${table}/${sysId}`;
    const response = await this.send(auth, url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as { result: SnRecord };
    return json.result;
  }

  private base(auth: SnAuth): string {
    return auth.instanceUrl.replace(/\/+$/, '');
  }

  private authHeader(auth: SnAuth): string {
    const token = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    return `Basic ${token}`;
  }

  private nextLink(header: string | null): string | undefined {
    if (!header) return undefined;
    for (const part of header.split(',')) {
      const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
      if (match && match[2] === 'next') return match[1];
    }
    return undefined;
  }

  private async send(auth: SnAuth, url: string, init: RequestInit): Promise<Response> {
    const headers = {
      Authorization: this.authHeader(auth),
      Accept: 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    const method = init.method ?? 'GET';
    let lastError: ConnectionError | undefined;
    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt += 1) {
      let response: Response;
      await this.globalConfig?.debug(`${method} ${url}`);
      try {
        response = await fetch(url, { ...init, headers });
      } catch (cause) {
        await this.globalConfig?.debug(`→ network error ${url}: ${(cause as Error).message}`);
        lastError = new ConnectionError((cause as Error).message);
        if (attempt < this.retry.maxAttempts) {
          await this.delay(this.retry.delayMs);
          continue;
        }
        throw lastError;
      }
      await this.globalConfig?.debug(`→ ${response.status} ${url}`);
      if (response.status === 401) {
        throw new AuthError('Authentication failed (401). Check the username and password.');
      }
      if (this.isTransient(response.status)) {
        lastError = new ConnectionError(
          `Request failed with status ${response.status}.`,
          response.status,
        );
        if (attempt < this.retry.maxAttempts) {
          await this.delay(this.retry.delayMs);
          continue;
        }
        throw lastError;
      }
      if (!response.ok) {
        throw new ConnectionError(
          `Request failed with status ${response.status}.`,
          response.status,
        );
      }
      return response;
    }
    throw lastError ?? new ConnectionError('Request failed.');
  }

  private isTransient(status: number): boolean {
    return status >= 500 || status === 429;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
