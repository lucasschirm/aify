/**
 * @file auth-verify.command.ts
 * @description `aify auth verify [--alias <alias>]` — tests the ServiceNow connection for the
 * current default alias (no flag) or a named alias. Resolves the stored credentials via
 * AuthService.getSnAuth and delegates the probe to AuthService.testConnection, which already
 * prints "Connection verified." / "Connection failed." via the spinner, so the command only
 * adds error handling and a non-zero exit on failure (mirrors auth-add.command.ts).
 */
import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { AuthError, ConnectionError } from '../../api/table-api.client';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { AuthService } from '../auth.service';

interface AuthVerifyOptions {
  alias?: string;
}

@SubCommand({
  name: 'verify',
  description: 'Test the connection for the current alias (or --alias <alias>).',
})
export class AuthVerifyCommand extends CommandRunner {
  constructor(private readonly authService: AuthService) {
    super();
  }

  async run(_params: string[], options: AuthVerifyOptions = {}): Promise<void> {
    try {
      const { snAuth } = await this.authService.getSnAuth(options.alias);
      await this.authService.testConnection(snAuth);
    } catch (error) {
      // testConnection already printed "Connection failed." for AuthError/ConnectionError via
      // the spinner; only surface the actionable detail here and exit non-zero. For lookup
      // errors (alias not found, no current, missing keychain password) the spinner was never
      // started, so print the message directly.
      if (error instanceof AuthError) {
        console.error(`Authentication failed (HTTP ${error.status}).`);
      } else if (error instanceof ConnectionError) {
        const status = error.status ? ` (HTTP ${error.status})` : '';
        console.error(`Connection failed${status}: ${error.message}`);
      } else {
        console.error(error instanceof Error ? error.message : String(error));
      }
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--alias <alias>',
    description: 'Connection alias to verify (defaults to the current connection).',
  })
  parseAlias(value: string): string {
    return value;
  }
}
