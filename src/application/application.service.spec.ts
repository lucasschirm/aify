/**
 * @file application.service.spec.ts
 * Tests for ApplicationService.init — tracking an application locally.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sequelize } from 'sequelize-typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application } from '../database/models/application.model';
import { bootstrapTestDb } from '../testing/sqlite-test.helper';
import { ApplicationService } from './application.service';

describe('ApplicationService.init', () => {
  let projectRoot: string;
  let sequelize: Sequelize;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'aify-app-'));
    sequelize = await bootstrapTestDb([Application]);
  });

  afterEach(async () => {
    if (sequelize) await sequelize.close();
    try {
      await rm(projectRoot, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('successfully tracks an application by scope', async () => {
    const mockTableApi = {
      list: vi.fn().mockResolvedValue([
        {
          sys_id: '00a1b2c3d4e5f60718293a4b5c6d7e8f',
          scope: 'x_acme_app',
          title: 'Acme Application',
        },
      ]),
    };
    const mockAuth = {
      current: vi.fn().mockResolvedValue({
        snAuth: {
          instanceUrl: 'https://dev123.service-now.com',
          username: 'admin',
          password: 'secret',
        },
      }),
    };
    const mockProjectConfig = {
      addScope: vi.fn().mockResolvedValue(undefined),
    };
    const mockGlobalConfig = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ApplicationService(
      mockTableApi as never,
      mockAuth as never,
      mockProjectConfig as never,
      mockGlobalConfig as never,
    );

    const result = await service.init('x_acme_app', projectRoot);

    expect(result.scope).toBe('x_acme_app');
    expect(result.sysId).toBe('00a1b2c3d4e5f60718293a4b5c6d7e8f');
    expect(result.displayValue).toBe('Acme Application');

    expect(mockTableApi.list).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceUrl: 'https://dev123.service-now.com',
      }),
      'sys_scope',
      {
        query: 'scope=x_acme_app^ORsys_id=x_acme_app',
        fields: ['sys_id', 'scope', 'title'],
        limit: 1,
      },
    );

    expect(mockProjectConfig.addScope).toHaveBeenCalledWith(projectRoot, {
      sysId: '00a1b2c3d4e5f60718293a4b5c6d7e8f',
      scope: 'x_acme_app',
    });

    // Verify the scope directory and sys_package.json were created
    const scopeDir = join(projectRoot, 'x_acme_app');
    const packageJsonPath = join(scopeDir, 'sys_package.json');
    const content = await readFile(packageJsonPath, 'utf8');
    const pkg = JSON.parse(content);
    expect(pkg).toEqual({
      scope: 'x_acme_app',
      sysId: '00a1b2c3d4e5f60718293a4b5c6d7e8f',
      name: 'Acme Application',
    });

    // Verify the Application row was created
    const app = await Application.findOne({ where: { sysId: '00a1b2c3d4e5f60718293a4b5c6d7e8f' } });
    expect(app).toBeDefined();
  });

  it('rejects when the application is not found on the instance', async () => {
    const mockTableApi = {
      list: vi.fn().mockResolvedValue([]),
    };
    const mockAuth = {
      current: vi.fn().mockResolvedValue({
        snAuth: {
          instanceUrl: 'https://dev123.service-now.com',
          username: 'admin',
          password: 'secret',
        },
      }),
    };
    const mockProjectConfig = {
      addScope: vi.fn(),
    };
    const mockGlobalConfig = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ApplicationService(
      mockTableApi as never,
      mockAuth as never,
      mockProjectConfig as never,
      mockGlobalConfig as never,
    );

    await expect(service.init('x_nonexistent', projectRoot)).rejects.toThrow(
      'Application "x_nonexistent" not found on the instance.',
    );

    expect(mockGlobalConfig.log).toHaveBeenCalledWith('Application x_nonexistent not found');
  });

  it('rejects when there is no current connection', async () => {
    const mockTableApi = {
      list: vi.fn(),
    };
    const mockAuth = {
      current: vi.fn().mockResolvedValue(null),
    };
    const mockProjectConfig = {
      addScope: vi.fn(),
    };
    const mockGlobalConfig = {
      log: vi.fn(),
    };

    const service = new ApplicationService(
      mockTableApi as never,
      mockAuth as never,
      mockProjectConfig as never,
      mockGlobalConfig as never,
    );

    await expect(service.init('x_acme_app', projectRoot)).rejects.toThrow(
      'No current connection. Run `aify auth add` first.',
    );

    expect(mockTableApi.list).not.toHaveBeenCalled();
  });

  it('uses scope as displayValue when title is empty or missing', async () => {
    const mockTableApi = {
      list: vi.fn().mockResolvedValue([
        {
          sys_id: '00a1b2c3d4e5f60718293a4b5c6d7e8f',
          scope: 'x_acme_app',
          title: '',
        },
      ]),
    };
    const mockAuth = {
      current: vi.fn().mockResolvedValue({
        snAuth: {
          instanceUrl: 'https://dev123.service-now.com',
          username: 'admin',
          password: 'secret',
        },
      }),
    };
    const mockProjectConfig = {
      addScope: vi.fn().mockResolvedValue(undefined),
    };
    const mockGlobalConfig = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ApplicationService(
      mockTableApi as never,
      mockAuth as never,
      mockProjectConfig as never,
      mockGlobalConfig as never,
    );

    const result = await service.init('x_acme_app', projectRoot);

    expect(result.displayValue).toBe('x_acme_app');
  });

  it('updates Application row when displayValue or scope changes', async () => {
    const mockTableApi = {
      list: vi.fn().mockResolvedValue([
        {
          sys_id: '00a1b2c3d4e5f60718293a4b5c6d7e8f',
          scope: 'x_acme_app_v2',
          title: 'Acme Application Updated',
        },
      ]),
    };
    const mockAuth = {
      current: vi.fn().mockResolvedValue({
        snAuth: {
          instanceUrl: 'https://dev123.service-now.com',
          username: 'admin',
          password: 'secret',
        },
      }),
    };
    const mockProjectConfig = {
      addScope: vi.fn().mockResolvedValue(undefined),
    };
    const mockGlobalConfig = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ApplicationService(
      mockTableApi as never,
      mockAuth as never,
      mockProjectConfig as never,
      mockGlobalConfig as never,
    );

    // Pre-create an Application row with different values
    await Application.create({
      sysId: '00a1b2c3d4e5f60718293a4b5c6d7e8f',
      scope: 'x_acme_app_old',
      displayValue: 'Acme Application Old',
    });

    const result = await service.init('x_acme_app_v2', projectRoot);

    // Verify the row was updated
    expect(result.scope).toBe('x_acme_app_v2');
    expect(result.displayValue).toBe('Acme Application Updated');

    // Re-fetch and verify persistence
    const refetched = await Application.findOne({
      where: { sysId: '00a1b2c3d4e5f60718293a4b5c6d7e8f' },
    });
    expect(refetched?.scope).toBe('x_acme_app_v2');
    expect(refetched?.displayValue).toBe('Acme Application Updated');
  });
});
