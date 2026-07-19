/**
 * @file sync.service.ts
 * @description SyncService — orchestrates the git-like sync pipeline (pull → conflict-check →
 * write → push) for each tracked scope. Handles flag validation, OS-20 instance confirmation,
 * force confirmations, per-scope locking (OS-8), and `--hot` mode with a file watcher + lightweight
 * `sys_metadata` poll (OS-13).
 */

import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { AuthService } from '../authentication/auth.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { PromptService } from '../authentication/prompt.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { ProjectConfigService } from '../config/project/project-config.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TrackedTablesService } from '../config/tracked-tables/tracked-tables.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { RecordMetadataService } from '../record-metadata/record-metadata.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { SpinnerService } from '../ui/spinner.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { WatcherService } from './hot/watcher.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { ScopeLockService } from './lock/scope-lock.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { ConflictCheckStage } from './stages/conflict-check.stage';
import type { PullInput } from './stages/pull.stage';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { PullStage } from './stages/pull.stage';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { PushStage } from './stages/push.stage';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { WriteStage } from './stages/write.stage';
import type { ColumnChange, SyncOptions } from './sync.types';

const EMPTY_PROJECT =
  'Current project is empty, use the `app init` command to start tracking an application';
const MUTEX = '--force-pull and --force-push are mutually exclusive';

@Injectable()
export class SyncService {
  private hotInterval?: NodeJS.Timeout;

  constructor(
    private readonly projectConfig: ProjectConfigService,
    private readonly trackedTables: TrackedTablesService,
    private readonly auth: AuthService,
    private readonly lock: ScopeLockService,
    private readonly prompt: PromptService,
    private readonly pullStage: PullStage,
    private readonly conflictCheckStage: ConflictCheckStage,
    private readonly writeStage: WriteStage,
    private readonly pushStage: PushStage,
    private readonly watcher: WatcherService,
    private readonly spinner: SpinnerService,
    private readonly records: RecordMetadataService,
  ) {}

  /** Validate, confirm, then run a one-shot sync (and optionally start hot mode). */
  async run(options: SyncOptions = {}): Promise<void> {
    if (options.forcePull && options.forcePush) throw new Error(MUTEX);

    const root = await this.projectConfig.ensureProjectRoot();
    const config = await this.projectConfig.read(root);
    let scopes = config.project?.scopes ?? [];
    if (scopes.length === 0) throw new Error(EMPTY_PROJECT);

    if (options.scope) {
      scopes = scopes.filter((s) => s.scope === options.scope);
      if (scopes.length === 0)
        throw new Error(`Scope "${options.scope}" is not tracked in this project`);
    }

    const current = await this.auth.current();
    if (!current) throw new Error('No current connection. Run `aify auth add` first.');

    if (options.forcePull && options.yes !== true) {
      const ok = await this.prompt.confirm(
        'Are you sure you want to proceed? This action will erase any change you may have made since last sync.',
      );
      if (!ok) return;
    }
    if (options.forcePush && options.yes !== true) {
      const ok = await this.prompt.confirm(
        'Are you sure you want to proceed? This action will overwrite any changes made in the instance since last sync.',
      );
      if (!ok) return;
    }

    if (!options.yes) {
      const proceed = await this.prompt.awaitKeypress(
        `Press any key to start sync to the instance ${current.snAuth.instanceUrl} or ESC to cancel`,
      );
      if (!proceed) return;
    }

    await this.syncOnce(options);
    if (options.hot) await this.startHot(options);
  }

  /** Orchestrate a single pull → conflict-check → write → push pass. */
  private async syncOnce(options: SyncOptions): Promise<void> {
    if (options.forcePush) {
      await this.forcePushOnce(options);
      return;
    }

    const root = await this.projectConfig.ensureProjectRoot();
    const trackConfig = await this.trackedTables.getProjectTrackTables(root);
    const inputs = await this.pullInputs(options);

    for (const input of inputs) {
      await this.lock.withLock(root, input.scope.scope, async () => {
        this.spinner.start(`Syncing scope "${input.scope.scope}"…`);
        try {
          const pullResult = await this.pullStage.run(input);
          const changes = await this.conflictCheckStage.classify(pullResult.changed, trackConfig);
          const writeResult = await this.writeStage.apply({
            root,
            changes,
            forcePull: options.forcePull,
          });

          if (writeResult.conflicted.length > 0) {
            throw new Error(
              `The file "${writeResult.conflicted[0]}" is in conflict. Resolve the conflict or use the "aify sync --force-pull" command to pull the latest valid content for the file.`,
            );
          }

          if (!options.forcePull) {
            await this.pushStage.push({ snAuth: input.snAuth, changes });
          }

          this.spinner.succeed(`Scope "${input.scope.scope}" synced.`);
        } catch (err) {
          this.spinner.fail(`Scope "${input.scope.scope}" failed.`);
          throw err;
        }
      });
    }
  }

  /** Push every tracked column for every local record in the targeted scope(s). */
  private async forcePushOnce(options: SyncOptions): Promise<void> {
    const root = await this.projectConfig.ensureProjectRoot();
    const current = await this.auth.current();
    if (!current) throw new Error('No current connection. Run `aify auth add` first.');

    const config = await this.projectConfig.read(root);
    let scopes = config.project?.scopes ?? [];
    if (options.scope) scopes = scopes.filter((s) => s.scope === options.scope);

    for (const scope of scopes) {
      await this.lock.withLock(root, scope.scope, async () => {
        this.spinner.start(`Force-pushing scope "${scope.scope}"…`);
        try {
          const map = await this.records.loadScopeMap(root, scope.scope);
          const changes: ColumnChange[] = [];
          for (const { folder, meta } of map.values()) {
            let files: string[] = [];
            try {
              files = await readdir(folder);
            } catch {
              files = [];
            }
            for (const file of files) {
              if (file === 'record_metadata.json') continue;
              const column = basename(file).replace(/\.[^.]+$/, '');
              if (meta.$hash[column] === undefined) continue;
              const filePath = join(folder, file);
              const content = await readFile(filePath, 'utf8');
              changes.push({
                sysId: meta.$sys_id,
                table: meta.$table,
                column,
                localChanged: true,
                remoteChanged: false,
                klass: 'keep-local',
                base: (meta[column] as string | undefined) ?? '',
                local: content,
                remote: '',
                folder,
                filePath,
              });
            }
          }
          if (changes.length > 0) {
            await this.pushStage.push({ snAuth: current.snAuth, changes });
          }
          this.spinner.succeed(`Scope "${scope.scope}" pushed.`);
        } catch (err) {
          this.spinner.fail(`Scope "${scope.scope}" failed.`);
          throw err;
        }
      });
    }
  }

  /** Start file watching (unless --force-pull) and the sys_metadata poll (OS-13). */
  private async startHot(options: SyncOptions): Promise<void> {
    const root = await this.projectConfig.ensureProjectRoot();
    const config = await this.projectConfig.read(root);
    const intervalMs = (config.hot?.pullInterval ?? 10) * 1000;

    if (!options.forcePull) {
      await this.watcher.watch(root, options.scope, (p) => this.pushFile(p, options));
    }

    this.hotInterval = setInterval(() => {
      void this.pollOnce(options);
    }, intervalMs);
  }

  /** One lightweight sys_metadata request per tracked scope; run the full pipeline only on a change (OS-13). */
  private async pollOnce(options: SyncOptions): Promise<boolean> {
    for (const input of await this.pullInputs(options)) {
      const changed = await this.pullStage.detectChanges(input);
      if (changed.length > 0) {
        await this.syncOnce(options);
        return true;
      }
    }
    return false;
  }

  /** Stop the poll interval and close the watcher (shutdown / SIGINT / tests). */
  async stopHot(): Promise<void> {
    if (this.hotInterval) {
      clearInterval(this.hotInterval);
      this.hotInterval = undefined;
    }
    await this.watcher.stop();
  }

  /** Build a PullInput for each targeted scope, deriving lastUpdated from stored metadata. */
  private async pullInputs(options: SyncOptions): Promise<PullInput[]> {
    const root = await this.projectConfig.ensureProjectRoot();
    const config = await this.projectConfig.read(root);
    let scopes = config.project?.scopes ?? [];
    if (options.scope) scopes = scopes.filter((s) => s.scope === options.scope);

    const current = await this.auth.current();
    if (!current || scopes.length === 0) return [];

    const trackConfig = await this.trackedTables.getProjectTrackTables(root);
    const inputs: PullInput[] = [];
    for (const scope of scopes) {
      const lastUpdated = await this.lastUpdatedForScope(root, scope.scope);
      inputs.push({ root, scope, snAuth: current.snAuth, trackConfig, lastUpdated });
    }
    return inputs;
  }

  /** Push a single file that changed on disk (hot-mode callback). */
  private async pushFile(filePath: string, _options: SyncOptions): Promise<void> {
    const current = await this.auth.current();
    if (!current) return;
    const folder = dirname(filePath);
    const meta = await this.records.read(folder);
    if (!meta?.$sys_id) return;

    const baseName = basename(filePath);
    const column = baseName.replace(/\.[^.]+$/, '');
    const content = await readFile(filePath, 'utf8').catch(() => '');
    const change: ColumnChange = {
      sysId: meta.$sys_id,
      table: meta.$table,
      column,
      localChanged: true,
      remoteChanged: false,
      klass: 'keep-local',
      base: (meta[column] as string | undefined) ?? '',
      local: content,
      remote: '',
      folder,
      filePath,
    };
    await this.pushStage.push({ snAuth: current.snAuth, changes: [change] });
  }

  /** Latest `$sys_updated_on` in a scope's records, or undefined when the scope has no records. */
  private async lastUpdatedForScope(root: string, scope: string): Promise<string | undefined> {
    const map = await this.records.loadScopeMap(root, scope);
    let max = '';
    for (const { meta } of map.values()) {
      if (meta.$sys_updated_on > max) max = meta.$sys_updated_on;
    }
    return max || undefined;
  }
}
