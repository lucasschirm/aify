/**
 * @file application.model.spec.ts
 * Tests for the Application Sequelize model.
 */

import { describe, expect, it } from 'vitest';
import { buildSequelize } from '../sequelize.factory';
import { Application } from './application.model';

describe('Application model', () => {
  it('persists scope, sysId and displayValue with no instance link (OS-20)', async () => {
    const sequelize = buildSequelize(':memory:');
    await sequelize.sync();

    const app = await Application.create({
      scope: 'x_acme_app',
      sysId: '00a1b2c3d4e5f60718293a4b5c6d7e8f',
      displayValue: 'Acme App',
    });

    expect(app.id).toBeGreaterThan(0);
    expect(app.scope).toBe('x_acme_app');
    expect(app.sysId).toBe('00a1b2c3d4e5f60718293a4b5c6d7e8f');
    expect(app.displayValue).toBe('Acme App');

    const attributes = Object.keys(Application.getAttributes());
    expect(attributes).not.toContain('instanceId');
    expect(attributes).not.toContain('instance');
    await sequelize.close();
  });

  it('enforces unique scope, sysId and displayValue', async () => {
    const sequelize = buildSequelize(':memory:');
    await sequelize.sync();

    await Application.create({ scope: 's1', sysId: 'aa11', displayValue: 'App One' });

    // duplicate scope
    await expect(
      Application.create({ scope: 's1', sysId: 'bb22', displayValue: 'App Two' }),
    ).rejects.toThrow();
    // duplicate sysId
    await expect(
      Application.create({ scope: 's2', sysId: 'aa11', displayValue: 'App Three' }),
    ).rejects.toThrow();
    // duplicate displayValue
    await expect(
      Application.create({ scope: 's3', sysId: 'cc33', displayValue: 'App One' }),
    ).rejects.toThrow();

    await sequelize.close();
  });

  it('defaults lastSyncedAt to null and can persist and read back a Date', async () => {
    const sequelize = buildSequelize(':memory:');
    await sequelize.sync();

    const app = await Application.create({
      scope: 'x_acme_app',
      sysId: '00a1b2c3d4e5f60718293a4b5c6d7e8f',
      displayValue: 'Acme App',
    });

    expect(app.lastSyncedAt).toBeNull();

    const now = new Date();
    app.lastSyncedAt = now;
    await app.save();

    const reloaded = await Application.findByPk(app.id);
    expect(reloaded?.lastSyncedAt).toBeDefined();
    if (reloaded?.lastSyncedAt) {
      expect(new Date(reloaded.lastSyncedAt).getTime()).toBeCloseTo(now.getTime(), -2);
    }

    await sequelize.close();
  });
});
