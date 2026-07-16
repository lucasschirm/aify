/**
 * @file instance.model.ts
 * Sequelize model for a ServiceNow instance. `instance` holds the HOST ONLY and is unique;
 * `url` holds the full URL (scheme + trailing slash). Rows are only ever added, after a
 * successful authentication, so an instance is known to exist.
 */
import {
  AllowNull,
  AutoIncrement,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';

@Table({ tableName: 'instances', timestamps: false })
export class Instance extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  /** Host only, e.g. 'lucas.service-now.com' (no scheme, no path). */
  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(200) })
  declare instance: string;

  /** Full URL with scheme and trailing slash, e.g. 'https://lucas.service-now.com/'. */
  @AllowNull(false)
  @Column({ type: DataType.STRING(2048) })
  declare url: string;
}
