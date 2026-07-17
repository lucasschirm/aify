/**
 * @file auth.service.ts
 * @description Business logic for the `aify auth` command group. Verifies ServiceNow
 * credentials against the Table API before persisting anything, upserts the Instance and
 * Auth metadata rows, and stores the password in the OS keychain (OS-17). Alias is globally
 * unique and `is_current` is a global flag (OS-16).
 */
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { Sequelize } from 'sequelize-typescript';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { type SnAuth, TableApiClient } from '../api/table-api.client';
import { Auth } from '../database/models/auth.model';
import { Instance } from '../database/models/instance.model';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { SpinnerService } from '../ui/spinner.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { CredentialStore } from './credential-store.service';

/** Data captured by `aify auth add` before a connection is saved. */
export interface AuthInput {
  alias: string;
  instanceUrl: string;
  username: string;
  password: string;
}

/**
 * Split a user-supplied instance value into its unique host, a normalized full URL, and any
 * credentials embedded in the query string. `https://acme.service-now.com` and
 * `acme.service-now.com/` both yield `{ host: 'acme.service-now.com', url: 'https://acme.service-now.com/' }`.
 *
 * ServiceNow share URLs (e.g. `https://acme.service-now.com/login.do?user_name=admin&user_password=…`)
 * may carry `user_name` and/or `user_password` query params; when present they are decoded
 * (percent-encoding is resolved by `URLSearchParams`) and returned so callers can skip the
 * corresponding prompts. The normalized `url` never includes the query string. Either param
 * may be absent; the corresponding field is then omitted from the result.
 */
export function parseInstance(instanceUrl: string): {
  host: string;
  url: string;
  username?: string;
  password?: string;
} {
  const trimmed = instanceUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  const result: { host: string; url: string; username?: string; password?: string } = {
    host: parsed.host,
    url: `${parsed.protocol}//${parsed.host}/`,
  };
  const username = parsed.searchParams.get('user_name');
  const password = parsed.searchParams.get('user_password');
  if (username !== null) {
    result.username = username;
  }
  if (password !== null) {
    result.password = password;
  }
  return result;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly tableApi: TableApiClient,
    private readonly credentials: CredentialStore,
    // Injected for DI metadata; not referenced in this service yet.
    _sequelize: Sequelize,
    private readonly spinner: SpinnerService,
  ) {}

  /**
   * Verify credentials with a single non-paginating request to `sys_metadata`. Propagates
   * AuthError (401, never retried) and ConnectionError from the Table API client. Uses
   * `TableApiClient.test` (one row, no `Link rel="next"` following) — `list` would walk the
   * whole table one row at a time under `limit: 1` and appear to hang.
   */
  async testConnection(snAuth: SnAuth): Promise<void> {
    this.spinner.start('Testing connection…');
    try {
      await this.tableApi.test(snAuth);
      this.spinner.succeed('Connection verified.');
    } catch (err) {
      this.spinner.fail('Connection failed.');
      throw err;
    }
  }

  /**
   * Test the connection, then (only on success) upsert the Instance, upsert the Auth metadata
   * row, mark it current, refresh lastUsedAt, and store the password in the OS keychain.
   * Rejects an existing alias unless `force` is true. Nothing is persisted on auth failure.
   */
  async add(input: AuthInput, force = false): Promise<Auth> {
    const { host, url } = parseInstance(input.instanceUrl);

    // 1. Verify BEFORE writing anything. A 401 throws AuthError and aborts (nothing saved).
    await this.testConnection({
      instanceUrl: url,
      username: input.username,
      password: input.password,
    });

    // 2. Reject a duplicate alias unless the caller passed --force.
    const existing = await Auth.findOne({ where: { alias: input.alias } });
    if (existing && !force) {
      throw new Error(`Alias "${input.alias}" already exists. Use --force to overwrite.`);
    }

    // 3. Upsert the instance (host is unique).
    const [instance] = await Instance.findOrCreate({
      where: { instance: host },
      defaults: { instance: host, url },
    });

    // 4. Upsert the Auth metadata row and mark it current (the hook clears the others).
    const now = new Date();
    let auth: Auth;
    if (existing) {
      existing.username = input.username;
      existing.instanceId = instance.id;
      existing.isCurrent = true;
      existing.lastUsedAt = now;
      auth = await existing.save();
    } else {
      auth = await Auth.create({
        alias: input.alias,
        username: input.username,
        instanceId: instance.id,
        isCurrent: true,
        lastUsedAt: now,
      });
    }

    // 5. Store the password in the OS keychain — never in the database (OS-17).
    await this.credentials.setPassword(input.alias, input.password);
    return auth;
  }

  /**
   * Return the globally-current Auth together with an SnAuth built from its Instance URL and
   * the keychain password. Returns null when no current row exists or its password is missing.
   */
  async current(): Promise<{ auth: Auth; snAuth: SnAuth } | null> {
    const auth = await Auth.findOne({ where: { isCurrent: true } });
    if (!auth) {
      return null;
    }
    const password = await this.credentials.getPassword(auth.alias);
    if (password === null) {
      return null;
    }
    const instance = await Instance.findByPk(auth.instanceId);
    if (!instance) {
      return null;
    }
    const snAuth: SnAuth = {
      instanceUrl: instance.url,
      username: auth.username,
      password,
    };
    return { auth, snAuth };
  }

  /** Return every saved connection (order by alias). */
  async list(): Promise<Auth[]> {
    return Auth.findAll({ order: [['alias', 'ASC']] });
  }

  /** Delete an alias's metadata row and the keychain password. */
  async remove(alias: string): Promise<void> {
    const auth = await Auth.findOne({ where: { alias } });
    if (!auth) {
      throw new Error(`Alias "${alias}" not found.`);
    }
    await auth.destroy();
    await this.credentials.deletePassword(alias);
  }

  /** Promote an alias to the single global current connection (the model hook clears others). */
  async setCurrent(alias: string): Promise<Auth> {
    const auth = await Auth.findOne({ where: { alias } });
    if (!auth) {
      throw new Error(`Alias "${alias}" not found.`);
    }
    auth.isCurrent = true;
    return auth.save();
  }
}
