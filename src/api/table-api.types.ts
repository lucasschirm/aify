/**
 * @file table-api.types.ts
 * Shared types for the ServiceNow Table API client: retry policy, basic-auth credentials,
 * list options, and the string-map record shape returned by the Table API.
 */

/** Transient-error retry policy (spec network.retry, OS-23). */
export interface RetryPolicy {
  maxAttempts: number;
  delayMs: number;
}

/** Basic-auth connection details. `instanceUrl` is the full base URL (trailing slash allowed). */
export interface SnAuth {
  instanceUrl: string;
  username: string;
  password: string;
}

/** Options for a Table API list request. */
export interface ListOptions {
  query?: string;
  fields?: string[];
  limit?: number;
}

/** A Table API record — ServiceNow returns every field as a string. */
export type SnRecord = Record<string, string>;
