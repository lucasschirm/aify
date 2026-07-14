#!/usr/bin/env node
/**
 * aify CLI entry point.
 *
 * Imports reflect-metadata once (required for NestJS decorator metadata / DI),
 * then boots the nest-commander CommandFactory against the root AppModule.
 * cliName + version give commander its `--help` banner and `--version` flag.
 */
import 'reflect-metadata';
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module';

// Read version from the shipped package.json (resolves relative to dist/main.js at runtime).
const { version } = require('../package.json') as { version: string };

async function bootstrap(): Promise<void> {
  await CommandFactory.run(AppModule, {
    cliName: 'aify',
    version,
  });
}

void bootstrap();