/**
 * @file auth.service.spec.ts
 * Tests for AuthService — testConnection, add, current. Uses in-memory SQLite,
 * mocked TableApiClient and CredentialStore.
 */

import { Sequelize } from 'sequelize-typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, type SnAuth, type TableApiClient } from '../api/table-api.client';
import { Auth } from '../database/models/auth.model';
import { Instance } from '../database/models/instance.model';
import type { SpinnerService } from '../ui/spinner.service';
import { AuthService, parseInstance } from './auth.service';
import type { CredentialStore } from './credential-store.service';

describe('parseInstance', () => {
  it('derives the host and a normalized trailing-slash URL', () => {
    expect(parseInstance('https://acme.service-now.com')).toEqual({
      host: 'acme.service-now.com',
      url: 'https://acme.service-now.com/',
    });
  });

  it('defaults to https when no protocol is given', () => {
    expect(parseInstance('acme.service-now.com/')).toEqual({
      host: 'acme.service-now.com',
      url: 'https://acme.service-now.com/',
    });
  });

  it('extracts user_name and user_password from the query string and strips them from url', () => {
    expect(
      parseInstance(
        'https://dev408698.service-now.com/login.do?user_name=admin&sys_action=sysverb_login&user_password=Ss%2F*C7LvHn4o',
      ),
    ).toEqual({
      host: 'dev408698.service-now.com',
      url: 'https://dev408698.service-now.com/',
      username: 'admin',
      password: 'Ss/*C7LvHn4o',
    });
  });

  it('extracts only user_name when user_password is absent', () => {
    expect(parseInstance('https://acme.service-now.com/login.do?user_name=admin')).toEqual({
      host: 'acme.service-now.com',
      url: 'https://acme.service-now.com/',
      username: 'admin',
    });
  });

  it('extracts only user_password when user_name is absent', () => {
    expect(parseInstance('https://acme.service-now.com/login.do?user_password=p%40ss')).toEqual({
      host: 'acme.service-now.com',
      url: 'https://acme.service-now.com/',
      password: 'p@ss',
    });
  });

  it('omits username/password when neither query param is present', () => {
    expect(parseInstance('https://acme.service-now.com/some/path')).toEqual({
      host: 'acme.service-now.com',
      url: 'https://acme.service-now.com/',
    });
  });
});

describe('AuthService', () => {
  let sequelize: Sequelize;
  let tableApi: { test: ReturnType<typeof vi.fn> };
  let credentials: {
    setPassword: ReturnType<typeof vi.fn>;
    getPassword: ReturnType<typeof vi.fn>;
    deletePassword: ReturnType<typeof vi.fn>;
  };
  let service: AuthService;

  const input = {
    alias: 'prod',
    instanceUrl: 'https://acme.service-now.com',
    username: 'admin',
    password: 's3cret',
  };

  beforeEach(async () => {
    sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false,
      models: [Instance, Auth],
    });
    await sequelize.sync({ force: true });
    tableApi = { test: vi.fn().mockResolvedValue(undefined) };
    credentials = { setPassword: vi.fn(), getPassword: vi.fn(), deletePassword: vi.fn() };
    const spinner = {
      start: vi.fn(),
      text: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      info: vi.fn(),
      stop: vi.fn(),
    };
    service = new AuthService(
      tableApi as unknown as TableApiClient,
      credentials as unknown as CredentialStore,
      sequelize,
      spinner as unknown as SpinnerService,
    );
  });

  it('testConnection issues a single non-paginating probe to sys_metadata', async () => {
    const snAuth: SnAuth = {
      instanceUrl: 'https://acme.service-now.com/',
      username: 'admin',
      password: 's3cret',
    };
    await service.testConnection(snAuth);
    expect(tableApi.test).toHaveBeenCalledWith(snAuth);
  });

  it('saves the auth row, the instance host, and the keychain password on success', async () => {
    const auth = await service.add(input);

    expect(tableApi.test).toHaveBeenCalledWith({
      instanceUrl: 'https://acme.service-now.com/',
      username: 'admin',
      password: 's3cret',
    });
    expect(auth.alias).toBe('prod');
    expect(auth.username).toBe('admin');
    expect(auth.isCurrent).toBe(true);
    expect(auth.lastUsedAt).toBeInstanceOf(Date);

    const instance = await Instance.findOne({ where: { instance: 'acme.service-now.com' } });
    expect(instance?.url).toBe('https://acme.service-now.com/');
    expect(auth.instanceId).toBe(instance?.id);

    expect(credentials.setPassword).toHaveBeenCalledWith('prod', 's3cret');
    expect(await Auth.count()).toBe(1);
    expect(await Instance.count()).toBe(1);
  });

  it('saves nothing when authentication fails (401)', async () => {
    const err = new AuthError('Unauthorized');
    err.status = 401;
    tableApi.test.mockRejectedValue(err);

    await expect(service.add(input)).rejects.toBeInstanceOf(AuthError);
    expect(await Auth.count()).toBe(0);
    expect(await Instance.count()).toBe(0);
    expect(credentials.setPassword).not.toHaveBeenCalled();
  });

  it('rejects a duplicate alias without --force and overwrites with --force', async () => {
    await service.add(input);
    await expect(service.add({ ...input, username: 'other' })).rejects.toThrow(/already exists/);

    const updated = await service.add({ ...input, username: 'other' }, true);
    expect(updated.username).toBe('other');
    expect(await Auth.count()).toBe(1);
    expect(credentials.setPassword).toHaveBeenLastCalledWith('prod', 's3cret');
  });

  it('current() returns the current auth, its instance URL, and the keychain password', async () => {
    await service.add(input);
    credentials.getPassword.mockResolvedValue('s3cret');

    const result = await service.current();
    expect(result?.auth.alias).toBe('prod');
    expect(result?.snAuth).toEqual({
      instanceUrl: 'https://acme.service-now.com/',
      username: 'admin',
      password: 's3cret',
    });
  });

  it('current() returns null when there is no current connection', async () => {
    expect(await service.current()).toBeNull();
  });

  describe('getSnAuth', () => {
    it('returns SnAuth for the current connection when no alias is passed', async () => {
      await service.add(input);
      credentials.getPassword.mockResolvedValue('s3cret');

      const result = await service.getSnAuth();
      expect(result?.auth.alias).toBe('prod');
      expect(result?.snAuth).toEqual({
        instanceUrl: 'https://acme.service-now.com/',
        username: 'admin',
        password: 's3cret',
      });
    });

    it('returns SnAuth for the named alias when one is passed', async () => {
      await service.add(input);
      await service.add({ ...input, alias: 'dev' });
      credentials.getPassword.mockResolvedValue('s3cret');

      const result = await service.getSnAuth('dev');
      expect(result?.auth.alias).toBe('dev');
      expect(result?.snAuth).toEqual({
        instanceUrl: 'https://acme.service-now.com/',
        username: 'admin',
        password: 's3cret',
      });
    });

    it('throws "Alias not found" for an unknown alias', async () => {
      await expect(service.getSnAuth('ghost')).rejects.toThrow('Alias "ghost" not found.');
    });

    it('throws an actionable message when there is no current connection', async () => {
      await expect(service.getSnAuth()).rejects.toThrow(/No current connection/);
    });

    it('throws when the keychain password is missing', async () => {
      await service.add(input);
      credentials.getPassword.mockResolvedValue(null);

      await expect(service.getSnAuth()).rejects.toThrow(/No password stored in the keychain/);
    });
  });

  it('update() persists a username change', async () => {
    await service.add(input);

    const updated = await service.update('prod', { username: 'newadmin' });

    expect(updated.username).toBe('newadmin');
    const reloaded = await Auth.findOne({ where: { alias: 'prod' } });
    expect(reloaded?.username).toBe('newadmin');
  });

  it('update() throws for an unknown alias', async () => {
    await expect(service.update('ghost', { username: 'x' })).rejects.toThrow(/not found/);
  });

  it('update() with an empty password does not touch the keychain', async () => {
    await service.add(input);
    credentials.setPassword.mockClear();

    await service.update('prod', { username: 'admin', password: '' });

    expect(credentials.setPassword).not.toHaveBeenCalled();
  });

  it('update() with a new password writes it to the keychain', async () => {
    await service.add(input);
    credentials.setPassword.mockClear();

    await service.update('prod', { password: 'rotated' });

    expect(credentials.setPassword).toHaveBeenCalledWith('prod', 'rotated');
  });

  describe('getSnAuth remaining branches', () => {
    it('throws when the Instance row is missing for an alias', async () => {
      await service.add(input);
      // Disable foreign key constraints temporarily and set instanceId to a non-existent value
      await sequelize.query('PRAGMA foreign_keys = OFF');
      try {
        const auth = await Auth.findOne({ where: { alias: 'prod' } });
        if (auth) {
          auth.instanceId = 99999;
          await auth.save();
        }

        await expect(service.getSnAuth('prod')).rejects.toThrow(
          /Instance row for alias .* is missing/,
        );
      } finally {
        await sequelize.query('PRAGMA foreign_keys = ON');
      }
    });
  });

  describe('setCurrent', () => {
    it('throws when the alias is not found', async () => {
      await expect(service.setCurrent('ghost')).rejects.toThrow(/not found/);
    });

    it('promotes an alias to the current connection', async () => {
      await service.add(input);
      // Create a second alias
      await service.add({ ...input, alias: 'dev' });
      // At this point 'dev' should be current
      const current = await Auth.findOne({ where: { isCurrent: true } });
      expect(current?.alias).toBe('dev');

      // Now set 'prod' as current
      const result = await service.setCurrent('prod');

      expect(result.isCurrent).toBe(true);
      expect(result.alias).toBe('prod');
      // Verify that 'prod' is now the only current one
      const updatedCurrent = await Auth.findOne({ where: { isCurrent: true } });
      expect(updatedCurrent?.alias).toBe('prod');
    });
  });
});
