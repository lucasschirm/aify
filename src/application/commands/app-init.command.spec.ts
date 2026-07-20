/**
 * @file app-init.command.spec.ts
 * Tests for AppInitCommand — argument validation, error handling, sync prompting, and the --yes flag.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '../../database/models/application.model';
import { AppCommand, AppInitCommand } from './app-init.command';

describe('AppInitCommand', () => {
  let command: AppInitCommand;
  let mockAppService: {
    init: ReturnType<typeof vi.fn>;
  };
  let mockProjectConfig: {
    ensureProjectRoot: ReturnType<typeof vi.fn>;
  };
  let mockPrompt: {
    confirm: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAppService = {
      init: vi.fn(),
    };
    mockProjectConfig = {
      ensureProjectRoot: vi.fn().mockResolvedValue('/proj'),
    };
    mockPrompt = {
      confirm: vi.fn(),
    };

    command = new AppInitCommand(
      mockAppService as never,
      mockProjectConfig as never,
      mockPrompt as never,
    );

    // Spy on console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints usage message when param is missing', async () => {
    await command.run([], {});

    expect(console.error).toHaveBeenCalledWith('Usage: aify app init <scope|sys_id>');
    expect(mockProjectConfig.ensureProjectRoot).not.toHaveBeenCalled();
    expect(mockAppService.init).not.toHaveBeenCalled();
  });

  it('delegates to appService.init with ensureProjectRoot result', async () => {
    const app: Partial<Application> = {
      displayValue: 'Acme App',
      scope: 'x_acme_app',
    };
    mockAppService.init.mockResolvedValue(app);

    await command.run(['x_acme_app'], { yes: true });

    expect(mockProjectConfig.ensureProjectRoot).toHaveBeenCalled();
    expect(mockAppService.init).toHaveBeenCalledWith('x_acme_app', '/proj');
  });

  it('prints tracked message with displayValue and scope on success', async () => {
    const app: Partial<Application> = {
      displayValue: 'Acme App',
      scope: 'x_acme_app',
    };
    mockAppService.init.mockResolvedValue(app);

    await command.run(['x_acme_app'], { yes: true });

    expect(console.log).toHaveBeenCalledWith('Application "Acme App" (x_acme_app) tracked.');
  });

  it('skips prompt when --yes flag is passed', async () => {
    const app: Partial<Application> = {
      displayValue: 'Acme App',
      scope: 'x_acme_app',
    };
    mockAppService.init.mockResolvedValue(app);

    await command.run(['x_acme_app'], { yes: true });

    expect(mockPrompt.confirm).not.toHaveBeenCalled();
    // Should not print the sync instruction
    const calls = (console.log as ReturnType<typeof vi.spyOn>).mock.calls;
    const syncCalls = calls.filter((c: unknown[]) => String(c[0]).includes('Run `aify sync`'));
    expect(syncCalls).toHaveLength(0);
  });

  it('prompts for sync when --yes is not passed', async () => {
    const app: Partial<Application> = {
      displayValue: 'Acme App',
      scope: 'x_acme_app',
    };
    mockAppService.init.mockResolvedValue(app);
    mockPrompt.confirm.mockResolvedValue(false);

    await command.run(['x_acme_app'], {});

    expect(mockPrompt.confirm).toHaveBeenCalledWith('Run a sync now?');
  });

  it('prints sync instruction when user confirms prompt', async () => {
    const app: Partial<Application> = {
      displayValue: 'Acme App',
      scope: 'x_acme_app',
    };
    mockAppService.init.mockResolvedValue(app);
    mockPrompt.confirm.mockResolvedValue(true);

    await command.run(['x_acme_app'], {});

    expect(console.log).toHaveBeenCalledWith('Run `aify sync` to pull metadata.');
  });

  it('does not print sync instruction when user declines prompt', async () => {
    const app: Partial<Application> = {
      displayValue: 'Acme App',
      scope: 'x_acme_app',
    };
    mockAppService.init.mockResolvedValue(app);
    mockPrompt.confirm.mockResolvedValue(false);

    await command.run(['x_acme_app'], {});

    const calls = (console.log as ReturnType<typeof vi.spyOn>).mock.calls;
    const syncCalls = calls.filter((c: unknown[]) => String(c[0]).includes('Run `aify sync`'));
    expect(syncCalls).toHaveLength(0);
  });

  it('catches and logs error message without stack trace when appService.init fails', async () => {
    mockAppService.init.mockRejectedValue(new Error('Application missing not found'));

    await command.run(['missing'], { yes: true });

    expect(console.error).toHaveBeenCalledWith('Application missing not found');
    // Ensure tracked message is not printed
    const logs = (console.log as ReturnType<typeof vi.spyOn>).mock.calls;
    const trackedCalls = logs.filter((c: unknown[]) => String(c[0]).includes('tracked'));
    expect(trackedCalls).toHaveLength(0);
    // Ensure prompt is not called
    expect(mockPrompt.confirm).not.toHaveBeenCalled();
  });

  it('does not call prompt.confirm when error occurs', async () => {
    mockAppService.init.mockRejectedValue(new Error('Connection failed'));

    await command.run(['x'], {});

    expect(mockPrompt.confirm).not.toHaveBeenCalled();
  });

  it('resolves without error on failure (no throw)', async () => {
    mockAppService.init.mockRejectedValue(new Error('Some error'));

    await expect(command.run(['x'], { yes: true })).resolves.toBeUndefined();
  });
});

describe('AppInitCommand option parsers', () => {
  let command: AppInitCommand;
  const mockAppService = { init: vi.fn() };
  const mockProjectConfig = { ensureProjectRoot: vi.fn() };
  const mockPrompt = { confirm: vi.fn() };

  beforeEach(() => {
    command = new AppInitCommand(
      mockAppService as never,
      mockProjectConfig as never,
      mockPrompt as never,
    );
  });

  it('parseYes returns true', () => {
    expect(command.parseYes()).toBe(true);
  });
});

describe('AppCommand', () => {
  it('calls help() when run without subcommand', async () => {
    const command = new AppCommand();
    const helpMock = vi.fn();
    (command as unknown as { command: { help: typeof helpMock } }).command = { help: helpMock };

    await command.run();

    expect(helpMock).toHaveBeenCalled();
  });
});
