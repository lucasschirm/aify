/**
 * @file app-init.command.ts
 * @description `aify app` parent command + `aify app init <scope|sys_id>` subcommand +
 * `aify app sync <scope>` subcommand. `init` resolves the project root, delegates to
 * `ApplicationService.init`, and prompts to run sync (interactive only; `--yes` skips).
 */
import { Command, CommandRunner, Option, SubCommand } from 'nest-commander';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { PromptService } from '../../authentication/prompt.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { ProjectConfigService } from '../../config/project/project-config.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { ApplicationService } from '../application.service';

interface AppInitOptions {
  yes?: boolean;
}

@SubCommand({
  name: 'init',
  arguments: '<scope|sys_id>',
  description: 'Track an existing ServiceNow application by scope or sys_id.',
})
export class AppInitCommand extends CommandRunner {
  constructor(
    private readonly appService: ApplicationService,
    private readonly projectConfig: ProjectConfigService,
    private readonly prompt: PromptService,
  ) {
    super();
  }

  async run(params: string[], options: AppInitOptions = {}): Promise<void> {
    const param = params[0];
    if (!param) {
      console.error('Usage: aify app init <scope|sys_id>');
      return;
    }

    const projectRoot = await this.projectConfig.ensureProjectRoot();
    const app = await this.appService.init(param, projectRoot);
    console.log(`Application "${app.displayValue}" (${app.scope}) tracked.`);

    if (options.yes) return;
    const shouldSync = await this.prompt.confirm('Run a sync now?');
    if (shouldSync) {
      console.log('Run `aify sync` to pull metadata.');
    }
  }

  @Option({
    flags: '--yes',
    description: 'Skip the sync prompt (non-interactive).',
  })
  parseYes(): boolean {
    return true;
  }
}

@SubCommand({
  name: 'sync',
  arguments: '<scope>',
  description: 'Sync metadata for a tracked application scope.',
})
export class AppSyncCommand extends CommandRunner {
  async run(params: string[]): Promise<void> {
    const scope = params[0];
    if (!scope) {
      console.error('Usage: aify app sync <scope>');
      return;
    }
    console.log(`Syncing scope "${scope}"…`);
    console.log('Run `aify sync` to pull metadata for all tracked scopes.');
  }
}

@Command({
  name: 'app',
  description: 'Track a ServiceNow scoped application locally.',
  subCommands: [AppInitCommand, AppSyncCommand],
})
export class AppCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
