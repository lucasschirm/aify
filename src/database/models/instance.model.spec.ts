/**
 * @file instance.model.spec.ts
 * Tests for the Instance Sequelize model.
 */
import { buildSequelize } from '../sequelize.factory';
import { Instance } from './instance.model';
import { describe, expect, it } from 'vitest';

describe('Instance model', () => {
  it('stores only the host in `instance` and the full URL in `url`', async () => {
    const sequelize = buildSequelize(':memory:');
    await sequelize.sync();

    await Instance.create({
      instance: 'lucas.service-now.com',
      url: 'https://lucas.service-now.com/',
    });

    const row = await Instance.findOne({ where: { instance: 'lucas.service-now.com' } });
    expect(row).not.toBeNull();
    // `instance` is the host only: no scheme, no path, no trailing slash.
    expect(row?.instance).toBe('lucas.service-now.com');
    expect(row?.instance).not.toMatch(/https?:\/\//);
    expect(row?.instance).not.toContain('/');
    // `url` keeps the full URL (host extraction is done by AuthService.add, TASK_018).
    expect(row?.url).toBe('https://lucas.service-now.com/');
    expect(typeof row?.id).toBe('number');

    await sequelize.close();
  });

  it('rejects a duplicate host (unique constraint on `instance`)', async () => {
    const sequelize = buildSequelize(':memory:');
    await sequelize.sync();

    await Instance.create({ instance: 'dup.service-now.com', url: 'https://dup.service-now.com/' });
    await expect(
      Instance.create({
        instance: 'dup.service-now.com',
        url: 'https://dup.service-now.com/other/',
      }),
    ).rejects.toThrow();

    await sequelize.close();
  });
});
