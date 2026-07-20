/**
 * @file table-schema.service.ts
 * Service layer for table schema access. Wraps the schema API client with an
 * in-memory per-table cache and provides utilities like column-type deduplication
 * and tracked-type resolution.
 */
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { AuthService } from '../authentication/auth.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { ProjectConfigService } from '../config/project/project-config.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TrackedTablesService } from '../config/tracked-tables/tracked-tables.service';
import type { SchemaElement } from './table-schema.types';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TableSchemaApiClient } from './table-schema-api.client';

/**
 * Unique column type with tracked status.
 */
export interface UniqueColumnType {
  internal_type: string;
  tracked: boolean;
}

@Injectable()
export class TableSchemaService {
  private readonly cache = new Map<string, SchemaElement[]>();

  constructor(
    private readonly schemaApi: TableSchemaApiClient,
    private readonly auth: AuthService,
    private readonly trackedTables: TrackedTablesService,
    private readonly projectConfig: ProjectConfigService,
  ) {}

  /**
   * Get the schema for a table, using an in-memory cache to avoid redundant API calls.
   * @param tableName - The table name.
   * @returns An array of SchemaElement objects.
   * @throws Error if there is no current connection.
   */
  async getSchema(tableName: string): Promise<SchemaElement[]> {
    const cached = this.cache.get(tableName);
    if (cached !== undefined) {
      return cached;
    }

    const current = await this.auth.current();
    if (!current) {
      throw new Error('No current connection. Run `aify auth add` first.');
    }

    const elements = await this.schemaApi.fetchSchemaXml(current.snAuth, tableName);
    this.cache.set(tableName, elements);
    return elements;
  }

  /**
   * Get unique column types for a table (deduplicated by internal_type, first occurrence wins).
   * For each unique type, resolve whether it is tracked in the project config.
   * @param tableName - The table name.
   * @returns An array of unique column types with tracked status, in order of first occurrence.
   */
  async getUniqueColumnTypes(tableName: string): Promise<UniqueColumnType[]> {
    const schema = await this.getSchema(tableName);
    const seen = new Set<string>();
    const unique: SchemaElement[] = [];

    // Deduplicate by internal_type, keeping first occurrence.
    for (const elem of schema) {
      if (!seen.has(elem.internal_type)) {
        seen.add(elem.internal_type);
        unique.push(elem);
      }
    }

    // Resolve project root and tracked types.
    const root = await this.projectConfig.findProjectRoot();
    const { column_types } = await this.trackedTables.getProjectTrackTables(root ?? process.cwd());

    // Map to UniqueColumnType with tracked status.
    return unique.map((elem) => ({
      internal_type: elem.internal_type,
      tracked: Object.hasOwn(column_types, elem.internal_type),
    }));
  }
}
