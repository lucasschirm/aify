/**
 * @file app-list.command.spec.ts
 * Tests for the AppListCommand and renderAppList function.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ProjectConfigService } from '../../config/project/project-config.service';
import { Application } from '../../database/models/application.model';
import { AppListCommand, type AppListRow, renderAppList } from './app-list.command';

describe('renderAppList', () => {
  it('renders rows with scope, name, and ISO-formatted lastSyncedAt or "never"', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    const rows: AppListRow[] = [
      {
        scope: 'x_acme_app',
        name: 'Acme Application',
        lastSyncedAt: date,
      },
      {
        scope: 'x_test_app',
        name: 'Test Application',
        lastSyncedAt: null,
      },
    ];

    const output = renderAppList(rows);

    expect(output).toContain('x_acme_app');
    expect(output).toContain('Acme Application');
    expect(output).toContain('2024-01-15T10:30:00.000Z');
    expect(output).toContain('x_test_app');
    expect(output).toContain('Test Application');
    expect(output).toContain('never');
  });

  it('renders empty array as a single centered row with "_no applications tracked_"', () => {
    const output = renderAppList([]);
    expect(output).toContain('_no applications tracked_');
  });
});

describe('AppListCommand', () => {
  it('logs "Not in an aify project" and returns early when not in a project', async () => {
    const mockProjectConfig = {
      findProjectRoot: vi.fn().mockResolvedValue(null),
      read: vi.fn(),
    };

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const command = new AppListCommand(mockProjectConfig as unknown as ProjectConfigService);

    await command.run();

    expect(consoleSpy).toHaveBeenCalledWith('Not in an aify project. Run `aify app init` first.');
    expect(mockProjectConfig.read).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('queries Application rows by scope and renders them', async () => {
    const syncDate = new Date('2024-01-15T10:30:00Z');
    const mockProjectConfig = {
      findProjectRoot: vi.fn().mockResolvedValue('/home/user/project'),
      read: vi.fn().mockResolvedValue({
        project: {
          scopes: [
            { sysId: 'id1', scope: 'x_acme_app' },
            { sysId: 'id2', scope: 'x_test_app' },
          ],
        },
      }),
    };

    vi.spyOn(Application, 'findOne')
      .mockResolvedValueOnce({
        displayValue: 'Acme Application',
        lastSyncedAt: syncDate,
      } as unknown as Application)
      .mockResolvedValueOnce({
        displayValue: 'Test Application',
        lastSyncedAt: null,
      } as unknown as Application);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const command = new AppListCommand(mockProjectConfig as unknown as ProjectConfigService);

    await command.run();

    expect(Application.findOne).toHaveBeenCalledTimes(2);
    expect(Application.findOne).toHaveBeenNthCalledWith(1, { where: { scope: 'x_acme_app' } });
    expect(Application.findOne).toHaveBeenNthCalledWith(2, { where: { scope: 'x_test_app' } });

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('x_acme_app');
    expect(output).toContain('Acme Application');
    expect(output).toContain('2024-01-15T10:30:00.000Z');
    expect(output).toContain('x_test_app');
    expect(output).toContain('Test Application');
    expect(output).toContain('never');

    consoleSpy.mockRestore();
  });

  it('renders empty-state when config has no project key', async () => {
    const mockProjectConfig = {
      findProjectRoot: vi.fn().mockResolvedValue('/home/user/project'),
      read: vi.fn().mockResolvedValue({}),
    };

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const command = new AppListCommand(mockProjectConfig as unknown as ProjectConfigService);

    await command.run();

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('_no applications tracked_');

    consoleSpy.mockRestore();
  });

  it('uses scope as name when Application.findOne returns null', async () => {
    const mockProjectConfig = {
      findProjectRoot: vi.fn().mockResolvedValue('/home/user/project'),
      read: vi.fn().mockResolvedValue({
        project: {
          scopes: [{ sysId: 'id1', scope: 'x_orphan_app' }],
        },
      }),
    };

    vi.spyOn(Application, 'findOne').mockResolvedValueOnce(null);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const command = new AppListCommand(mockProjectConfig as unknown as ProjectConfigService);

    await command.run();

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('x_orphan_app');
    expect(output).toContain('never');

    consoleSpy.mockRestore();
  });

  it('handles app with lastSyncedAt null explicitly', async () => {
    const mockProjectConfig = {
      findProjectRoot: vi.fn().mockResolvedValue('/home/user/project'),
      read: vi.fn().mockResolvedValue({
        project: {
          scopes: [{ sysId: 'id1', scope: 'x_test' }],
        },
      }),
    };

    vi.spyOn(Application, 'findOne').mockResolvedValueOnce({
      displayValue: 'Test App',
      lastSyncedAt: null,
    } as unknown as Application);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const command = new AppListCommand(mockProjectConfig as unknown as ProjectConfigService);

    await command.run();

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('Test App');
    expect(output).toContain('never');

    consoleSpy.mockRestore();
  });
});
