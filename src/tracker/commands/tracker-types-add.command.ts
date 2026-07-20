/**
 * @file tracker-types-add.command.ts
 * @description `aify tracker types add` — Configure a new column type. Optionally source
 * column types from a live table schema via `--table`. Delegates to TrackerTypeService.
 */

import { CommandRunner, Option, SubCommand } from 'nest-commander';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TrackerTargetService } from '../tracker-target.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TrackerTypeService } from '../tracker-type.service';

interface TrackerTypesAddOptions {
  global?: boolean;
  table?: string;
}

@SubCommand({ name: 'add', description: 'Configure a new column type.' })
export class TrackerTypesAddCommand extends CommandRunner {
  constructor(
    private readonly targetService: TrackerTargetService,
    private readonly trackerTypeService: TrackerTypeService,
  ) {
    super();
  }

  async run(_params: string[], options: TrackerTypesAddOptions = {}): Promise<void> {
    const target = await this.targetService.resolve(options, 'type');
    if (!target) {
      return;
    }

    await this.trackerTypeService.addType({ target, table: options.table });
    console.log('Column type configured.');
  }

  @Option({ flags: '--global', description: 'Write to the global configuration.' })
  parseGlobal(v?: boolean): boolean {
    return v ?? true;
  }

  @Option({
    flags: '--table <table>',
    description: 'Source column types from a live table schema.',
  })
  parseTable(value: string): string {
    return value;
  }
}
