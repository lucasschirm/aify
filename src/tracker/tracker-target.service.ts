/**
 * @file tracker-target.service.ts
 * @description Shared service for resolving whether a tracker operation targets the global
 * configuration or a project-specific one. Handles the decision logic: if --global flag is set,
 * use global; if in a project, use project; otherwise prompt the user.
 */

import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { PromptService } from '../authentication/prompt.service';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { ProjectConfigService } from '../config/project/project-config.service';

export type TrackerTarget = { kind: 'global' } | { kind: 'project'; root: string };

@Injectable()
export class TrackerTargetService {
  constructor(
    private readonly projectConfig: ProjectConfigService,
    private readonly prompt: PromptService,
  ) {}

  /**
   * Resolve the target (global or project) for a tracker operation.
   * @param opts Options with optional `global` flag.
   * @param noun The noun describing what is being added ('type' or 'table').
   * @returns The resolved tracker target, or null if the user declined.
   */
  async resolve(opts: { global?: boolean }, noun: 'type' | 'table'): Promise<TrackerTarget | null> {
    if (opts.global) {
      return { kind: 'global' };
    }

    const root = await this.projectConfig.findProjectRoot();
    if (root) {
      return { kind: 'project', root };
    }

    const ok = await this.prompt.confirm(
      `Are you sure you want to add a new ${noun} to the global configuration? To add a ${noun} to the project run the command from the project folder`,
    );
    if (!ok) {
      return null;
    }

    return { kind: 'global' };
  }
}
