/**
 * @file auth-use.command.spec.ts
 * Tests for AuthUseCommand — mocked AuthService. Verifies that `aify auth use <alias>`
 * delegates to AuthService.setCurrent and prints the success message, and that it surfaces
 * a clear error (without rethrowing) when setCurrent rejects.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../auth.service';
import { AuthUseCommand } from './auth-use.command';

describe('AuthUseCommand', () => {
  let command: AuthUseCommand;
  let authService: { setCurrent: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authService = { setCurrent: vi.fn().mockResolvedValue(undefined) };
    command = new AuthUseCommand(authService as unknown as AuthService);
  });

  it('promotes the alias via AuthService.setCurrent and prints a success message', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await command.run(['prod']);

    expect(authService.setCurrent).toHaveBeenCalledWith('prod');
    expect(spy).toHaveBeenCalledWith('"prod" is now the current connection.');
    expect(process.exitCode).toBeUndefined();
    spy.mockRestore();
  });

  it('prints a usage error and exits non-zero when no alias is given', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([]);

    expect(authService.setCurrent).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('Usage: aify auth use <alias>');
    expect(process.exitCode).toBe(1);
    spy.mockRestore();
    process.exitCode = undefined;
  });

  it('prints the error message and exits non-zero when setCurrent rejects', async () => {
    authService.setCurrent.mockRejectedValue(new Error('Alias "ghost" not found.'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run(['ghost']);

    expect(authService.setCurrent).toHaveBeenCalledWith('ghost');
    expect(spy).toHaveBeenCalledWith('Alias "ghost" not found.');
    expect(process.exitCode).toBe(1);
    spy.mockRestore();
    process.exitCode = undefined;
  });

  it('surfaces a non-Error rejection as a string without throwing', async () => {
    authService.setCurrent.mockRejectedValue('boom');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run(['prod']);

    expect(spy).toHaveBeenCalledWith('boom');
    expect(process.exitCode).toBe(1);
    spy.mockRestore();
    process.exitCode = undefined;
  });
});
