/**
 * @file build-template-db.test.ts
 * Tests for the build-template-db build script.
 */
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sequelize } from 'sequelize-typescript';
import { buildTemplateDb } from './build-template-db';
import { describe, expect, it } from 'vitest';

describe('buildTemplateDb', () => {
  it('produces a sqlite file whose tables match the models', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aify-tpl-'));
    const dbPath = join(dir, 'template_db.sqlite3');

    const returned = await buildTemplateDb(dbPath);

    expect(returned).toBe(dbPath);
    expect(existsSync(dbPath)).toBe(true);

    const sequelize = new Sequelize({ dialect: 'sqlite', storage: dbPath, logging: false });
    const [rows] = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const tables = (rows as { name: string }[]).map((r) => r.name);
    expect(tables).toEqual(['applications', 'auth', 'instances']);
    await sequelize.close();
  });

  it('is idempotent — rebuilding over an existing file yields the same tables', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aify-tpl-'));
    const dbPath = join(dir, 'template_db.sqlite3');

    await buildTemplateDb(dbPath);
    await buildTemplateDb(dbPath); // must not throw on a pre-existing file

    const sequelize = new Sequelize({ dialect: 'sqlite', storage: dbPath, logging: false });
    const [rows] = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    expect((rows as { name: string }[]).map((r) => r.name)).toEqual([
      'applications',
      'auth',
      'instances',
    ]);
    await sequelize.close();
  });
});
