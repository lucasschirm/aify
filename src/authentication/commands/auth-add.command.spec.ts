/**
 * @file auth-add.command.spec.ts
 * Tests for AuthAddCommand — mocked AuthService, PromptService, and TableApiClient.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AuthAddCommand } from './auth-add.command';
import { AuthService } from '../auth.service';
import { PromptService } from '../prompt.service';
import { AuthError } from '../../api/table-api.client';

describe('AuthAddCommand', () => {
  let command: AuthAddCommand;
  let authService: { add: ReturnType<typeof vi.fn> };
  let prompt: { input: ReturnType<typeof vi.fn>; password: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = { add: vi.fn().mockResolvedValue({ alias: 'prod' }) };
    prompt = { input: vi.fn(), password: vi.fn().mockResolvedValue('s3cret') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthAddCommand,
        { provide: AuthService, useValue: authService },
        { provide: PromptService, useValue: prompt },
      ],
    }).compile();
    command = moduleRef.get(AuthAddCommand);
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

    await command.run([], {});
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
    spy.mockRestore();
  });
});
