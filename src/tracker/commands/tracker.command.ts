/**
 * @file tracker.command.ts
 * @description Parent `aify tracker` command group. Running `aify tracker` with no subcommand
 * prints help; the actual work lives in the subcommands registered here.
 */

import { Command, CommandRunner } from 'nest-commander';
import { TrackerTablesCommand } from './tracker-tables.command';
import { TrackerTypesCommand } from './tracker-types.command';

@Command({
  name: 'tracker',
  description: 'Configure tracked tables and column types.',
  subCommands: [TrackerTablesCommand, TrackerTypesCommand],
})
export class TrackerCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
