/**
 * @file auth-update.command.spec.ts
 * Tests for AuthUpdateCommand — mocked AuthService and PromptService.
 */

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth.service';
import { PromptService } from '../prompt.service';
import { AuthUpdateCommand } from './auth-update.command';

describe('AuthUpdateCommand', () => {
  let command: AuthUpdateCommand;
  let authService: { list: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let prompt: { input: ReturnType<typeof vi.fn>; password: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = {
      list: vi.fn().mockResolvedValue([{ alias: 'prod', username: 'admin', isCurrent: true }]),
      update: vi.fn().mockResolvedValue({ alias: 'prod' }),
    };
    prompt = { input: vi.fn(), password: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthUpdateCommand,
        { provide: AuthService, useValue: authService },
        { provide: PromptService, useValue: prompt },
      ],
    }).compile();
    command = moduleRef.get(AuthUpdateCommand);
  });

  it('prefills the current username and updates it, omitting password when left empty', async () => {
    prompt.input.mockResolvedValue('newadmin');
    prompt.password.mockResolvedValue('');

    await command.run(['prod'], {});

    expect(prompt.input).toHaveBeenCalledWith('Username:', 'admin');
    expect(prompt.password).toHaveBeenCalledWith('Password (leave empty to keep current):');
    expect(authService.update).toHaveBeenCalledWith('prod', { username: 'newadmin' });
  });

  it('includes the password only when the prompt returns a value', async () => {
    prompt.input.mockResolvedValue('admin');
    prompt.password.mockResolvedValue('rotated');

    await command.run(['prod'], {});

    expect(authService.update).toHaveBeenCalledWith('prod', {
      username: 'admin',
      password: 'rotated',
    });
  });

  it('uses a prefilled --username without prompting for it', async () => {
    prompt.password.mockResolvedValue('');

    await command.run(['prod'], { username: 'flaguser' });

    expect(prompt.input).not.toHaveBeenCalled();
    expect(authService.update).toHaveBeenCalledWith('prod', { username: 'flaguser' });
  });

  it('warns when the alias does not exist', async () => {
    authService.list.mockResolvedValue([]);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run(['ghost'], {});

    expect(authService.update).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('Alias "ghost" not found.');
    spy.mockRestore();
  });

  describe('option parsers', () => {
    it('parseUsername returns the value unchanged', () => {
      expect(command.parseUsername('admin')).toBe('admin');
    });
  });
});
