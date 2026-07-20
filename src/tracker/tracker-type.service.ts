/**
 * @file tracker-type.service.ts
 * @description Service for adding new column types to the tracker configuration. Guides the
 * user through prompting for type name, file_name, extension, and behavior, then persists
 * to either the global or project configuration.
 */

import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TableSchemaService } from '../api/table-schema.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { PromptService } from '../authentication/prompt.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { ProjectConfigService } from '../config/project/project-config.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { GlobalTrackTablesService } from '../config/tracked-tables/global-track-tables.service';
import type { ColumnType } from '../config/tracked-tables/tracked-tables.types';
import type { TrackerTarget } from './tracker-target.service';

@Injectable()
export class TrackerTypeService {
  constructor(
    private readonly prompt: PromptService,
    private readonly schemaService: TableSchemaService,
    private readonly projectConfig: ProjectConfigService,
    private readonly globalTrackTables: GlobalTrackTablesService,
  ) {}

  /**
   * Prompt the user for a column type configuration.
   * @param typeName The name of the column type being configured.
   * @returns The ColumnType configuration.
   */
  async promptTypeConfig(typeName: string): Promise<ColumnType> {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder token written verbatim into config
    const file_name = await this.prompt.input(`File name for "${typeName}"`, '${column_name}');
    const extension = await this.prompt.input(`Extension for "${typeName}"`);
    const behavior = await this.prompt.input(`Behavior for "${typeName}"`);

    return { file_name, extension, behavior };
  }

  /**
   * Persist a column type configuration to the target (global or project).
   * @param target The target (global or project).
   * @param typeName The name of the column type.
   * @param def The ColumnType definition.
   */
  async persist(target: TrackerTarget, typeName: string, def: ColumnType): Promise<void> {
    if (target.kind === 'project') {
      await this.projectConfig.addColumnType(target.root, typeName, def);
    } else {
      await this.globalTrackTables.addColumnType(typeName, def);
    }
  }

  /**
   * Create a new column type configuration and persist it.
   * @param target The target (global or project).
   * @param typeName The name of the column type.
   * @returns The ColumnType definition that was persisted.
   */
  async addTypeConfig(target: TrackerTarget, typeName: string): Promise<ColumnType> {
    const def = await this.promptTypeConfig(typeName);
    await this.persist(target, typeName, def);
    return def;
  }

  /**
   * Add a new column type, with optional resolution from a live table schema.
   * @param input Configuration for adding the type, including target, optional table, and optional typeName.
   * @returns The name of the column type that was added.
   */
  async addType(input: {
    target: TrackerTarget;
    table?: string;
    typeName?: string;
  }): Promise<string> {
    let typeName = input.typeName;

    if (input.table && !typeName) {
      const types = await this.schemaService.getUniqueColumnTypes(input.table);
      typeName = await this.prompt.select(
        `Select a column type from ${input.table}`,
        types.map((t) => ({
          name: t.tracked ? `${t.internal_type} (tracked)` : t.internal_type,
          value: t.internal_type,
        })),
      );
    } else if (!typeName) {
      typeName = await this.prompt.input('Column type name');
    }

    await this.addTypeConfig(input.target, typeName);
    return typeName;
  }
}
