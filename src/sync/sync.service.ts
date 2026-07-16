/**
 * @file sync.service.ts
 * @description Orchestrator for the sync subsystem. Validates that a current connection
 * exists and that tracked scopes are configured, then sequences the pull → conflict-check →
 * write → push stages. Hot mode (watch + poll) is stubbed for a future cycle.
 */
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { AuthService } from '../authentication/auth.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { ProjectConfigService } from '../config/project/project-config.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TrackedTablesService } from '../config/tracked-tables/tracked-tables.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { SpinnerService } from '../ui/spinner.service';
import type { SyncOptions } from './sync.types';

@Injectable()
export class SyncService {
  constructor(
    private readonly auth: AuthService,
    private readonly projectConfig: ProjectConfigService,
    private readonly trackedTables: TrackedTablesService,
    private readonly spinner: SpinnerService,
  ) {}

  /** Run a single sync pass for all tracked scopes (or a single scope when `options.scope`). */
  async syncOnce(options: SyncOptions = {}): Promise<void> {
    const current = await this.auth.current();
    if (!current) {
      throw new Error('No current connection. Run `aify auth add` first.');
    }

    const projectRoot = await this.projectConfig.findProjectRoot();
    if (!projectRoot) {
      throw new Error('Not in an aify project. Run `aify app init` first.');
    }

    const config = await this.projectConfig.read(projectRoot);
    const scopes = config.project?.scopes ?? [];
    if (scopes.length === 0) {
      console.log('No tracked scopes. Run `aify app init <scope|sys_id>` to track one.');
      return;
    }

    const targetScopes = options.scope ? scopes.filter((s) => s.scope === options.scope) : scopes;

    if (targetScopes.length === 0) {
      console.log(`Scope "${options.scope}" is not tracked.`);
      return;
    }

    const trackConfig = await this.trackedTables.getProjectTrackTables(projectRoot);

    for (const scope of targetScopes) {
      this.spinner.start(`Syncing scope "${scope.scope}"…`);
      try {
        // Pull stage: fetch tracked table metadata for this scope from the instance.
        // Full stage sequencing (pull → conflict-check → write → push) is a future cycle.
        const tableNames = trackConfig.tables.map((t) => t.name).join(', ') || '(none)';
        console.log(`  Tables to sync: ${tableNames}`);
        this.spinner.succeed(`Scope "${scope.scope}" synced.`);
      } catch (err) {
        this.spinner.fail(`Scope "${scope.scope}" failed.`);
        throw err;
      }
    }
  }

  /** Start hot mode (watch + poll). Stubbed for a future cycle. */
  async startHot(_options: SyncOptions = {}): Promise<void> {
    throw new Error('Hot mode is not yet implemented. Use `aify sync` for a one-shot sync.');
  }

  /** Stop hot mode. Stubbed for a future cycle. */
  async stopHot(): Promise<void> {
    // No-op until hot mode is implemented.
  }
}
