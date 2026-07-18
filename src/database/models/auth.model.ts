/**
 * @file auth.model.ts
 * Sequelize model for a stored ServiceNow credential's METADATA only. The password is NEVER
 * stored here — it lives in the OS keychain via keytar (OS-17). `alias` is globally unique
 * (OS-16). `isCurrent` is a single global flag telling `sync` which instance to target; a
 * combination of @AfterCreate / @AfterUpdate / @AfterUpsert hooks enforces that at most one
 * row is current — whenever a row is written with isCurrent=true, every OTHER row is flipped
 * back to false (via a bulk update with hooks:false so the hook does not re-fire).
 */
import { Op } from 'sequelize';
import {
  AllowNull,
  AutoIncrement,
  AfterCreate,
  AfterUpdate,
  AfterUpsert,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';
import { Instance } from './instance.model';

@Table({ tableName: 'auth', timestamps: false })
export class Auth extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  /** Globally unique alias identifying this credential (OS-16). */
  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(200) })
  declare alias: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(200) })
  declare username: string;

  @ForeignKey(() => Instance)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare instanceId: number;

  /**
   * Association to the owning Instance. Eager-loaded via `include: [Instance]` by
   * `AuthService.list()` (TASK_019) and read as `auth.instance` by `renderAuthList` (TASK_021).
   */
  @BelongsTo(() => Instance)
  declare instance?: Instance;

  /** Single GLOBAL "current" flag: tells `sync` which instance to target (OS-16). */
  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isCurrent: boolean;

  /** Updated on every successful authentication (including syncs). */
  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare lastUsedAt: Date | null;

  /**
   * Enforce a single global current credential: when a row is written with isCurrent=true,
   * set isCurrent=false on every OTHER row. Uses a bulk update with hooks:false so the
   * @AfterUpdate hook does not re-fire on the rows being cleared — no recursion. Wired to
   * @AfterCreate (Auth.create), @AfterUpdate (instance.save on an existing row), and
   * @AfterUpsert (Auth.upsert / findOrCreate-with-upsert) so every write path that promotes
   * a row to current also demotes the rest.
   */
  @AfterCreate
  @AfterUpdate
  @AfterUpsert
  static async enforceSingleCurrent(entity: Auth): Promise<void> {
    if (!entity.isCurrent) return;
    const where = entity.id ? { id: { [Op.ne]: entity.id } } : {};
    await Auth.update({ isCurrent: false }, { where, hooks: false });
  }
}
