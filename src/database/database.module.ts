/**
 * @file database.module.ts
 * NestJS module that owns the shared Sequelize instance. `forRoot` provides a globally
 * available SQLite-backed Sequelize and a `MigrationRunner` that synchronizes the schema
 * (create-missing-tables only; it NEVER alters or drops existing columns/tables, OS-29)
 * and runs pending umzug migrations on startup. The canonical schema for fresh installs is
 * the packaged templates/template_db.sqlite3, built from these models and CI-checked for drift.
 */
import { type DynamicModule, Module } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { MigrationRunner } from './migration-runner';
import { buildSequelize } from './sequelize.factory';

/** DI token for the shared Sequelize instance. */
export const SEQUELIZE = 'SEQUELIZE';

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic module factory
export class DatabaseModule {
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
        MigrationRunner,
      ],
      exports: [Sequelize, SEQUELIZE],
    };
  }
}
