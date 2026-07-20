/**
 * @file tracker.service.spec.ts
 * @description Unit tests for TrackerService.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableSchemaService } from '../api/table-schema.service';
import type { PromptService } from '../authentication/prompt.service';
import type { ProjectConfigService } from '../config/project/project-config.service';
import type { GlobalTrackTablesService } from '../config/tracked-tables/global-track-tables.service';
import type { TrackedTablesService } from '../config/tracked-tables/tracked-tables.service';
import { TrackerService } from './tracker.service';
import type { TrackerTypeService } from './tracker-type.service';

function makeService() {
  const input = vi.fn();
  const checkbox = vi.fn();
  const confirm = vi.fn();
  const getSchema = vi.fn();
  const getColumnSources = vi.fn();
  const findProjectRoot = vi.fn();
  const addTrackedTableProject = vi.fn();
  const removeTrackedColumnProject = vi.fn();
  const addTrackedTableGlobal = vi.fn();
  const removeTrackedColumnGlobal = vi.fn();
  const getProjectTrackTables = vi.fn();
  const addTypeConfig = vi.fn();

  const service = new TrackerService(
    { input, checkbox, confirm } as unknown as PromptService,
    { getSchema } as unknown as TableSchemaService,
    {
      findProjectRoot,
      addTrackedTable: addTrackedTableProject,
      removeTrackedColumn: removeTrackedColumnProject,
    } as unknown as ProjectConfigService,
    {
      addTrackedTable: addTrackedTableGlobal,
      removeTrackedColumn: removeTrackedColumnGlobal,
    } as unknown as GlobalTrackTablesService,
    { getColumnSources, getProjectTrackTables } as unknown as TrackedTablesService,
    { addTypeConfig } as unknown as TrackerTypeService,
  );

  // Set defaults for mocks
  getColumnSources.mockResolvedValue(new Map());
  confirm.mockResolvedValue(true);

  return {
    service,
    input,
    checkbox,
    confirm,
    getSchema,
    getColumnSources,
    findProjectRoot,
    addTrackedTableProject,
    removeTrackedColumnProject,
    addTrackedTableGlobal,
    removeTrackedColumnGlobal,
    getProjectTrackTables,
    addTypeConfig,
  };
}

describe('TrackerService', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('tracks only newly-added columns; skips already-tracked ones', async () => {
    const t = makeService();
    t.input.mockResolvedValue('sys_x');
    t.getSchema.mockResolvedValue([
      { name: 'a', internal_type: 'script' },
      { name: 'b', internal_type: 'html' },
      { name: 'c', internal_type: 'script' },
    ]);
    t.getColumnSources.mockResolvedValue(new Map([['a', 'project']]));
    t.checkbox.mockResolvedValue([
      { name: 'a', type: 'script' },
      { name: 'b', type: 'html' },
    ]);
    t.getProjectTrackTables.mockResolvedValue({
      tables: [],
      column_types: { script: {}, html: {} },
    });

    const target = { kind: 'project' as const, root: '/proj' };
    await t.service.add({ target });

    // Only b is newly added; a is already tracked
    expect(t.addTrackedTableProject).toHaveBeenCalledWith('/proj', {
      name: 'sys_x',
      columns: [{ name: 'b', type: 'html' }],
    });
    expect(t.addTypeConfig).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('Tracking 1 column(s) on "sys_x".');
  });

  it('configures missing type for a newly-added column', async () => {
    const t = makeService();
    t.input.mockResolvedValue('sys_x');
    t.getSchema.mockResolvedValue([{ name: 'b', internal_type: 'html' }]);
    t.getColumnSources.mockResolvedValue(new Map());
    t.checkbox.mockResolvedValue([{ name: 'b', type: 'html' }]);
    t.getProjectTrackTables.mockResolvedValue({
      tables: [],
      column_types: {},
    });

    const target = { kind: 'project' as const, root: '/proj' };
    await t.service.add({ target });

    expect(t.addTypeConfig).toHaveBeenCalledWith(target, 'html');
    expect(t.addTrackedTableProject).toHaveBeenCalledWith('/proj', {
      name: 'sys_x',
      columns: [{ name: 'b', type: 'html' }],
    });
  });

  it('no new columns selected → early return message', async () => {
    const t = makeService();
    t.input.mockResolvedValue('sys_x');
    t.getSchema.mockResolvedValue([{ name: 'a', internal_type: 'script' }]);
    t.getColumnSources.mockResolvedValue(new Map([['a', 'project']]));
    t.checkbox.mockResolvedValue([{ name: 'a', type: 'script' }]);

    const target = { kind: 'project' as const, root: '/proj' };
    await t.service.add({ target });

    expect(consoleSpy).toHaveBeenCalledWith('No new columns selected; nothing to track.');
    expect(t.addTrackedTableProject).not.toHaveBeenCalled();
    expect(t.addTypeConfig).not.toHaveBeenCalled();
  });

  it('unchecking a project-sourced column prompts confirm and removes from project', async () => {
    const t = makeService();
    t.input.mockResolvedValue('sys_x');
    t.getSchema.mockResolvedValue([{ name: 'a', internal_type: 'script' }]);
    t.getColumnSources.mockResolvedValue(new Map([['a', 'project']]));
    t.checkbox.mockResolvedValue([]);
    t.confirm.mockResolvedValue(true);

    const target = { kind: 'project' as const, root: '/proj' };
    await t.service.add({ target });

    expect(t.confirm).toHaveBeenCalledWith(expect.stringContaining('stop tracking the column a'));
    expect(t.removeTrackedColumnProject).toHaveBeenCalledWith('/proj', 'sys_x', 'a');
    expect(t.removeTrackedColumnGlobal).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('No new columns selected; nothing to track.');
    expect(t.addTrackedTableProject).not.toHaveBeenCalled();
  });

  it('unchecking a global-sourced column removes from global', async () => {
    const t = makeService();
    t.input.mockResolvedValue('sys_x');
    t.getSchema.mockResolvedValue([{ name: 'a', internal_type: 'script' }]);
    t.getColumnSources.mockResolvedValue(new Map([['a', 'global']]));
    t.checkbox.mockResolvedValue([]);
    t.confirm.mockResolvedValue(true);
    t.findProjectRoot.mockResolvedValue(null);

    const target = { kind: 'global' as const };
    await t.service.add({ target });

    expect(t.removeTrackedColumnGlobal).toHaveBeenCalledWith('sys_x', 'a');
    expect(t.removeTrackedColumnProject).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('No new columns selected; nothing to track.');
  });

  it('declining the confirm leaves the column tracked (no removal)', async () => {
    const t = makeService();
    t.input.mockResolvedValue('sys_x');
    t.getSchema.mockResolvedValue([{ name: 'a', internal_type: 'script' }]);
    t.getColumnSources.mockResolvedValue(new Map([['a', 'project']]));
    t.checkbox.mockResolvedValue([]);
    t.confirm.mockResolvedValue(false);

    const target = { kind: 'project' as const, root: '/proj' };
    await t.service.add({ target });

    expect(t.removeTrackedColumnProject).not.toHaveBeenCalled();
    expect(t.removeTrackedColumnGlobal).not.toHaveBeenCalled();
  });

  it('package-sourced column is never offered for removal even when not selected', async () => {
    const t = makeService();
    t.input.mockResolvedValue('sys_x');
    t.getSchema.mockResolvedValue([{ name: 'a', internal_type: 'script' }]);
    t.getColumnSources.mockResolvedValue(new Map([['a', 'package']]));
    t.checkbox.mockResolvedValue([]);

    const target = { kind: 'project' as const, root: '/proj' };
    await t.service.add({ target });

    expect(t.confirm).not.toHaveBeenCalled();
    expect(t.removeTrackedColumnProject).not.toHaveBeenCalled();
    expect(t.removeTrackedColumnGlobal).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('No new columns selected; nothing to track.');
  });

  it('defensive invariant throws if a newly-added column is package-sourced', async () => {
    const t = makeService();
    t.input.mockResolvedValue('sys_x');
    t.getSchema.mockResolvedValue([{ name: 'x', internal_type: 't' }]);
    // Mock with contradictory behavior: .has() returns false but .get() returns 'package'
    t.getColumnSources.mockResolvedValue({
      has: () => false,
      get: () => 'package',
      [Symbol.iterator]: function* () {},
    } as unknown as Map<string, 'package' | 'project' | 'global'>);
    t.checkbox.mockResolvedValue([{ name: 'x', type: 't' }]);

    const target = { kind: 'project' as const, root: '/proj' };

    await expect(t.service.add({ target })).rejects.toThrow(/already being tracked/);
    expect(t.addTrackedTableProject).not.toHaveBeenCalled();
  });

  it('checkbox choices carry checked/disabled/label correctly', async () => {
    const t = makeService();
    t.input.mockResolvedValue('sys_x');
    t.getSchema.mockResolvedValue([
      { name: 'a', internal_type: 'string' },
      { name: 'b', internal_type: 'html' },
    ]);
    t.getColumnSources.mockResolvedValue(new Map([['a', 'package']]));
    t.checkbox.mockResolvedValue([]);

    const target = { kind: 'project' as const, root: '/proj' };
    await t.service.add({ target });

    // Capture the choices passed to checkbox
    const callArgs = t.checkbox.mock.calls[0];
    const choices = callArgs?.[1] as Array<{
      name: string;
      value: { name: string; type: string };
      checked: boolean;
      disabled: boolean;
    }>;

    expect(choices).toBeDefined();
    const aChoice = choices.find((c) => c.value.name === 'a');
    const bChoice = choices.find((c) => c.value.name === 'b');

    expect(aChoice).toBeDefined();
    expect(aChoice?.checked).toBe(true);
    expect(aChoice?.disabled).toBe(true);
    expect(aChoice?.name).toContain('(tracked — package)');

    expect(bChoice).toBeDefined();
    expect(bChoice?.checked).toBe(false);
    expect(bChoice?.disabled).toBe(false);
    expect(bChoice?.name).not.toContain('(tracked');
  });
});
