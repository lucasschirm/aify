/**
 * @file auth-add.command.ts
 * @description `aify auth add` — collects alias/instance/username (flag or prompt), always
 * masked-prompts the password (no `--password` flag, OS-17), then delegates to AuthService.add.
 * On AuthError (401) it reports the failure; AuthService guarantees nothing was persisted.
 */
import { Command, CommandRunner, Option } from 'nest-commander';
import type { AuthService } from '../auth.service';
import type { PromptService } from '../prompt.service';
import { AuthError } from '../../api/table-api.client';

interface AuthAddOptions {
  alias?: string;
  instance?: string;
  username?: string;
  force?: boolean;
}

@Command({ name: 'add', description: 'Add a ServiceNow connection and store its credentials.' })
export class AuthAddCommand extends CommandRunner {
  constructor(
    private readonly authService: AuthService,
    private readonly prompt: PromptService,
  ) {
    super();
  }

  async run(_params: string[], options: AuthAddOptions = {}): Promise<void> {
    const alias = options.alias ?? (await this.prompt.input('Alias:'));
    const instance = options.instance ?? (await this.prompt.input('Instance (host or URL):'));
    const username = options.username ?? (await this.prompt.input('Username:'));
    const password = await this.prompt.password('Password:');

    try {
      await this.authService.add(
        { alias, instanceUrl: instance, username, password },
        options.force ?? false,
      );
      console.log(`Connection "${alias}" saved and set as current.`);
    } catch (error) {
      if (error instanceof AuthError) {
        console.error(`Authentication failed (HTTP ${error.status}). Nothing was saved.`);
        return;
      }
      throw error;
    }
  }

  @Option({ flags: '--alias <alias>', description: 'Connection alias (globally unique).' })
  parseAlias(value: string): string {
    return value;
  }

  @Option({ flags: '--instance <instance>', description: 'Instance host or full URL.' })
  parseInstanceOption(value: string): string {
    return value;
  }

  @Option({ flags: '--username <username>', description: 'ServiceNow username.' })
  parseUsername(value: string): string {
    return value;
  }

  @Option({ flags: '--force', description: 'Overwrite an existing alias and re-test.' })
  parseForce(): boolean {
    return true;
  }
}
