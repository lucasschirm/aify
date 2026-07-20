/**
 * @file tracker.service.ts
 * @description Service for tracking a new table and its columns. Prompts for table name,
 * preselects already-tracked columns (with package-tracked columns disabled), allows
 * toggling tracked columns, prompts to confirm removal of unchecked columns, and persists
 * only newly-added columns. Ensures all selected column types are configured.
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
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TrackedTablesService } from '../config/tracked-tables/tracked-tables.service';
import type { TrackedTable } from '../config/tracked-tables/tracked-tables.types';
import type { TrackerTarget } from './tracker-target.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { TrackerTypeService } from './tracker-type.service';

@Injectable()
export class TrackerService {
  constructor(
    private readonly prompt: PromptService,
    private readonly schemaService: TableSchemaService,
    private readonly projectConfig: ProjectConfigService,
    private readonly globalTrackTables: GlobalTrackTablesService,
    private readonly trackedTables: TrackedTablesService,
    private readonly trackerTypeService: TrackerTypeService,
  ) {}

  /**
   * Track a new table and its columns, preselecting already-tracked columns with
   * package-tracked columns locked as read-only. Prompts to confirm removal of
   * unchecked columns, and persists only newly-added columns.
   * @param input Configuration including the target (global or project).
   */
  async add(input: { target: TrackerTarget }): Promise<void> {
    // Prompt for table name.
    const table = await this.prompt.input('Table name');

    // Fetch schema for the table.
    const schema = await this.schemaService.getSchema(table);

    // Resolve the root early to determine which config layers to query.
    const root =
      input.target.kind === 'project'
        ? input.target.root
        : ((await this.projectConfig.findProjectRoot()) ?? process.cwd());

    // Fetch existing tracking sources for this table.
    const sources = await this.trackedTables.getColumnSources(root, table);

    // Build checkbox choices from schema with preselection and locking.
    const choices = schema.map((col) => {
      const source = sources.get(col.name);
      const label = source
        ? `${col.name} — ${col.internal_type} (tracked — ${source})`
        : `${col.name} — ${col.internal_type}`;
      return {
        name: label,
        value: { name: col.name, type: col.internal_type },
        checked: sources.has(col.name),
        disabled: source === 'package',
      };
    });

    // Prompt for column selection.
    const selected = await this.prompt.checkbox('Select columns to track', choices);

    // Compute newly-added columns (not in existing sources).
    const newlyAdded = selected.filter((c) => !sources.has(c.name));

    // Defensive invariant: ensure no newly-added column is package-sourced.
    for (const c of newlyAdded) {
      if (sources.get(c.name) === 'package') {
        throw new Error(`Column ${c.name} from table ${table} is already being tracked.`);
      }
    }

    // Handle removal of unchecked columns (only global/project, never package).
    const selectedNames = new Set(selected.map((c) => c.name));
    for (const [columnName, source] of sources) {
      if (source === 'package') continue;
      if (selectedNames.has(columnName)) continue;
      const ok = await this.prompt.confirm(
        `Are you sure you want to stop tracking the column ${columnName} from the table ${table}?`,
      );
      if (!ok) continue;
      if (source === 'project') {
        await this.projectConfig.removeTrackedColumn(root, table, columnName);
      } else {
        await this.globalTrackTables.removeTrackedColumn(table, columnName);
      }
    }

    // Early return if no new columns are being added.
    if (newlyAdded.length === 0) {
      console.log('No new columns selected; nothing to track.');
      return;
    }

    // Resolve types for newly-added columns.
    const merged = await this.trackedTables.getProjectTrackTables(root);
    const knownTypes = merged.column_types;

    const typesSeen = new Set<string>();
    const distinctTypes: string[] = [];
    for (const column of newlyAdded) {
      if (!typesSeen.has(column.type)) {
        typesSeen.add(column.type);
        distinctTypes.push(column.type);
      }
    }

    // Configure missing types.
    for (const type of distinctTypes) {
      if (!Object.hasOwn(knownTypes, type)) {
        await this.trackerTypeService.addTypeConfig(input.target, type);
      }
    }

    // Persist only newly-added columns.
    const tracked: TrackedTable = { name: table, columns: newlyAdded };
    if (input.target.kind === 'project') {
      await this.projectConfig.addTrackedTable(input.target.root, tracked);
    } else {
      await this.globalTrackTables.addTrackedTable(tracked);
    }

    console.log(`Tracking ${newlyAdded.length} column(s) on "${table}".`);
  }
}
