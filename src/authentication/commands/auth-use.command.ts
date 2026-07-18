/**
 * @file auth-use.command.ts
 * @description `aify auth use <alias>` — promotes an existing alias to the single global
 * current connection. Delegates to AuthService.setCurrent, which sets isCurrent=true on the
 * matching row; the Auth model's @AfterUpdate hook then flips every other row to false so
 * only one current connection can exist at a time. On error (alias not found, or any other
 * failure) prints a clear message and exits non-zero — never rethrows, so the user does not
 * see a raw nest-commander stack trace.
 */
import { CommandRunner, SubCommand } from 'nest-commander';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { AuthService } from '../auth.service';

@SubCommand({
  name: 'use',
  arguments: '<alias>',
  description: 'Set the current ServiceNow connection.',
})
export class AuthUseCommand extends CommandRunner {
  constructor(private readonly authService: AuthService) {
    super();
  }

  async run(params: string[]): Promise<void> {
    const alias = params[0];
    if (!alias) {
      console.error('Usage: aify auth use <alias>');
      process.exitCode = 1;
      return;
    }

    try {
      await this.authService.setCurrent(alias);
      console.log(`"${alias}" is now the current connection.`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
