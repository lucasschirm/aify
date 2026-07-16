/**
 * @file application.service.ts
 * @description Business logic for the `aify app` command group. Queries `sys_scope` on the
 * instance by scope OR sys_id, scaffolds a local `${scope}/sys_package.json`, adds the scope
 * to `.aify.config.json`, and inserts an `Application` row. aify never creates applications
 * on the instance — it only tracks existing ones locally.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { type SnAuth, TableApiClient } from '../api/table-api.client';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { AuthService } from '../authentication/auth.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { GlobalConfigService } from '../config/global/global-config.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { ProjectConfigService } from '../config/project/project-config.service';
import { Application } from '../database/models/application.model';

@Injectable()
export class ApplicationService {
  constructor(
    private readonly tableApi: TableApiClient,
    private readonly auth: AuthService,
    private readonly projectConfig: ProjectConfigService,
    private readonly globalConfig: GlobalConfigService,
  ) {}

  /**
   * Look up a scoped application on the instance by `scope OR sys_id`, scaffold
   * `${scope}/sys_package.json` under `projectRoot`, add the scope to `.aify.config.json`,
   * and insert the `Application` row. Logs `Application <param> not found` (per-day log)
   * and throws when the instance returns no match.
   */
  async init(param: string, projectRoot: string): Promise<Application> {
    const current = await this.auth.current();
    if (!current) {
      throw new Error('No current connection. Run `aify auth add` first.');
    }
    const snAuth: SnAuth = current.snAuth;

    const records = await this.tableApi.list(snAuth, 'sys_scope', {
      query: `scope=${param}^ORsys_id=${param}`,
      fields: ['sys_id', 'scope', 'title'],
      limit: 1,
    });

    if (records.length === 0) {
      await this.globalConfig.log(`Application ${param} not found`);
      throw new Error(`Application "${param}" not found on the instance.`);
    }

    const record = records[0];
    const scope: string = record.scope as string;
    const sysId: string = record.sys_id as string;
    const displayValue: string = (record.title as string) || scope;

    // Scaffold ${scope}/sys_package.json under the project root.
    const scopeDir = join(projectRoot, scope);
    await mkdir(scopeDir, { recursive: true });
    await writeFile(
      join(scopeDir, 'sys_package.json'),
      `${JSON.stringify({ scope, sysId, name: displayValue }, null, 2)}\n`,
      'utf8',
    );

    // Add the scope to .aify.config.json (deduped by sysId).
    await this.projectConfig.addScope(projectRoot, { sysId, scope });

    // Insert or update the Application row (upsert by sysId).
    const [app] = await Application.findOrCreate({
      where: { sysId },
      defaults: { scope, sysId, displayValue },
    });
    if (app.displayValue !== displayValue || app.scope !== scope) {
      app.scope = scope;
      app.displayValue = displayValue;
      await app.save();
    }

    return app;
  }
}
