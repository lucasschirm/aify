/**
 * @file prompt.service.spec.ts
 * Tests for PromptService — all wrapper methods over @inquirer/prompts and keypress handling.
 */

import { EventEmitter } from 'node:events';
import * as inquirerPrompts from '@inquirer/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptService } from './prompt.service';

// Mock all inquirer prompts
vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
  select: vi.fn(),
  checkbox: vi.fn(),
}));

describe('PromptService', () => {
  let service: PromptService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PromptService();
  });

  describe('input', () => {
    it('calls inquirer input with message and default', async () => {
      const mockInput = vi.fn().mockResolvedValue('user input');
      vi.mocked(inquirerPrompts.input).mockImplementation(mockInput);

      const result = await service.input('Enter name', 'default value');

      expect(mockInput).toHaveBeenCalledWith({ message: 'Enter name', default: 'default value' });
      expect(result).toBe('user input');
    });

    it('calls inquirer input with message only when no default', async () => {
      const mockInput = vi.fn().mockResolvedValue('user input');
      vi.mocked(inquirerPrompts.input).mockImplementation(mockInput);

      const result = await service.input('Enter name');

      expect(mockInput).toHaveBeenCalledWith({ message: 'Enter name', default: undefined });
      expect(result).toBe('user input');
    });
  });

  describe('password', () => {
    it('calls inquirer password with message and mask', async () => {
      const mockPassword = vi.fn().mockResolvedValue('secret');
      vi.mocked(inquirerPrompts.password).mockImplementation(mockPassword);

      const result = await service.password('Enter password');

      expect(mockPassword).toHaveBeenCalledWith({ message: 'Enter password', mask: '*' });
      expect(result).toBe('secret');
    });
  });

  describe('confirm', () => {
    it('calls inquirer confirm with message', async () => {
      const mockConfirm = vi.fn().mockResolvedValue(true);
      vi.mocked(inquirerPrompts.confirm).mockImplementation(mockConfirm);

      const result = await service.confirm('Continue?');

      expect(mockConfirm).toHaveBeenCalledWith({ message: 'Continue?' });
      expect(result).toBe(true);
    });
  });

  describe('select', () => {
    it('calls inquirer select with message and choices', async () => {
      const mockSelect = vi.fn().mockResolvedValue('choice1');
      vi.mocked(inquirerPrompts.select).mockImplementation(mockSelect);

      const choices = [
        { name: 'Option 1', value: 'choice1' },
        { name: 'Option 2', value: 'choice2' },
      ];
      const result = await service.select('Pick one', choices);

      expect(mockSelect).toHaveBeenCalledWith({ message: 'Pick one', choices });
      expect(result).toBe('choice1');
    });
  });

  describe('checkbox', () => {
    it('calls inquirer checkbox with message and choices', async () => {
      const mockCheckbox = vi.fn().mockResolvedValue(['choice1', 'choice3']);
      vi.mocked(inquirerPrompts.checkbox).mockImplementation(mockCheckbox);

      const choices = [
        { name: 'Option 1', value: 'choice1', checked: true },
        { name: 'Option 2', value: 'choice2' },
        { name: 'Option 3', value: 'choice3' },
      ];
      const result = await service.checkbox('Pick multiple', choices);

      expect(mockCheckbox).toHaveBeenCalledWith({ message: 'Pick multiple', choices });
      expect(result).toEqual(['choice1', 'choice3']);
    });

    it('returns empty array when no choices selected', async () => {
      const mockCheckbox = vi.fn().mockResolvedValue([]);
      vi.mocked(inquirerPrompts.checkbox).mockImplementation(mockCheckbox);

      const choices = [{ name: 'Option 1', value: 'choice1' }];
      const result = await service.checkbox('Pick multiple', choices);

      expect(result).toEqual([]);
    });

    it('passes disabled flag through to inquirer', async () => {
      const mockCheckbox = vi.fn().mockResolvedValue(['choice1']);
      vi.mocked(inquirerPrompts.checkbox).mockImplementation(mockCheckbox);

      const choices = [
        { name: 'Option 1', value: 'choice1' },
        { name: 'Option 2', value: 'choice2', disabled: true },
        { name: 'Option 3', value: 'choice3', disabled: 'locked reason' },
      ];
      const result = await service.checkbox('Pick', choices);

      expect(mockCheckbox).toHaveBeenCalledWith({ message: 'Pick', choices });
      expect(result).toEqual(['choice1']);
    });
  });

  describe('awaitKeypress', () => {
    let originalStdin: NodeJS.ReadStream & { isTTY?: boolean };
    let mockStdin: EventEmitter & { isTTY?: boolean; setRawMode?: (mode: boolean) => void };

    beforeEach(() => {
      originalStdin = process.stdin;

      // Create a mock stdin that's NOT a TTY (so setRawMode is skipped)
      mockStdin = Object.assign(new EventEmitter(), {
        isTTY: false,
      });

      // Spy on stdout.write
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      // Replace stdin
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(process, 'stdin', {
        value: originalStdin,
        writable: true,
        configurable: true,
      });
      vi.restoreAllMocks();
    });

    it('returns false when ESC is pressed', async () => {
      const promise = service.awaitKeypress('Ready?');
      // Trigger the keypress event after a tick
      process.nextTick(() => {
        mockStdin.emit('keypress', Buffer.from(''), { name: 'escape' });
      });
      const result = await promise;
      expect(result).toBe(false);
      expect(process.stdout.write).toHaveBeenCalledWith('Ready? ');
    });

    it('returns true when a regular key is pressed', async () => {
      const promise = service.awaitKeypress('Ready?');
      process.nextTick(() => {
        mockStdin.emit('keypress', Buffer.from('a'), { name: 'a' });
      });
      const result = await promise;
      expect(result).toBe(true);
    });

    it('returns true when ENTER is pressed', async () => {
      const promise = service.awaitKeypress('Ready?');
      process.nextTick(() => {
        mockStdin.emit('keypress', Buffer.from(''), { name: 'return' });
      });
      const result = await promise;
      expect(result).toBe(true);
    });

    it('returns false when Ctrl+C is pressed', async () => {
      const promise = service.awaitKeypress('Ready?');
      process.nextTick(() => {
        mockStdin.emit('keypress', Buffer.from(''), { ctrl: true, name: 'c' });
      });
      const result = await promise;
      expect(result).toBe(false);
    });

    it('writes a newline after keypress is received', async () => {
      const writespy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const promise = service.awaitKeypress('Ready?');
      process.nextTick(() => {
        mockStdin.emit('keypress', Buffer.from(''), { name: 'return' });
      });
      await promise;
      // Check that newline was written
      expect(writespy).toHaveBeenCalledWith('\n');
    });

    it('calls setRawMode(true) and setRawMode(false) when isTTY is true', async () => {
      const setRawModeSpy = vi.fn();
      const ttyMockStdin = Object.assign(new EventEmitter(), {
        isTTY: true,
        setRawMode: setRawModeSpy,
      });

      Object.defineProperty(process, 'stdin', {
        value: ttyMockStdin,
        writable: true,
        configurable: true,
      });

      const promise = service.awaitKeypress('Ready?');
      process.nextTick(() => {
        ttyMockStdin.emit('keypress', Buffer.from(''), { name: 'return' });
      });
      await promise;

      expect(setRawModeSpy).toHaveBeenNthCalledWith(1, true);
      expect(setRawModeSpy).toHaveBeenNthCalledWith(2, false);
    });

    it('returns false when Ctrl+C is pressed with isTTY', async () => {
      const setRawModeSpy = vi.fn();
      const ttyMockStdin = Object.assign(new EventEmitter(), {
        isTTY: true,
        setRawMode: setRawModeSpy,
      });

      Object.defineProperty(process, 'stdin', {
        value: ttyMockStdin,
        writable: true,
        configurable: true,
      });

      const promise = service.awaitKeypress('Ready?');
      process.nextTick(() => {
        ttyMockStdin.emit('keypress', Buffer.from(''), { ctrl: true, name: 'c' });
      });
      const result = await promise;

      expect(result).toBe(false);
      expect(setRawModeSpy).toHaveBeenNthCalledWith(1, true);
      expect(setRawModeSpy).toHaveBeenNthCalledWith(2, false);
    });

    it('returns false when ESC is pressed with isTTY', async () => {
      const setRawModeSpy = vi.fn();
      const ttyMockStdin = Object.assign(new EventEmitter(), {
        isTTY: true,
        setRawMode: setRawModeSpy,
      });

      Object.defineProperty(process, 'stdin', {
        value: ttyMockStdin,
        writable: true,
        configurable: true,
      });

      const promise = service.awaitKeypress('Ready?');
      process.nextTick(() => {
        ttyMockStdin.emit('keypress', Buffer.from(''), { name: 'escape' });
      });
      const result = await promise;

      expect(result).toBe(false);
      expect(setRawModeSpy).toHaveBeenNthCalledWith(1, true);
      expect(setRawModeSpy).toHaveBeenNthCalledWith(2, false);
    });
  });
});
