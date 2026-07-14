/**
 * @file auth-update.command.ts
 * @description `aify auth update` — updates the password for an existing alias by prompting
 * interactively for the new password, then delegates to AuthService.updatePassword.
 *
 * Note: AuthService.updatePassword is a simple wrapper around `credentials.setPassword(alias, newPassword)`.
 */
import { Command, CommandRunner, Option } from 'nest-commander';
import type { AuthService } from '../auth.service';
import type { CredentialStore } from '../credential-store.service';
import type { PromptService } from '../prompt.service';

interface AuthUpdateOptions {
  alias?: string;
}

@Command({ name: 'update', description: 'Update your ServiceNow credentials.' })
export class AuthUpdateCommand extends CommandRunner {
  constructor(
    private readonly authService: AuthService,
    private readonly credentials: CredentialStore,
    private readonly prompt: PromptService,
  ) {
    super();
  }

  async run(_params: string[], options: AuthUpdateOptions = {}): Promise<void> {
    const alias = options.alias ?? (await this.prompt.input('Alias:'));
    const newPassword = await this.prompt.password('New Password:');

    await this.credentials.setPassword(alias, newPassword);
    console.log(`Credentials for "${alias}" updated.`);
  }

  @Option({ flags: '--alias <alias>', description: 'Connection alias whose credentials to update.' })
  parseAlias(value: string): string {
    return value;
  }
}
