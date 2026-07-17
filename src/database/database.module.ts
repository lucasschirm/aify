/**
 * @file database.module.ts
 * NestJS module that owns the shared Sequelize instance. On startup it synchronizes the
 * schema with sync() — create-missing-tables only; it NEVER alters or drops existing
 * columns/tables (OS-29). SQLite's alter rebuilds tables and is fragile against seeded
 * DBs that have drifted from the models (orphaned `_backup` tables, UNIQUE/FK constraint
 * failures), so runtime schema evolution is deferred to umzug migrations (planned, per
 * ARCHITECTURE.md). The canonical schema for fresh installs is the packaged
 * templates/template_db.sqlite3, built from these models and CI-checked for drift.
 */
import { type DynamicModule, Module, type OnModuleInit } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { buildSequelize } from './sequelize.factory';

/** DI token for the shared Sequelize instance. */
export const SEQUELIZE = 'SEQUELIZE';

@Module({})
export class DatabaseModule implements OnModuleInit {
  constructor(private readonly sequelize: Sequelize) {}

  /**
   * Configure the module with a SQLite storage path and expose the Sequelize instance
   * globally so every domain module can inject it.
   *
   * @param storagePath Absolute path to the SQLite file, or ':memory:' in tests.
   */
  static forRoot(storagePath: string): DynamicModule {
    const sequelize = buildSequelize(storagePath);
    return {
      module: DatabaseModule,
      global: true,
      providers: [
        { provide: Sequelize, useValue: sequelize },
        { provide: SEQUELIZE, useValue: sequelize },
      ],
      exports: [Sequelize, SEQUELIZE],
    };
  }

  /** Synchronize the schema on startup — create-missing-tables only (never alters/drops, OS-29). */
  async onModuleInit(): Promise<void> {
    await this.sequelize.sync();
  }
}
