/**
 * @file database.module.spec.ts
 * Tests for DatabaseModule bootstrap and sync behavior.
 */
import { Test } from '@nestjs/testing';
import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { Sequelize } from 'sequelize-typescript';
import { describe, expect, it } from 'vitest';
import { DatabaseModule, SEQUELIZE } from './database.module';

@Table({ tableName: 'probes', timestamps: false })
class Probe extends Model {
  @Column({ type: DataType.STRING }) declare label: string;
}

describe('DatabaseModule', () => {
  it('provides a Sequelize instance under both Sequelize and SEQUELIZE', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRoot(':memory:')],
    }).compile();
    await moduleRef.init();
    expect(moduleRef.get(Sequelize)).toBeInstanceOf(Sequelize);
    expect(moduleRef.get(SEQUELIZE)).toBe(moduleRef.get(Sequelize));
    await moduleRef.close();
  });

  it('runs sync({ alter: true }) on init, creating registered tables', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRoot(':memory:')],
    }).compile();
    const sequelize = moduleRef.get(Sequelize);
    sequelize.addModels([Probe]);
    await moduleRef.init(); // triggers onModuleInit -> sequelize.sync({ alter: true })
    const tables = await sequelize.getQueryInterface().showAllTables();
    expect(tables).toContain('probes');
    await moduleRef.close();
  });
});
