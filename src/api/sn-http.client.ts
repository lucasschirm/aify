/**
 * @file sn-http.client.ts
 * Shared HTTP transport layer for ServiceNow API clients. Encodes the spec's
 * basic-auth header generation, retry policy (never-retry 401 per OS-23), and
 * error mapping (401→AuthError, transient/non-ok→ConnectionError, network→ConnectionError).
 */
import { Injectable, Optional } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { GlobalConfigService } from '../config/global/global-config.service';
import type { RetryPolicy, SnAuth } from './table-api.types';

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

/**
 * Shared HTTP client for ServiceNow APIs. Handles basic-auth header generation,
 * retry logic (transient failures retried, 401 never retried), and error mapping.
 * Uses Node's global fetch and accepts init.headers overrides (e.g., Content-Type,
 * custom Accept).
 */
@Injectable()
export class SnHttpClient {
  constructor(
    @Optional() private readonly retry: RetryPolicy = DEFAULT_RETRY,
    @Optional() private readonly globalConfig?: GlobalConfigService,
  ) {}

  /**
   * Generate the HTTP Basic auth header for ServiceNow credentials.
   * @param auth - ServiceNow authentication (instanceUrl, username, password).
   * @returns The Authorization header value (e.g., "Basic YWRtaW46c2VjcmV0").
   */
  authHeader(auth: SnAuth): string {
    const token = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    return `Basic ${token}`;
  }

  /**
   * Strip trailing slashes from the instance URL for use as the request base.
   * @param auth - ServiceNow authentication.
   * @returns The trimmed instanceUrl.
   */
  base(auth: SnAuth): string {
    return auth.instanceUrl.replace(/\/+$/, '');
  }

  /**
   * Send an HTTP request with basic auth, retry logic, and error mapping.
   *
   * Behavior:
   * - Defaults to GET method; uses init.method if provided.
   * - Merges init.headers with default Accept: application/json (overridable).
   * - Adds Authorization header with Basic auth credentials.
   * - On 401: throws AuthError immediately (never retried).
   * - On transient (≥500 or 429): retries up to maxAttempts, then throws ConnectionError.
   * - On network error: retries up to maxAttempts, then throws ConnectionError.
   * - On other non-ok status: throws ConnectionError (no retry).
   * - On ok (2xx): returns the Response.
   *
   * @param auth - ServiceNow credentials.
   * @param url - Full URL to request.
   * @param init - RequestInit (method, headers, body, etc.).
   * @returns The Response on success.
   * @throws AuthError on 401 (never retried).
   * @throws ConnectionError on network errors or non-auth HTTP failures.
   */
  async send(auth: SnAuth, url: string, init: RequestInit): Promise<Response> {
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

  /**
   * Check if a status code indicates a transient error that should be retried.
   * @param status - HTTP status code.
   * @returns True if status ≥ 500 or status === 429.
   */
  private isTransient(status: number): boolean {
    return status >= 500 || status === 429;
  }

  /**
   * Sleep for the given number of milliseconds.
   * @param ms - Delay in milliseconds.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
