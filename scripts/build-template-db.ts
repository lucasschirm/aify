/**
 * @file build-template-db.ts
 * Build-time script: emit an EMPTY templates/template_db.sqlite3 from the Sequelize models
 * (build a Sequelize against that file, sync the schema, close). This prebuilt DB ships in the
 * npm package (files allowlist, TASK_030) and is copied to ~/.aify/aifydb.sqlite3 on first use,
 * so the CLI never pays schema-creation cost at runtime. CI checks it against sync() for drift.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildSequelize } from '../src/database/sequelize.factory';

/** Default output path: <repo>/templates/template_db.sqlite3. */
const DEFAULT_TEMPLATE_DB_PATH = join(__dirname, '..', 'templates', 'template_db.sqlite3');

/**
 * Build (or rebuild) the empty template SQLite database from the registered models.
 *
 * @param targetPath Where to write the file. Defaults to templates/template_db.sqlite3.
 * @returns The absolute path of the written database file.
 */
export async function buildTemplateDb(
  targetPath: string = DEFAULT_TEMPLATE_DB_PATH,
): Promise<string> {
  mkdirSync(dirname(targetPath), { recursive: true });
  rmSync(targetPath, { force: true }); // start from a clean file so the schema is exact
  const sequelize = buildSequelize(targetPath);
  await sequelize.sync();
  await sequelize.close();
  return targetPath;
}

// Executed directly via `pnpm build:template-db`.
if (require.main === module) {
  buildTemplateDb()
    .then((path) => {
      // biome-ignore lint/suspicious/noConsole: build script user feedback
      console.log(`Built template database at ${path}`);
    })
    .catch((error) => {
      // biome-ignore lint/suspicious/noConsole: build script error output
      console.error(error);
      process.exit(1);
    });
}
