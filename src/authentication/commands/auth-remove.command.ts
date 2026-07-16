/**
 * @file auth-remove.command.ts
 * @description `aify auth remove <alias>` — deletes the alias's auth row and keychain password.
 * If it was the current connection, prompts to pick a new current alias, or warns when none
 * remain (subsequent syncs need one).
 */
import { CommandRunner, SubCommand } from 'nest-commander';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { AuthService } from '../auth.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { PromptService } from '../prompt.service';

@SubCommand({
  name: 'remove',
  arguments: '<alias>',
  description: 'Remove a connection and its stored password.',
})
export class AuthRemoveCommand extends CommandRunner {
  constructor(
    private readonly authService: AuthService,
    private readonly prompt: PromptService,
  ) {
    super();
  }

  async run(params: string[]): Promise<void> {
    const alias = params[0];
    const all = await this.authService.list();
    const target = all.find((a) => a.alias === alias);
    if (!target) {
      console.error(`Alias "${alias}" not found.`);
      return;
    }

    const wasCurrent = target.isCurrent;
    await this.authService.remove(alias);
    console.log(`Connection "${alias}" removed.`);

    if (!wasCurrent) {
      return;
    }

    const remaining = all.filter((a) => a.alias !== alias);
    if (remaining.length === 0) {
      console.warn('No connections remain. Add one with "aify auth add" before syncing.');
      return;
    }

    const choice = await this.prompt.select(
      'Removed the current connection. Pick a new current:',
      remaining.map((a) => ({ name: a.alias, value: a.alias })),
    );
    await this.authService.setCurrent(choice);
    console.log(`"${choice}" is now the current connection.`);
  }
}
