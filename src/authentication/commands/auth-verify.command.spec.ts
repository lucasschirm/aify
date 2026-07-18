/**
 * @file auth-verify.command.spec.ts
 * Tests for AuthVerifyCommand — manually instantiated with a mocked AuthService.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, ConnectionError } from '../../api/table-api.client';
import type { AuthService } from '../auth.service';
import { AuthVerifyCommand } from './auth-verify.command';

describe('AuthVerifyCommand', () => {
  let command: AuthVerifyCommand;
  let authService: {
    getSnAuth: ReturnType<typeof vi.fn>;
    testConnection: ReturnType<typeof vi.fn>;
  };

  const snAuth = {
    instanceUrl: 'https://acme.service-now.com/',
    username: 'admin',
    password: 's3cret',
  };

  beforeEach(() => {
    authService = {
      getSnAuth: vi.fn().mockResolvedValue({ auth: { alias: 'prod' }, snAuth }),
      testConnection: vi.fn().mockResolvedValue(undefined),
    };
    command = new AuthVerifyCommand(authService as unknown as AuthService);
  });

  it('verifies the current connection when no --alias is passed', async () => {
    await command.run([]);

    expect(authService.getSnAuth).toHaveBeenCalledWith(undefined);
    expect(authService.testConnection).toHaveBeenCalledWith(snAuth);
  });

  it('verifies the named alias when --alias is passed', async () => {
    await command.run([], { alias: 'dev' });

    expect(authService.getSnAuth).toHaveBeenCalledWith('dev');
    expect(authService.testConnection).toHaveBeenCalledWith(snAuth);
  });

  it('does not call testConnection when getSnAuth throws (alias not found)', async () => {
    authService.getSnAuth.mockRejectedValue(new Error('Alias "ghost" not found.'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([], { alias: 'ghost' });

    expect(authService.testConnection).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('Alias "ghost" not found.');
    expect(process.exitCode).toBe(1);
    spy.mockRestore();
    process.exitCode = undefined;
  });

  it('reports an auth failure (401) and exits non-zero', async () => {
    const err = new AuthError('Unauthorized');
    err.status = 401;
    authService.testConnection.mockRejectedValue(err);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([]);

    expect(spy).toHaveBeenCalledWith('Authentication failed (HTTP 401).');
    expect(process.exitCode).toBe(1);
    spy.mockRestore();
    process.exitCode = undefined;
  });

  it('reports a connection failure with its status and message', async () => {
    const err = new ConnectionError('Request failed with status 503.', 503);
    authService.testConnection.mockRejectedValue(err);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([]);

    expect(spy).toHaveBeenCalledWith(
      'Connection failed (HTTP 503): Request failed with status 503.',
    );
    expect(process.exitCode).toBe(1);
    spy.mockRestore();
    process.exitCode = undefined;
  });

  it('reports a connection failure without a status for network errors', async () => {
    const err = new ConnectionError('getaddrinfo ENOTFOUND acme');
    authService.testConnection.mockRejectedValue(err);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([]);

    expect(spy).toHaveBeenCalledWith('Connection failed: getaddrinfo ENOTFOUND acme');
    expect(process.exitCode).toBe(1);
    spy.mockRestore();
    process.exitCode = undefined;
  });
});
