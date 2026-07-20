/**
 * @file app-list.command.ts
 * @description `aify app list` — displays tracked applications and their last sync time
 * as a formatted table (via cli-table3) with columns `scope | name | last_synced`. Rendering
 * is a pure function for testability.
 */

import Table from 'cli-table3';
import { CommandRunner, SubCommand } from 'nest-commander';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { ProjectConfigService } from '../../config/project/project-config.service';
import { Application } from '../../database/models/application.model';

/** One presentation row of the application list. */
export interface AppListRow {
  scope: string;
  name: string;
  lastSyncedAt: Date | null;
}

const HEADERS = ['scope', 'name', 'last_synced'];

/** Render the application list as a formatted cli-table3 table. Pure — no I/O. */
export function renderAppList(rows: AppListRow[]): string {
  const table = new Table({ head: HEADERS });
  if (rows.length === 0) {
    table.push([{ content: '_no applications tracked_', colSpan: HEADERS.length }]);
    return table.toString();
  }
  for (const r of rows) {
    const lastSynced = r.lastSyncedAt ? r.lastSyncedAt.toISOString() : 'never';
    table.push([r.scope, r.name, lastSynced]);
  }
  return table.toString();
}

@SubCommand({
  name: 'list',
  description: 'List tracked applications and their last sync time.',
})
export class AppListCommand extends CommandRunner {
  constructor(private readonly projectConfig: ProjectConfigService) {
    super();
  }

  async run(): Promise<void> {
    const root = await this.projectConfig.findProjectRoot();
    if (!root) {
      console.log('Not in an aify project. Run `aify app init` first.');
      return;
    }

    const config = await this.projectConfig.read(root);
    const scopes = config.project?.scopes ?? [];

    const rows: AppListRow[] = [];
    for (const scope of scopes) {
      const app = await Application.findOne({ where: { scope: scope.scope } });
      rows.push({
        scope: scope.scope,
        name: app?.displayValue ?? scope.scope,
        lastSyncedAt: app?.lastSyncedAt ?? null,
      });
    }

    console.log(renderAppList(rows));
  }
}
