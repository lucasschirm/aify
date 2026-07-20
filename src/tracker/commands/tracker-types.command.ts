/**
 * @file tracker-types.command.ts
 * @description Parent `aify tracker types` command group. Running `aify tracker types` with no
 * subcommand prints help; the actual work lives in the subcommands registered here.
 */

import { CommandRunner, SubCommand } from 'nest-commander';
import { TrackerTypesAddCommand } from './tracker-types-add.command';

@SubCommand({
  name: 'types',
  description: 'Manage column types.',
  subCommands: [TrackerTypesAddCommand],
})
export class TrackerTypesCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
