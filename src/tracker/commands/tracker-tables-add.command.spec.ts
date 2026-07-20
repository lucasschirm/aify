/**
 * @file tracker-tables-add.command.spec.ts
 * @description Unit tests for TrackerTablesAddCommand.
 */

import { describe, expect, it, vi } from 'vitest';
import type { TrackerService } from '../../tracker/tracker.service';
import type { TrackerTargetService } from '../../tracker/tracker-target.service';
import { TrackerTablesAddCommand } from './tracker-tables-add.command';

describe('TrackerTablesAddCommand', () => {
  it('delegates to TrackerService when target is resolved', async () => {
    const target = { kind: 'project' as const, root: '/proj' };
    const targetService = {
      resolve: vi.fn().mockResolvedValue(target),
    } as unknown as TrackerTargetService;
    const trackerService = {
      add: vi.fn().mockResolvedValue(undefined),
    } as unknown as TrackerService;

    const command = new TrackerTablesAddCommand(targetService, trackerService);

    await command.run([], { global: false });

    expect(targetService.resolve).toHaveBeenCalledWith({ global: false }, 'table');
    expect(trackerService.add).toHaveBeenCalledWith({ target });
  });

  it('short-circuits when target is null', async () => {
    const targetService = {
      resolve: vi.fn().mockResolvedValue(null),
    } as unknown as TrackerTargetService;
    const trackerService = { add: vi.fn() } as unknown as TrackerService;

    const command = new TrackerTablesAddCommand(targetService, trackerService);

    await command.run([], {});

    expect(targetService.resolve).toHaveBeenCalled();
    expect(trackerService.add).not.toHaveBeenCalled();
  });

  it('calls parseGlobal and returns true when value is undefined', () => {
    const targetService = {} as unknown as TrackerTargetService;
    const trackerService = {} as unknown as TrackerService;

    const command = new TrackerTablesAddCommand(targetService, trackerService);

    const result = command.parseGlobal();

    expect(result).toBe(true);
  });

  it('calls parseGlobal and returns the provided value', () => {
    const targetService = {} as unknown as TrackerTargetService;
    const trackerService = {} as unknown as TrackerService;

    const command = new TrackerTablesAddCommand(targetService, trackerService);

    const result = command.parseGlobal(false);

    expect(result).toBe(false);
  });

  it('calls parseGlobal and returns true when value is true', () => {
    const targetService = {} as unknown as TrackerTargetService;
    const trackerService = {} as unknown as TrackerService;

    const command = new TrackerTablesAddCommand(targetService, trackerService);

    const result = command.parseGlobal(true);

    expect(result).toBe(true);
  });
});
