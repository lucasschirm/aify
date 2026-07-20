/**
 * @file tracker-types-add.command.spec.ts
 * @description Unit tests for TrackerTypesAddCommand.
 */

import { describe, expect, it, vi } from 'vitest';
import type { TrackerTargetService } from '../../tracker/tracker-target.service';
import type { TrackerTypeService } from '../../tracker/tracker-type.service';
import { TrackerTypesAddCommand } from './tracker-types-add.command';

describe('TrackerTypesAddCommand', () => {
  it('delegates to TrackerTypeService when target is resolved', async () => {
    const target = { kind: 'global' as const };
    const targetService = {
      resolve: vi.fn().mockResolvedValue(target),
    } as unknown as TrackerTargetService;
    const trackerTypeService = {
      addType: vi.fn().mockResolvedValue('mytype'),
    } as unknown as TrackerTypeService;

    const command = new TrackerTypesAddCommand(targetService, trackerTypeService);

    await command.run([], { table: 'sys_x' });

    expect(targetService.resolve).toHaveBeenCalledWith({ table: 'sys_x' }, 'type');
    expect(trackerTypeService.addType).toHaveBeenCalledWith({ target, table: 'sys_x' });
  });

  it('short-circuits when target is null', async () => {
    const targetService = {
      resolve: vi.fn().mockResolvedValue(null),
    } as unknown as TrackerTargetService;
    const trackerTypeService = { addType: vi.fn() } as unknown as TrackerTypeService;

    const command = new TrackerTypesAddCommand(targetService, trackerTypeService);

    await command.run([], {});

    expect(targetService.resolve).toHaveBeenCalled();
    expect(trackerTypeService.addType).not.toHaveBeenCalled();
  });

  it('calls parseGlobal and returns true when value is undefined', () => {
    const targetService = {} as unknown as TrackerTargetService;
    const trackerTypeService = {} as unknown as TrackerTypeService;

    const command = new TrackerTypesAddCommand(targetService, trackerTypeService);

    const result = command.parseGlobal();

    expect(result).toBe(true);
  });

  it('calls parseTable and returns the provided value', () => {
    const targetService = {} as unknown as TrackerTargetService;
    const trackerTypeService = {} as unknown as TrackerTypeService;

    const command = new TrackerTypesAddCommand(targetService, trackerTypeService);

    const result = command.parseTable('sys_x');

    expect(result).toBe('sys_x');
  });
});
