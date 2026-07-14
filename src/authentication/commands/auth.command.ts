/**
 * @file auth.command.ts
 * @description Parent `aify auth` command group. Running `aify auth` with no subcommand prints
 * help; the actual work lives in the subcommands registered here.
 */
import { Command, CommandRunner } from 'nest-commander';
import { AuthAddCommand } from './auth-add.command';

@Command({
  name: 'auth',
  description: 'Manage ServiceNow connections.',
  subCommands: [AuthAddCommand],
})
export class AuthCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
