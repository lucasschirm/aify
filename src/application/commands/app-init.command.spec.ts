/**
 * @file app-init.command.spec.ts
 * Tests for AppInitCommand.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PromptService } from '../../authentication/prompt.service';
import type { ProjectConfigService } from '../../config/project/project-config.service';
import type { ApplicationService } from '../application.service';
import { AppInitCommand } from './app-init.command';

describe('AppInitCommand.run', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs usage message and returns early when no param is provided', async () => {
    const mockAppService = {
      init: vi.fn(),
    };
    const mockProjectConfig = {
      ensureProjectRoot: vi.fn(),
    };
    const mockPrompt = {
      confirm: vi.fn(),
    };

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const command = new AppInitCommand(
      mockAppService as unknown as ApplicationService,
      mockProjectConfig as unknown as ProjectConfigService,
      mockPrompt as unknown as PromptService,
    );

    await command.run([]);

    expect(errorSpy).toHaveBeenCalledWith('Usage: aify app init <scope|sys_id>');
    expect(mockAppService.init).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('calls appService.init with the param and does NOT prompt when --yes is passed', async () => {
    const mockApp = { displayValue: 'Test App', scope: 'x_test_app' };
    const mockAppService = {
      init: vi.fn().mockResolvedValue(mockApp),
    };
    const mockProjectConfig = {
      ensureProjectRoot: vi.fn().mockResolvedValue('/project'),
    };
    const mockPrompt = {
      confirm: vi.fn(),
    };

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const command = new AppInitCommand(
      mockAppService as unknown as ApplicationService,
      mockProjectConfig as unknown as ProjectConfigService,
      mockPrompt as unknown as PromptService,
    );

    await command.run(['x_test_app'], { yes: true });

    expect(mockAppService.init).toHaveBeenCalledWith('x_test_app', '/project');
    expect(mockPrompt.confirm).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('Application "Test App" (x_test_app) tracked.');

    consoleSpy.mockRestore();
  });

  it('prompts to confirm sync when not using --yes and confirm returns true', async () => {
    const mockApp = { displayValue: 'Test App', scope: 'x_test_app' };
    const mockAppService = {
      init: vi.fn().mockResolvedValue(mockApp),
    };
    const mockProjectConfig = {
      ensureProjectRoot: vi.fn().mockResolvedValue('/project'),
    };
    const mockPrompt = {
      confirm: vi.fn().mockResolvedValue(true),
    };

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const command = new AppInitCommand(
      mockAppService as unknown as ApplicationService,
      mockProjectConfig as unknown as ProjectConfigService,
      mockPrompt as unknown as PromptService,
    );

    await command.run(['x_test_app']);

    expect(mockPrompt.confirm).toHaveBeenCalledWith('Run a sync now?');
    expect(consoleSpy).toHaveBeenCalledWith('Run `aify sync` to pull metadata.');

    consoleSpy.mockRestore();
  });

  it('does not log sync hint when prompt returns false', async () => {
    const mockApp = { displayValue: 'Test App', scope: 'x_test_app' };
    const mockAppService = {
      init: vi.fn().mockResolvedValue(mockApp),
    };
    const mockProjectConfig = {
      ensureProjectRoot: vi.fn().mockResolvedValue('/project'),
    };
    const mockPrompt = {
      confirm: vi.fn().mockResolvedValue(false),
    };

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const command = new AppInitCommand(
      mockAppService as unknown as ApplicationService,
      mockProjectConfig as unknown as ProjectConfigService,
      mockPrompt as unknown as PromptService,
    );

    await command.run(['x_test_app']);

    const calls = consoleSpy.mock.calls;
    const syncHintLogged = calls.some((c) => c[0].includes('Run `aify sync`'));
    expect(syncHintLogged).toBe(false);

    consoleSpy.mockRestore();
  });
});
