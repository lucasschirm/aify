/**
 * @file application.service.spec.ts
 * Tests for ApplicationService — init, scaffold, scope tracking, and upsert logic.
 */

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnAuth } from '../api/table-api.client';
import { Application } from '../database/models/application.model';
import { buildSequelize } from '../database/sequelize.factory';
import { ApplicationService } from './application.service';

describe('ApplicationService', () => {
  let service: ApplicationService;
  let sequelize: ReturnType<typeof buildSequelize>;
  let projectRoot: string;

  const mockAuth = {
    current: vi.fn(),
  };

  const mockTableApi = {
    list: vi.fn(),
  };

  const mockProjectConfig = {
    addScope: vi.fn().mockResolvedValue(undefined),
  };

  const mockGlobalConfig = {
    log: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    // Create in-memory database and sync schema
    sequelize = buildSequelize(':memory:');
    await sequelize.sync();

    // Create a temporary project root directory
    projectRoot = await mkdtemp(join(tmpdir(), 'aify-app-'));

    // Create service with mocked dependencies
    service = new ApplicationService(
      mockTableApi as never,
      mockAuth as never,
      mockProjectConfig as never,
      mockGlobalConfig as never,
    );

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (sequelize) {
      await sequelize.close();
    }
  });

  it('rejects when no current connection exists', async () => {
    mockAuth.current.mockResolvedValue(null);

    await expect(service.init('x', projectRoot)).rejects.toThrow('No current connection');
    expect(mockTableApi.list).not.toHaveBeenCalled();
  });

  it('logs and rejects when application not found', async () => {
    const snAuth: SnAuth = {
      instanceUrl: 'https://dev12345.service-now.com/',
      username: 'admin',
      password: 'secret',
    };
    mockAuth.current.mockResolvedValue({ snAuth });
    mockTableApi.list.mockResolvedValue([]);

    await expect(service.init('x_missing', projectRoot)).rejects.toThrow(
      'Application "x_missing" not found on the instance.',
    );
    expect(mockGlobalConfig.log).toHaveBeenCalledWith('Application x_missing not found');
    expect(mockProjectConfig.addScope).not.toHaveBeenCalled();
  });

  it('queries sys_scope with exact query string', async () => {
    const snAuth: SnAuth = {
      instanceUrl: 'https://dev12345.service-now.com/',
      username: 'admin',
      password: 'secret',
    };
    mockAuth.current.mockResolvedValue({ snAuth });
    mockTableApi.list.mockResolvedValue([
      {
        sys_id: '00a1b2c3d4e5f60718293a4b5c6d7e8f',
        scope: 'x_acme_app',
        title: 'Acme App',
      },
    ]);

    await service.init('x_acme_app', projectRoot);

    expect(mockTableApi.list).toHaveBeenCalledWith(snAuth, 'sys_scope', {
      query: 'scope=x_acme_app^ORsys_id=x_acme_app',
      fields: ['sys_id', 'scope', 'title'],
      limit: 1,
    });
  });

  it('scaffolds sys_package.json with correct shape on success', async () => {
    const snAuth: SnAuth = {
      instanceUrl: 'https://dev12345.service-now.com/',
      username: 'admin',
      password: 'secret',
    };
    const sysId = '00a1b2c3d4e5f60718293a4b5c6d7e8f';
    mockAuth.current.mockResolvedValue({ snAuth });
    mockTableApi.list.mockResolvedValue([
      {
        sys_id: sysId,
        scope: 'x_acme_app',
        title: 'Acme App',
      },
    ]);

    await service.init('x_acme_app', projectRoot);

    const filePath = join(projectRoot, 'x_acme_app', 'sys_package.json');
    const content = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);

    expect(parsed).toEqual({
      scope: 'x_acme_app',
      sysId,
      name: 'Acme App',
    });
  });

  it('calls addScope with correct parameters', async () => {
    const snAuth: SnAuth = {
      instanceUrl: 'https://dev12345.service-now.com/',
      username: 'admin',
      password: 'secret',
    };
    const sysId = '00a1b2c3d4e5f60718293a4b5c6d7e8f';
    mockAuth.current.mockResolvedValue({ snAuth });
    mockTableApi.list.mockResolvedValue([
      {
        sys_id: sysId,
        scope: 'x_acme_app',
        title: 'Acme App',
      },
    ]);

    await service.init('x_acme_app', projectRoot);

    expect(mockProjectConfig.addScope).toHaveBeenCalledWith(projectRoot, {
      sysId,
      scope: 'x_acme_app',
    });
  });

  it('inserts Application row with correct attributes', async () => {
    const snAuth: SnAuth = {
      instanceUrl: 'https://dev12345.service-now.com/',
      username: 'admin',
      password: 'secret',
    };
    const sysId = '00a1b2c3d4e5f60718293a4b5c6d7e8f';
    mockAuth.current.mockResolvedValue({ snAuth });
    mockTableApi.list.mockResolvedValue([
      {
        sys_id: sysId,
        scope: 'x_acme_app',
        title: 'Acme App',
      },
    ]);

    const result = await service.init('x_acme_app', projectRoot);

    expect(result.scope).toBe('x_acme_app');
    expect(result.displayValue).toBe('Acme App');
    expect(result.sysId).toBe(sysId);

    const fromDb = await Application.findOne({ where: { sysId } });
    expect(fromDb).not.toBeNull();
    expect(fromDb?.scope).toBe('x_acme_app');
    expect(fromDb?.displayValue).toBe('Acme App');
  });

  it('uses scope as displayValue when title is missing', async () => {
    const snAuth: SnAuth = {
      instanceUrl: 'https://dev12345.service-now.com/',
      username: 'admin',
      password: 'secret',
    };
    const sysId = '00a1b2c3d4e5f60718293a4b5c6d7e8f';
    mockAuth.current.mockResolvedValue({ snAuth });
    mockTableApi.list.mockResolvedValue([
      {
        sys_id: sysId,
        scope: 'x_b',
        // no title
      },
    ]);

    await service.init('x_b', projectRoot);

    const filePath = join(projectRoot, 'x_b', 'sys_package.json');
    const content = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.name).toBe('x_b');

    const fromDb = await Application.findOne({ where: { sysId } });
    expect(fromDb?.displayValue).toBe('x_b');
  });

  it('updates existing Application row when scope or displayValue changes', async () => {
    const snAuth: SnAuth = {
      instanceUrl: 'https://dev12345.service-now.com/',
      username: 'admin',
      password: 'secret',
    };
    const sysId = '00a1b2c3d4e5f60718293a4b5c6d7e8f';

    // Pre-insert a stale Application row
    await Application.create({
      sysId,
      scope: 'x_old_scope',
      displayValue: 'Old Name',
    });

    mockAuth.current.mockResolvedValue({ snAuth });
    mockTableApi.list.mockResolvedValue([
      {
        sys_id: sysId,
        scope: 'x_acme_app',
        title: 'New Title',
      },
    ]);

    await service.init('x_acme_app', projectRoot);

    const updated = await Application.findOne({ where: { sysId } });
    expect(updated?.scope).toBe('x_acme_app');
    expect(updated?.displayValue).toBe('New Title');

    // Ensure only one row exists (not duplicated)
    const allRows = await Application.findAll();
    expect(allRows).toHaveLength(1);
  });

  it('returns the Application row on success', async () => {
    const snAuth: SnAuth = {
      instanceUrl: 'https://dev12345.service-now.com/',
      username: 'admin',
      password: 'secret',
    };
    const sysId = '00a1b2c3d4e5f60718293a4b5c6d7e8f';
    mockAuth.current.mockResolvedValue({ snAuth });
    mockTableApi.list.mockResolvedValue([
      {
        sys_id: sysId,
        scope: 'x_acme_app',
        title: 'Acme App',
      },
    ]);

    const result = await service.init('x_acme_app', projectRoot);

    expect(result).toBeInstanceOf(Application);
    expect(result.scope).toBe('x_acme_app');
    expect(result.displayValue).toBe('Acme App');
    expect(result.sysId).toBe(sysId);
  });
});
