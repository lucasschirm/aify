#!/usr/bin/env node
/**
 * aify CLI entry point.
 *
 * Imports reflect-metadata once (required for NestJS decorator metadata / DI),
 * then boots the nest-commander CommandFactory against the root AppModule.
 * cliName + version give commander its `--help` banner and `--version` flag.
 * When no command is given, prints help instead of exiting silently. Any bootstrap
 * error is printed to stderr and the process exits non-zero (never fails silently).
 */
import 'reflect-metadata';
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module';
import { GlobalConfigService } from './config/global/global-config.service';

// Read version from the shipped package.json (resolves relative to dist/main.js at runtime).
const { version } = require('../package.json') as { version: string };

async function bootstrap(): Promise<void> {
  // Ensure ~/.aify exists (with the seeded template DB) before the DatabaseModule
  // tries to open aifydb.sqlite3. Without this, the SQLite open fails silently.
  const globalConfig = new GlobalConfigService();
  await globalConfig.ensureGlobalDir();

  // When no command/argument is given, show help instead of exiting silently.
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.argv.push('--help');
  }
  await CommandFactory.run(AppModule, {
    cliName: 'aify',
    version,
  });
}

void bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
