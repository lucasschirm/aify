/**
 * @file prompt.service.spec.ts
 * Tests for PromptService — wrapper methods around @inquirer/prompts and awaitKeypress.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
  select: vi.fn(),
}));

import { confirm, input, password, select } from '@inquirer/prompts';
import { PromptService } from './prompt.service';

describe('PromptService', () => {
  let service: PromptService;

  beforeEach(() => {
    service = new PromptService();
    vi.clearAllMocks();
  });

  describe('input', () => {
    it('calls inquirer input with message and default value', async () => {
      vi.mocked(input).mockResolvedValue('user input');

      const result = await service.input('Enter name', 'default name');

      expect(vi.mocked(input)).toHaveBeenCalledWith({
        message: 'Enter name',
        default: 'default name',
      });
      expect(result).toBe('user input');
    });

    it('calls inquirer input with message when no default', async () => {
      vi.mocked(input).mockResolvedValue('user input');

      const result = await service.input('Enter name');

      expect(vi.mocked(input)).toHaveBeenCalledWith({
        message: 'Enter name',
        default: undefined,
      });
      expect(result).toBe('user input');
    });
  });

  describe('password', () => {
    it('calls inquirer password with message and mask', async () => {
      vi.mocked(password).mockResolvedValue('secret');

      const result = await service.password('Enter password');

      expect(vi.mocked(password)).toHaveBeenCalledWith({
        message: 'Enter password',
        mask: '*',
      });
      expect(result).toBe('secret');
    });
  });

  describe('confirm', () => {
    it('calls inquirer confirm with message', async () => {
      vi.mocked(confirm).mockResolvedValue(true);

      const result = await service.confirm('Continue?');

      expect(vi.mocked(confirm)).toHaveBeenCalledWith({
        message: 'Continue?',
      });
      expect(result).toBe(true);
    });
  });

  describe('select', () => {
    it('calls inquirer select with message and choices', async () => {
      const choices = [
        { name: 'Option 1', value: 'opt1' },
        { name: 'Option 2', value: 'opt2' },
      ];
      vi.mocked(select).mockResolvedValue('opt1');

      const result = await service.select('Choose one', choices);

      expect(vi.mocked(select)).toHaveBeenCalledWith({
        message: 'Choose one',
        choices,
      });
      expect(result).toBe('opt1');
    });
  });

  describe('awaitKeypress', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('resolves true on regular key press', async () => {
      const promise = service.awaitKeypress('Press a key');

      // Emit a regular keypress after a microtask to allow listener registration
      setImmediate(() => {
        process.stdin.emit('keypress', Buffer.from(''), { name: 'a' });
      });

      const result = await promise;
      expect(result).toBe(true);
    });

    it('resolves false on ESC key', async () => {
      const promise = service.awaitKeypress('Press a key');

      // Emit ESC keypress
      setImmediate(() => {
        process.stdin.emit('keypress', Buffer.from(''), { name: 'escape' });
      });

      const result = await promise;
      expect(result).toBe(false);
    });

    it('resolves false on Ctrl+C', async () => {
      const promise = service.awaitKeypress('Press a key');

      // Emit Ctrl+C keypress
      setImmediate(() => {
        process.stdin.emit('keypress', Buffer.from(''), { ctrl: true, name: 'c' });
      });

      const result = await promise;
      expect(result).toBe(false);
    });

    it('prints message to stdout', async () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write');
      const promise = service.awaitKeypress('Press ESC to cancel');

      setImmediate(() => {
        process.stdin.emit('keypress', Buffer.from(''), { name: 'escape' });
      });

      await promise;

      // Check that the message was written with a space after it
      expect(stdoutSpy).toHaveBeenCalledWith('Press ESC to cancel ');
    });

    it('prints newline after keypress', async () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write');
      const promise = service.awaitKeypress('Press a key');

      setImmediate(() => {
        process.stdin.emit('keypress', Buffer.from(''), { name: 'a' });
      });

      await promise;

      // Check that newline was written after the keypress
      const calls = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(calls).toContain('\n');
    });

    it('cleans up listener after keypress', async () => {
      const removeListenerSpy = vi.spyOn(process.stdin, 'removeListener');
      const promise = service.awaitKeypress('Press a key');

      setImmediate(() => {
        process.stdin.emit('keypress', Buffer.from(''), { name: 'a' });
      });

      await promise;

      // Verify removeListener was called with 'keypress'
      expect(removeListenerSpy).toHaveBeenCalledWith('keypress', expect.any(Function));
    });

    it('calls setRawMode when process.stdin.isTTY is true', async () => {
      // Mock process.stdin.isTTY to be true and add a mock setRawMode
      const originalIsTTY = process.stdin.isTTY;
      const setRawModeMock = vi.fn();
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdin, 'setRawMode', {
        value: setRawModeMock,
        configurable: true,
      });

      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const promise = service.awaitKeypress('Press a key');

      setImmediate(() => {
        process.stdin.emit('keypress', Buffer.from(''), { name: 'a' });
      });

      await promise;

      // Verify setRawMode was called
      expect(setRawModeMock).toHaveBeenCalledWith(true);
      expect(setRawModeMock).toHaveBeenCalledWith(false);

      // Restore original isTTY value
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
      Object.defineProperty(process.stdin, 'setRawMode', {
        value: undefined,
        configurable: true,
      });
    });
  });
});
