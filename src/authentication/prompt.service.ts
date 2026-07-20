/**
 * @file prompt.service.ts
 * @description Injectable wrapper around `@inquirer/prompts`. Commands depend on this class so
 * that tests can replace it with a mocked provider instead of a real TTY. Passwords are always
 * masked; there is no `--password` flag anywhere in the CLI (OS-17).
 */

import { emitKeypressEvents } from 'node:readline';
import { checkbox, confirm, input, password, select } from '@inquirer/prompts';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PromptService {
  /** Free-text prompt with an optional prefilled default. */
  input(message: string, defaultValue?: string): Promise<string> {
    return input({ message, default: defaultValue });
  }

  /** Masked password prompt (characters hidden). */
  password(message: string): Promise<string> {
    return password({ message, mask: '*' });
  }

  /** Yes/no confirmation prompt. */
  confirm(message: string): Promise<boolean> {
    return confirm({ message });
  }

  /** Single-choice selection prompt. */
  select<T>(message: string, choices: { name: string; value: T }[]): Promise<T> {
    return select({ message, choices });
  }

  /** Multi-choice checkbox prompt. Returns the selected values. */
  checkbox<T>(
    message: string,
    choices: { name: string; value: T; checked?: boolean; disabled?: boolean | string }[],
  ): Promise<T[]> {
    return checkbox({ message, choices });
  }

  /**
   * Print `message`, wait for a single keypress, and return `false` only when ESC is pressed.
   * Used for the "Press any key to start sync or ESC to cancel" prompt.
   */
  awaitKeypress(message: string): Promise<boolean> {
    process.stdout.write(`${message} `);
    return new Promise((resolve) => {
      emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      const onKeypress = (_chunk: Buffer, key: { name?: string; ctrl?: boolean }): void => {
        process.stdin.removeListener('keypress', onKeypress);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdout.write('\n');
        resolve(!(key?.name === 'escape' || (key?.ctrl && key?.name === 'c')));
      };
      process.stdin.on('keypress', onKeypress);
    });
  }
}
