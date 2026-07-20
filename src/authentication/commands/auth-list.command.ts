/**
 * @file auth-list.command.ts
 * @description `aify auth list` — prints saved ServiceNow connections as a formatted table
 * (via cli-table3) with columns `is_current | alias | instance | username | last_used`. The
 * current connection is marked with `*`; a never-used connection shows `never`. Rendering is a
 * pure function for testability.
 */

import Table from 'cli-table3';
import { CommandRunner, SubCommand } from 'nest-commander';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { AuthService } from '../auth.service';

/** One presentation row of the connection list. */
export interface AuthListRow {
  isCurrent: boolean;
  alias: string;
  instance: string;
  username: string;
  lastUsedAt: Date | null;
}

const HEADERS = ['is_current', 'alias', 'instance', 'username', 'last_used'];

/** Render the connection list as a formatted cli-table3 table. Pure — no I/O. */
export function renderAuthList(rows: AuthListRow[]): string {
  const table = new Table({ head: HEADERS, style: { head: [], border: [] } });
  if (rows.length === 0) {
    table.push([{ content: '_no connections_', colSpan: HEADERS.length }]);
    return table.toString();
  }
  for (const r of rows) {
    const current = r.isCurrent ? '*' : '';
    const lastUsed = r.lastUsedAt ? r.lastUsedAt.toISOString() : 'never';
    table.push([current, r.alias, r.instance, r.username, lastUsed]);
  }
  return table.toString();
}

@SubCommand({ name: 'list', description: 'List saved ServiceNow connections.' })
export class AuthListCommand extends CommandRunner {
  constructor(private readonly authService: AuthService) {
    super();
  }

  async run(): Promise<void> {
    const auths = await this.authService.list();
    const rows: AuthListRow[] = auths.map((a) => ({
      isCurrent: a.isCurrent,
      alias: a.alias,
      instance: a.instance?.instance ?? '',
      username: a.username,
      lastUsedAt: a.lastUsedAt,
    }));
    console.log(renderAuthList(rows));
  }
}
