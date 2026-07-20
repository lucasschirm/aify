/**
 * @file tracker-tables.command.ts
 * @description Parent `aify tracker tables` command group. Running `aify tracker tables` with no
 * subcommand prints help; the actual work lives in the subcommands registered here.
 */

import { CommandRunner, SubCommand } from 'nest-commander';
import { TrackerTablesAddCommand } from './tracker-tables-add.command';

@SubCommand({
  name: 'tables',
  description: 'Manage tracked tables.',
  subCommands: [TrackerTablesAddCommand],
})
export class TrackerTablesCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
