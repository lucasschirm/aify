/**
 * @file application.model.ts
 * Sequelize model for a tracked ServiceNow scoped application. `scope`, `sysId` and
 * `displayValue` are each unique. It has NO instance link (OS-20): if a project moves to a
 * new instance the user switches the current auth and re-syncs; aify does not model
 * multi-instance.
 */
import {
  AllowNull,
  AutoIncrement,
  Column,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';

@Table({ tableName: 'applications', timestamps: false })
export class Application extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  /** Normalized application scope, e.g. 'x_acme_app'. */
  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(120) })
  declare scope: string;

  /** ServiceNow sys_id of the sys_scope record (32 hex chars). */
  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(32) })
  declare sysId: string;

  /** Human-readable application name (display value). */
  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(120) })
  declare displayValue: string;

  /** Timestamp of the last successful sync, or null if never synced. */
  @AllowNull(true)
  @Default(null)
  @Column({ type: DataType.DATE })
  declare lastSyncedAt: Date | null;
}
