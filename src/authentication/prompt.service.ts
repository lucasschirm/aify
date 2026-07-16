/**
 * @file prompt.service.ts
 * @description Injectable wrapper around `@inquirer/prompts`. Commands depend on this class so
 * that tests can replace it with a mocked provider instead of a real TTY. Passwords are always
 * masked; there is no `--password` flag anywhere in the CLI (OS-17).
 */

import { confirm, input, password, select } from '@inquirer/prompts';
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
}
