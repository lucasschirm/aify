/**
 * @file auth-update.command.ts
 * @description `aify auth update <alias>` — shows the current username (editable, or prefilled
 * via `--username`) and masked-prompts a password where empty keeps the current one. There is no
 * `--password` flag (OS-17). Persists via AuthService.update.
 */
import { CommandRunner, Option, SubCommand } from 'nest-commander';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { AuthService } from '../auth.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { PromptService } from '../prompt.service';

interface AuthUpdateOptions {
  username?: string;
}

@SubCommand({
  name: 'update',
  arguments: '<alias>',
  description: 'Update a connection username and/or password.',
})
export class AuthUpdateCommand extends CommandRunner {
  constructor(
    private readonly authService: AuthService,
    private readonly prompt: PromptService,
  ) {
    super();
  }

  async run(params: string[], options: AuthUpdateOptions = {}): Promise<void> {
    const alias = params[0];
    const all = await this.authService.list();
    const target = all.find((a) => a.alias === alias);
    if (!target) {
      console.error(`Alias "${alias}" not found.`);
      return;
    }

    const username = options.username ?? (await this.prompt.input('Username:', target.username));
    const password = await this.prompt.password('Password (leave empty to keep current):');

    const changes: { username?: string; password?: string } = { username };
    if (password !== '') {
      changes.password = password;
    }
    await this.authService.update(alias, changes);
    console.log(`Connection "${alias}" updated.`);
  }

  @Option({
    flags: '--username <username>',
    description: 'New username (prefills the prompt).',
  })
  parseUsername(value: string): string {
    return value;
  }
}
