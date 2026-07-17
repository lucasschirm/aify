/**
 * @file auth-add.command.ts
 * @description `aify auth add` — collects alias/instance/username (flag or prompt), always
 * masked-prompts the password (no `--password` flag, OS-17), then delegates to AuthService.add.
 * On AuthError (401) it reports the failure; AuthService guarantees nothing was persisted.
 */
import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { AuthError, ConnectionError } from '../../api/table-api.client';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { AuthService, parseInstance } from '../auth.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { PromptService } from '../prompt.service';

interface AuthAddOptions {
  alias?: string;
  instance?: string;
  username?: string;
  force?: boolean;
}

@SubCommand({ name: 'add', description: 'Add a ServiceNow connection and store its credentials.' })
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

    // ServiceNow share URLs may carry user_name/user_password query params; when present they
    // are decoded by parseInstance and used to skip the corresponding prompts. Precedence is
    // flag > URL query param > prompt, so an explicit --username still wins over the URL.
    const { url, username: urlUsername, password: urlPassword } = parseInstance(instance);
    const username = options.username ?? urlUsername ?? (await this.prompt.input('Username:'));
    const password = urlPassword ?? (await this.prompt.password('Password:'));

    try {
      await this.authService.add(
        { alias, instanceUrl: url, username, password },
        options.force ?? false,
      );
      console.log(`Connection "${alias}" saved and set as current.`);
    } catch (error) {
      // AuthService.add tests the connection BEFORE persisting anything, so on any failure
      // here nothing was saved. Print a clear, actionable message per error type and exit
      // non-zero — never rethrow (that would surface a raw nest-commander stack trace).
      if (error instanceof AuthError) {
        console.error(`Authentication failed (HTTP ${error.status}). Nothing was saved.`);
      } else if (error instanceof ConnectionError) {
        const status = error.status ? ` (HTTP ${error.status})` : '';
        console.error(`Connection failed${status}: ${error.message}`);
      } else {
        console.error(error instanceof Error ? error.message : String(error));
      }
      process.exitCode = 1;
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
