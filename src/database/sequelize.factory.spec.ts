/**
 * @file sequelize.factory.test.ts
 * Tests for the buildSequelize SQLite factory.
 */
import { Sequelize } from 'sequelize-typescript';
import { describe, expect, it } from 'vitest';
import { buildSequelize } from './sequelize.factory';

describe('buildSequelize', () => {
  it('returns a Sequelize instance that authenticates against :memory:', async () => {
    const sequelize = buildSequelize(':memory:');
    expect(sequelize).toBeInstanceOf(Sequelize);
    await expect(sequelize.authenticate()).resolves.toBeUndefined();
    await sequelize.close();
  });

  it('syncs without error (no models registered yet)', async () => {
    const sequelize = buildSequelize(':memory:');
    await expect(sequelize.sync()).resolves.toBe(sequelize);
    await sequelize.close();
  });
});
