/**
 * @file sequelize.factory.ts
 * Builds a configured Sequelize instance backed by SQLite for aify's database and
 * registers every aify model on it. It does NOT call sync() — schema synchronization
 * is owned by DatabaseModule so a plain Sequelize can be used in isolation (tests, the
 * template-db build script).
 */
import { Sequelize } from 'sequelize-typescript';
import { Instance } from './models/instance.model';
import { Auth } from './models/auth.model';
import { Application } from './models/application.model';

/**
 * Create a SQLite-backed Sequelize instance and register aify's models.
 *
 * @param storagePath Absolute path to the SQLite file, or ':memory:' for tests.
 * @returns A configured, un-synced Sequelize instance.
 */
export function buildSequelize(storagePath: string): Sequelize {
  return new Sequelize({
    dialect: 'sqlite',
    storage: storagePath,
    logging: false,
    // Models: Instance (TASK_008), Auth (TASK_009), Application (TASK_010).
    models: [Instance, Auth, Application],
  });
}
