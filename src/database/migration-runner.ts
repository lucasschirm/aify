/**
 * @file migration-runner.ts
 * Applies pending umzug migrations against the shared SQLite database. When the module
 * initializes it first synchronizes the schema (create-missing-tables only) and then runs
 * the registered migrations. Each migration is tracked in the `SequelizeMeta` table managed
 * by umzug's `SequelizeStorage`. New migrations must be imported and registered in `MIGRATIONS`.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { QueryInterface } from 'sequelize';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { Sequelize } from 'sequelize-typescript';
import { type RunnableMigration, SequelizeStorage, Umzug } from 'umzug';
import * as addLastSyncedAt from './migrations/0001_add-lastSyncedAt-to-applications';

const MIGRATIONS: RunnableMigration<QueryInterface>[] = [
  {
    name: '0001_add-lastSyncedAt-to-applications',
    up: addLastSyncedAt.up,
    down: addLastSyncedAt.down,
  },
];

@Injectable()
export class MigrationRunner implements OnModuleInit {
  constructor(private readonly sequelize: Sequelize) {}

  /** Bootstrap the schema and apply all pending migrations. */
  async onModuleInit(): Promise<void> {
    await this.sequelize.sync();
    await this.runMigrations();
  }

  /** Apply all pending migrations tracked by umzug. */
  async runMigrations(): Promise<void> {
    const umzug = new Umzug<QueryInterface>({
      migrations: MIGRATIONS,
      context: this.sequelize.getQueryInterface(),
      storage: new SequelizeStorage({ sequelize: this.sequelize }),
      logger: undefined,
    });

    await umzug.up();
  }
}
