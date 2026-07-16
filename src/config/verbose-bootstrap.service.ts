/**
 * @file verbose-bootstrap.service.ts
 * Registers the global `--verbose` flag on the nest-commander `Command` instance and
 * wires a `preAction` hook that propagates the parsed value to `GlobalConfigService`
 * before any command's `run()` executes. This is the single source of truth for
 * enabling verbose mode — no individual command needs to declare or read the flag.
 *
 * nest-commander creates its own `Command` instance via DI (`useClass: Command`), which
 * is **not** commander's `program` singleton. We therefore use `@InjectCommander()` to
 * get the exact instance that `CommandFactory` will parse `process.argv` against, and
 * add the option + hook in `onModuleInit()` (all `OnModuleInit` hooks fire before
 * `commander.parseAsync` is called in `CommandFactory.runApplication`).
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Command } from 'commander';
import { InjectCommander } from 'nest-commander';
// biome-ignore lint/style/useImportType: required for Nest DI runtime metadata
import { GlobalConfigService } from './global/global-config.service';

@Injectable()
export class VerboseBootstrapService implements OnModuleInit {
  constructor(
    @InjectCommander() private readonly commander: Command,
    private readonly globalConfig: GlobalConfigService,
  ) {}

  onModuleInit(): void {
    this.commander.option(
      '-v, --verbose',
      'Log every ServiceNow API request to ~/.aify/logs with a DEBUG: prefix',
    );
    this.commander.hook('preAction', (_thisCmd, actionCmd) => {
      const opts = actionCmd.optsWithGlobals() as { verbose?: boolean };
      if (opts.verbose) {
        this.globalConfig.setVerbose(true);
      }
    });
  }
}
