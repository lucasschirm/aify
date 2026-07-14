/**
 * @file database.module.ts
 * NestJS module that owns the shared Sequelize instance. On startup it synchronizes the
 * schema with sync({ alter: true }) — additive evolution only; it NEVER drops columns
 * (OS-29). SQLite's alter can rebuild tables; umzug migrations are planned for later.
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

  /** Synchronize the schema additively on startup (never drops columns, OS-29). */
  async onModuleInit(): Promise<void> {
    await this.sequelize.sync({ alter: true });
  }
}
