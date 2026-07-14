/**
 * @file auth-remove.command.spec.ts
 * Tests for AuthRemoveCommand — mocked AuthService and PromptService.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRemoveCommand } from './auth-remove.command';
import type { AuthService } from '../auth.service';
import type { PromptService } from '../prompt.service';

describe('AuthRemoveCommand', () => {
  let command: AuthRemoveCommand;
  let authService: { list: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; setCurrent: ReturnType<typeof vi.fn> };
  let prompt: { select: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authService = { list: vi.fn(), remove: vi.fn().mockResolvedValue(undefined), setCurrent: vi.fn() };
    prompt = { select: vi.fn() };

    command = new AuthRemoveCommand(
      authService as unknown as AuthService,
      prompt as unknown as PromptService,
    );
  });

  it('removes a non-current alias without prompting for a new current', async () => {
    authService.list.mockResolvedValue([
      { alias: 'prod', isCurrent: true },
      { alias: 'dev', isCurrent: false },
    ]);

    await command.run(['dev']);

    expect(authService.remove).toHaveBeenCalledWith('dev');
    expect(prompt.select).not.toHaveBeenCalled();
    expect(authService.setCurrent).not.toHaveBeenCalled();
  });

  it('warns when the alias does not exist', async () => {
    authService.list.mockResolvedValue([{ alias: 'prod', isCurrent: true }]);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run(['ghost']);

    expect(authService.remove).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('Alias "ghost" not found.');
    spy.mockRestore();
  });

  it('prompts for and sets a new current when the removed alias was current', async () => {
    authService.list.mockResolvedValue([
      { alias: 'prod', isCurrent: true },
      { alias: 'dev', isCurrent: false },
    ]);
    prompt.select.mockResolvedValue('dev');

    await command.run(['prod']);

    expect(authService.remove).toHaveBeenCalledWith('prod');
    expect(prompt.select).toHaveBeenCalledWith(
      'Removed the current connection. Pick a new current:',
      [{ name: 'dev', value: 'dev' }],
    );
    expect(authService.setCurrent).toHaveBeenCalledWith('dev');
  });

  it('warns when the removed current alias was the only connection', async () => {
    authService.list.mockResolvedValue([{ alias: 'prod', isCurrent: true }]);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await command.run(['prod']);

    expect(authService.remove).toHaveBeenCalledWith('prod');
    expect(prompt.select).not.toHaveBeenCalled();
    expect(authService.setCurrent).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      'No connections remain. Add one with "aify auth add" before syncing.',
    );
    spy.mockRestore();
  });
});
