/**
 * @file table-schema.service.spec.ts
 * Tests for TableSchemaService — caching, unique column type deduplication,
 * tracked status resolution, and error handling.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../authentication/auth.service';
import type { ProjectConfigService } from '../config/project/project-config.service';
import type { TrackedTablesService } from '../config/tracked-tables/tracked-tables.service';
import { TableSchemaService } from './table-schema.service';
import type { SchemaElement } from './table-schema.types';
import type { TableSchemaApiClient } from './table-schema-api.client';

describe('TableSchemaService', () => {
  describe('getSchema', () => {
    it('caches schema results and calls fetchSchemaXml only once', async () => {
      const schemaApi = {
        fetchSchemaXml: vi.fn().mockResolvedValue([
          {
            name: 'a',
            internal_type: 'string',
            max_length: 100,
            choice_list: false,
            active_status: true,
          },
        ]),
      };
      const auth = {
        current: vi.fn().mockResolvedValue({
          snAuth: {
            instanceUrl: 'https://dev.service-now.com/',
            username: 'admin',
            password: 'secret',
          },
        }),
      };
      const trackedTables = {};
      const projectConfig = {};

      const service = new TableSchemaService(
        schemaApi as unknown as TableSchemaApiClient,
        auth as unknown as AuthService,
        trackedTables as unknown as TrackedTablesService,
        projectConfig as unknown as ProjectConfigService,
      );

      const result1 = await service.getSchema('t');
      const result2 = await service.getSchema('t');

      expect(result1).toEqual(result2);
      expect(schemaApi.fetchSchemaXml).toHaveBeenCalledTimes(1);
    });

    it('throws when there is no current connection', async () => {
      const schemaApi = {
        fetchSchemaXml: vi.fn(),
      };
      const auth = {
        current: vi.fn().mockResolvedValue(null),
      };
      const trackedTables = {};
      const projectConfig = {};

      const service = new TableSchemaService(
        schemaApi as unknown as TableSchemaApiClient,
        auth as unknown as AuthService,
        trackedTables as unknown as TrackedTablesService,
        projectConfig as unknown as ProjectConfigService,
      );

      await expect(service.getSchema('t')).rejects.toThrow('No current connection');
    });
  });

  describe('getUniqueColumnTypes', () => {
    it('deduplicates by internal_type, first occurrence wins, and resolves tracked status', async () => {
      const schemaElements: SchemaElement[] = [
        {
          name: 's1',
          internal_type: 'string',
          max_length: 100,
          choice_list: false,
          active_status: true,
        },
        {
          name: 'b1',
          internal_type: 'boolean',
          max_length: 40,
          choice_list: false,
          active_status: true,
        },
        {
          name: 's2',
          internal_type: 'string',
          max_length: 100,
          choice_list: false,
          active_status: true,
        },
        {
          name: 'sc1',
          internal_type: 'script',
          max_length: 8000,
          choice_list: false,
          active_status: true,
        },
      ];

      const schemaApi = {
        fetchSchemaXml: vi.fn().mockResolvedValue(schemaElements),
      };
      const auth = {
        current: vi.fn().mockResolvedValue({
          snAuth: {
            instanceUrl: 'https://dev.service-now.com/',
            username: 'admin',
            password: 'secret',
          },
        }),
      };
      const trackedTables = {
        getProjectTrackTables: vi.fn().mockResolvedValue({
          tables: [],
          column_types: {
            string: { display_name: 'String' },
            script: { display_name: 'Script' },
          },
        }),
      };
      const projectConfig = {
        findProjectRoot: vi.fn().mockResolvedValue('/proj'),
      };

      const service = new TableSchemaService(
        schemaApi as unknown as TableSchemaApiClient,
        auth as unknown as AuthService,
        trackedTables as unknown as TrackedTablesService,
        projectConfig as unknown as ProjectConfigService,
      );

      const result = await service.getUniqueColumnTypes('t');

      expect(result).toEqual([
        { internal_type: 'string', tracked: true },
        { internal_type: 'boolean', tracked: false },
        { internal_type: 'script', tracked: true },
      ]);
    });

    it('handles a project root of null by using process.cwd()', async () => {
      const schemaElements: SchemaElement[] = [
        {
          name: 's1',
          internal_type: 'string',
          max_length: 100,
          choice_list: false,
          active_status: true,
        },
      ];

      const schemaApi = {
        fetchSchemaXml: vi.fn().mockResolvedValue(schemaElements),
      };
      const auth = {
        current: vi.fn().mockResolvedValue({
          snAuth: {
            instanceUrl: 'https://dev.service-now.com/',
            username: 'admin',
            password: 'secret',
          },
        }),
      };
      const trackedTables = {
        getProjectTrackTables: vi.fn().mockResolvedValue({
          tables: [],
          column_types: { string: {} },
        }),
      };
      const projectConfig = {
        findProjectRoot: vi.fn().mockResolvedValue(null),
      };

      const service = new TableSchemaService(
        schemaApi as unknown as TableSchemaApiClient,
        auth as unknown as AuthService,
        trackedTables as unknown as TrackedTablesService,
        projectConfig as unknown as ProjectConfigService,
      );

      const result = await service.getUniqueColumnTypes('t');

      expect(result).toEqual([{ internal_type: 'string', tracked: true }]);
      expect(trackedTables.getProjectTrackTables).toHaveBeenCalledWith(process.cwd());
    });
  });
});
