/**
 * @file tracker-target.service.spec.ts
 * @description Unit tests for TrackerTargetService.
 */

import { describe, expect, it, vi } from 'vitest';
import type { PromptService } from '../authentication/prompt.service';
import type { ProjectConfigService } from '../config/project/project-config.service';
import { TrackerTargetService } from './tracker-target.service';

function makeService() {
  const findProjectRoot = vi.fn();
  const confirm = vi.fn();
  const service = new TrackerTargetService(
    { findProjectRoot } as unknown as ProjectConfigService,
    { confirm } as unknown as PromptService,
  );
  return { service, findProjectRoot, confirm };
}

describe('TrackerTargetService', () => {
  describe('resolve', () => {
    it('returns global target when --global flag is set', async () => {
      const { service, findProjectRoot } = makeService();
      const result = await service.resolve({ global: true }, 'type');
      expect(result).toEqual({ kind: 'global' });
      expect(findProjectRoot).not.toHaveBeenCalled();
    });

    it('returns project target when in a project', async () => {
      const { service, findProjectRoot } = makeService();
      findProjectRoot.mockResolvedValue('/proj');
      const result = await service.resolve({}, 'type');
      expect(result).toEqual({ kind: 'project', root: '/proj' });
    });

    it('returns global target when not in a project and user confirms', async () => {
      const { service, findProjectRoot, confirm } = makeService();
      findProjectRoot.mockResolvedValue(null);
      confirm.mockResolvedValue(true);
      const result = await service.resolve({}, 'type');
      expect(result).toEqual({ kind: 'global' });
      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining(
          'Are you sure you want to add a new type to the global configuration?',
        ),
      );
    });

    it('returns null when not in a project and user declines', async () => {
      const { service, findProjectRoot, confirm } = makeService();
      findProjectRoot.mockResolvedValue(null);
      confirm.mockResolvedValue(false);
      const result = await service.resolve({}, 'type');
      expect(result).toBeNull();
    });

    it('includes the correct noun in the confirmation message', async () => {
      const { service, findProjectRoot, confirm } = makeService();
      findProjectRoot.mockResolvedValue(null);
      confirm.mockResolvedValue(true);
      await service.resolve({}, 'table');
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('add a new table'));
    });
  });
});
