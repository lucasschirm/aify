import { Column, Model, Table } from 'sequelize-typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapTestDb, createInMemorySequelize } from './sqlite-test.helper';

@Table({ tableName: 'widgets', timestamps: false })
class Widget extends Model {
  @Column
  declare name: string;
}

let sequelize: Awaited<ReturnType<typeof bootstrapTestDb>> | undefined;

afterEach(async () => {
  await sequelize?.close();
  sequelize = undefined;
});

describe('sqlite-test helper', () => {
  it('builds an in-memory sqlite Sequelize', () => {
    const s = createInMemorySequelize();
    expect(s.getDialect()).toBe('sqlite');
    expect(s.options.storage).toBe(':memory:');
  });

  it('bootstraps a synced in-memory db that can insert and read', async () => {
    sequelize = await bootstrapTestDb([Widget]);
    await Widget.create({ name: 'gear' });

    const found = await Widget.findOne({ where: { name: 'gear' } });

    expect(found?.name).toBe('gear');
  });
});