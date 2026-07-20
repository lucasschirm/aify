/**
 * @file tracker-type.service.spec.ts
 * @description Unit tests for TrackerTypeService.
 */

import { describe, expect, it, vi } from 'vitest';
import type { TableSchemaService } from '../api/table-schema.service';
import type { PromptService } from '../authentication/prompt.service';
import type { ProjectConfigService } from '../config/project/project-config.service';
import type { GlobalTrackTablesService } from '../config/tracked-tables/global-track-tables.service';
import { TrackerTypeService } from './tracker-type.service';

function makeService() {
  const input = vi.fn();
  const select = vi.fn();
  const getUniqueColumnTypes = vi.fn();
  const addColumnTypeProject = vi.fn();
  const addColumnTypeGlobal = vi.fn();
  const service = new TrackerTypeService(
    { input, select } as unknown as PromptService,
    { getUniqueColumnTypes } as unknown as TableSchemaService,
    { addColumnType: addColumnTypeProject } as unknown as ProjectConfigService,
    { addColumnType: addColumnTypeGlobal } as unknown as GlobalTrackTablesService,
  );
  return {
    service,
    input,
    select,
    getUniqueColumnTypes,
    addColumnTypeProject,
    addColumnTypeGlobal,
  };
}

describe('TrackerTypeService', () => {
  describe('promptTypeConfig', () => {
    it('prompts for file_name with the literal column-name default', async () => {
      const { service, input } = makeService();
      input
        .mockResolvedValueOnce('myfile')
        .mockResolvedValueOnce('js')
        .mockResolvedValueOnce('text');
      const result = await service.promptTypeConfig('myscript');
      expect(input).toHaveBeenCalledTimes(3);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder token asserted verbatim
      expect(input).toHaveBeenNthCalledWith(1, expect.any(String), '${column_name}');
      expect(result).toEqual({ file_name: 'myfile', extension: 'js', behavior: 'text' });
    });
  });

  describe('addType', () => {
    it('selects a type from the table schema when a table is provided without a typeName', async () => {
      const { service, input, select, getUniqueColumnTypes, addColumnTypeGlobal } = makeService();
      getUniqueColumnTypes.mockResolvedValue([
        { internal_type: 'script', tracked: true },
        { internal_type: 'html', tracked: false },
      ]);
      select.mockResolvedValue('html');
      input
        .mockResolvedValueOnce('myfile')
        .mockResolvedValueOnce('ext')
        .mockResolvedValueOnce('beh');
      const result = await service.addType({
        target: { kind: 'global' },
        table: 'sys_script_include',
      });
      expect(getUniqueColumnTypes).toHaveBeenCalledWith('sys_script_include');
      expect(select).toHaveBeenCalledWith(
        'Select a column type from sys_script_include',
        expect.arrayContaining([
          expect.objectContaining({ name: 'script (tracked)' }),
          expect.objectContaining({ name: 'html' }),
        ]),
      );
      expect(result).toBe('html');
      expect(addColumnTypeGlobal).toHaveBeenCalledWith(
        'html',
        expect.objectContaining({ file_name: 'myfile' }),
      );
    });

    it('persists to project config when the target is a project', async () => {
      const { service, input, addColumnTypeProject } = makeService();
      input
        .mockResolvedValueOnce('myfile')
        .mockResolvedValueOnce('ext')
        .mockResolvedValueOnce('beh');
      await service.addType({ target: { kind: 'project', root: '/proj' }, typeName: 'myscript' });
      expect(addColumnTypeProject).toHaveBeenCalledWith(
        '/proj',
        'myscript',
        expect.objectContaining({ file_name: 'myfile', extension: 'ext', behavior: 'beh' }),
      );
    });

    it('persists to global config when the target is global', async () => {
      const { service, input, addColumnTypeGlobal } = makeService();
      input
        .mockResolvedValueOnce('myfile')
        .mockResolvedValueOnce('ext')
        .mockResolvedValueOnce('beh');
      await service.addType({ target: { kind: 'global' }, typeName: 'myscript' });
      expect(addColumnTypeGlobal).toHaveBeenCalledWith(
        'myscript',
        expect.objectContaining({ file_name: 'myfile', extension: 'ext', behavior: 'beh' }),
      );
    });

    it('prompts for a typeName when none is provided and no table is given', async () => {
      const { service, input } = makeService();
      input
        .mockResolvedValueOnce('mytypename')
        .mockResolvedValueOnce('myfile')
        .mockResolvedValueOnce('ext')
        .mockResolvedValueOnce('beh');
      const result = await service.addType({ target: { kind: 'global' } });
      expect(result).toBe('mytypename');
      expect(input).toHaveBeenNthCalledWith(1, 'Column type name');
    });
  });
});
