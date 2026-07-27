/**
 * @file migration-runner.spec.ts
 * Tests for MigrationRunner: idempotent schema repair of an existing DB missing the
 * `lastSyncedAt` column, and no-op behavior when the column already exists.
 */

import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationRunner } from './migration-runner';

describe('MigrationRunner', () => {
  let sequelize: Sequelize;
  let runner: MigrationRunner;

  beforeEach(async () => {
    sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false,
    });
    runner = new MigrationRunner(sequelize);
  });

  afterEach(async () => {
    await sequelize.close();
  });

  async function createLegacyApplicationsTable(): Promise<void> {
    await sequelize.query(`
      CREATE TABLE applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope VARCHAR(120) NOT NULL UNIQUE,
        sysId VARCHAR(32) NOT NULL UNIQUE,
        displayValue VARCHAR(120) NOT NULL UNIQUE
      )
    `);
  }

  async function createCurrentApplicationsTable(): Promise<void> {
    await createLegacyApplicationsTable();
    await sequelize.query('ALTER TABLE applications ADD COLUMN lastSyncedAt DATETIME');
  }

  async function getColumnNames(): Promise<string[]> {
    const rows = await sequelize.query<{ name: string }>('PRAGMA table_info(applications)', {
      type: QueryTypes.SELECT,
    });
    return rows.map((r) => r.name);
  }

  it('adds lastSyncedAt to an existing applications table and records the migration', async () => {
    await createLegacyApplicationsTable();

    await runner.runMigrations();

    const columns = await getColumnNames();
    expect(columns).toContain('lastSyncedAt');

    const [meta] = await sequelize.query<{ name: string }>(
      'SELECT name FROM "SequelizeMeta" ORDER BY name',
      { type: QueryTypes.SELECT },
    );
    expect(meta?.name).toBe('0001_add-lastSyncedAt-to-applications');
  });

  it('is idempotent and a no-op when lastSyncedAt already exists', async () => {
    await createCurrentApplicationsTable();

    await expect(runner.runMigrations()).resolves.toBeUndefined();

    const columns = await getColumnNames();
    expect(columns).toContain('lastSyncedAt');
  });

  it('is safe to run twice on the same database', async () => {
    await createLegacyApplicationsTable();

    await runner.runMigrations();
    await runner.runMigrations();

    const columns = await getColumnNames();
    expect(columns).toContain('lastSyncedAt');

    const rows = await sequelize.query<{ name: string }>(
      'SELECT name FROM "SequelizeMeta" WHERE name = :name',
      {
        type: QueryTypes.SELECT,
        replacements: { name: '0001_add-lastSyncedAt-to-applications' },
      },
    );
    expect(rows).toHaveLength(1);
  });
});
