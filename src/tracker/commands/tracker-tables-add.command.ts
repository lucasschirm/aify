/**
 * @file tracker-tables-add.command.ts
 * @description `aify tracker tables add` — Track a new table and its columns. Delegates to
 * TrackerService after resolving the target (global or project).
 */

import { CommandRunner, Option, SubCommand } from 'nest-commander';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TrackerService } from '../tracker.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TrackerTargetService } from '../tracker-target.service';

interface TrackerTablesAddOptions {
  global?: boolean;
}

@SubCommand({ name: 'add', description: 'Track a new table and its columns.' })
export class TrackerTablesAddCommand extends CommandRunner {
  constructor(
    private readonly targetService: TrackerTargetService,
    private readonly trackerService: TrackerService,
  ) {
    super();
  }

  async run(_params: string[], options: TrackerTablesAddOptions = {}): Promise<void> {
    const target = await this.targetService.resolve(options, 'table');
    if (!target) {
      return;
    }

    await this.trackerService.add({ target });
  }

  @Option({ flags: '--global', description: 'Write to the global configuration.' })
  parseGlobal(v?: boolean): boolean {
    return v ?? true;
  }
}
