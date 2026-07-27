/**
 * @file 0001_add-lastSyncedAt-to-applications.ts
 * Adds the nullable `lastSyncedAt` column to the `applications` table for users
 * who installed aify before the column was introduced. The guard is idempotent:
 * if the column already exists (fresh installs from the bundled template DB), it
 * skips the ALTER. The `down` is a no-op because SQLite cannot drop a column
 * without rebuilding the table (OS-29).
 */
import { DataTypes, type QueryInterface } from 'sequelize';

interface MigrationContext {
  context: QueryInterface;
}

export async function up({ context: queryInterface }: MigrationContext): Promise<void> {
  const columns = await queryInterface.describeTable('applications');
  if (columns.lastSyncedAt) {
    return;
  }

  await queryInterface.addColumn('applications', 'lastSyncedAt', {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  });
}

export async function down({ context: queryInterface }: MigrationContext): Promise<void> {
  // Intentional no-op. SQLite's ALTER TABLE DROP COLUMN rebuilds the table and
  // is too fragile against drifted/seeded local databases (OS-29).
  void queryInterface;
}
