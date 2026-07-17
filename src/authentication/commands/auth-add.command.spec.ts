/**
 * @file auth-add.command.spec.ts
 * Tests for AuthAddCommand — manually instantiated with mocked deps.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, ConnectionError } from '../../api/table-api.client';
import type { AuthService } from '../auth.service';
import type { PromptService } from '../prompt.service';
import { AuthAddCommand } from './auth-add.command';

describe('AuthAddCommand', () => {
  let command: AuthAddCommand;
  let authService: { add: ReturnType<typeof vi.fn> };
  let prompt: { input: ReturnType<typeof vi.fn>; password: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authService = { add: vi.fn().mockResolvedValue({ alias: 'prod' }) };
    prompt = { input: vi.fn(), password: vi.fn().mockResolvedValue('s3cret') };

    command = new AuthAddCommand(
      authService as unknown as AuthService,
      prompt as unknown as PromptService,
    );
  });

  it('masks the password prompt and forwards flags without any --password', async () => {
    await command.run([], { alias: 'prod', instance: 'acme.service-now.com', username: 'admin' });

    expect(prompt.password).toHaveBeenCalledWith(expect.any(String));
    expect(prompt.input).not.toHaveBeenCalled();
    expect(authService.add).toHaveBeenCalledWith(
      { alias: 'prod', instanceUrl: 'acme.service-now.com', username: 'admin', password: 's3cret' },
      false,
    );
  });

  it('prompts for each missing flag', async () => {
    prompt.input
      .mockResolvedValueOnce('prod')
      .mockResolvedValueOnce('acme.service-now.com')
      .mockResolvedValueOnce('admin');

    await command.run([]);
    expect(prompt.input).toHaveBeenCalledTimes(3);
    expect(authService.add).toHaveBeenCalledWith(
      { alias: 'prod', instanceUrl: 'acme.service-now.com', username: 'admin', password: 's3cret' },
      false,
    );
  });

  it('passes force=true through when --force is set', async () => {
    await command.run([], { alias: 'prod', instance: 'acme', username: 'admin', force: true });
    expect(authService.add).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('reports an auth failure and saves nothing', async () => {
    const err = new AuthError('Unauthorized');
    err.status = 401;
    authService.add.mockRejectedValue(err);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([], { alias: 'prod', instance: 'acme', username: 'admin' });

    expect(spy).toHaveBeenCalledWith('Authentication failed (HTTP 401). Nothing was saved.');
    expect(process.exitCode).toBe(1);
    spy.mockRestore();
    process.exitCode = undefined;
  });

  it('reports a connection failure with its status and message', async () => {
    const err = new ConnectionError('Request failed with status 503.', 503);
    authService.add.mockRejectedValue(err);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([], { alias: 'prod', instance: 'acme', username: 'admin' });

    expect(spy).toHaveBeenCalledWith(
      'Connection failed (HTTP 503): Request failed with status 503.',
    );
    expect(process.exitCode).toBe(1);
    spy.mockRestore();
    process.exitCode = undefined;
  });

  it('reports a connection failure without a status for network errors', async () => {
    const err = new ConnectionError('getaddrinfo ENOTFOUND acme');
    authService.add.mockRejectedValue(err);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([], { alias: 'prod', instance: 'acme', username: 'admin' });

    expect(spy).toHaveBeenCalledWith('Connection failed: getaddrinfo ENOTFOUND acme');
    expect(process.exitCode).toBe(1);
    spy.mockRestore();
    process.exitCode = undefined;
  });

  it('reports a generic error message and exits non-zero', async () => {
    authService.add.mockRejectedValue(
      new Error('Alias "prod" already exists. Use --force to overwrite.'),
    );
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([], { alias: 'prod', instance: 'acme', username: 'admin' });

    expect(spy).toHaveBeenCalledWith('Alias "prod" already exists. Use --force to overwrite.');
    expect(process.exitCode).toBe(1);
    spy.mockRestore();
    process.exitCode = undefined;
  });
});
