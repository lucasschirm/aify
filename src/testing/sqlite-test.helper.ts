/**
 * In-memory SQLite bootstrap for aify tests.
 *
 * Builds a `sequelize-typescript` Sequelize backed by `:memory:` so DB tests are
 * isolated and never touch `~/.aify/aifydb.sqlite3`. `bootstrapTestDb` also runs
 * `sync({ force: true })` for a clean schema per test.
 */
import { type ModelCtor, Sequelize } from 'sequelize-typescript';

/** Create (but do not sync) an in-memory sqlite Sequelize with the given models. */
export function createInMemorySequelize(models: ModelCtor[] = []): Sequelize {
  return new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
    models,
  });
}

/** Create + `sync({ force: true })` an in-memory db, ready for inserts. */
export async function bootstrapTestDb(models: ModelCtor[] = []): Promise<Sequelize> {
  const sequelize = createInMemorySequelize(models);
  await sequelize.sync({ force: true });
  return sequelize;
}
