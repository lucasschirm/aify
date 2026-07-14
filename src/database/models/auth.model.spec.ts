/**
 * @file auth.model.spec.ts
 * Tests for the Auth Sequelize model.
 */
import { buildSequelize } from '../sequelize.factory';
import { Instance } from './instance.model';
import { Auth } from './auth.model';
import { describe, expect, it } from 'vitest';

async function seedInstance(): Promise<Instance> {
  return Instance.create({
    instance: 'a.service-now.com',
    url: 'https://a.service-now.com/',
  });
}

describe('Auth model', () => {
  it('stores metadata only — there is no password column', async () => {
    const sequelize = buildSequelize(':memory:');
    const attributes = Object.keys(Auth.getAttributes());
    expect(attributes).not.toContain('password');
    expect(attributes).toEqual(
      expect.arrayContaining(['id', 'alias', 'username', 'instanceId', 'isCurrent', 'lastUsedAt']),
    );
    await sequelize.close();
  });

  it('persists an auth row linked to an instance', async () => {
    const sequelize = buildSequelize(':memory:');
    await sequelize.sync();
    const inst = await seedInstance();

    const auth = await Auth.create({
      alias: 'prod',
      username: 'admin',
      instanceId: inst.id,
      isCurrent: false,
    });

    expect(auth.id).toBeGreaterThan(0);
    expect(auth.instanceId).toBe(inst.id);
    expect(auth.isCurrent).toBe(false);
    // lastUsedAt is null or undefined until explicitly set
    expect(auth.lastUsedAt === null || auth.lastUsedAt === undefined).toBe(true);
    await sequelize.close();
  });

  it('flips a previously-current auth to false when a second becomes current', async () => {
    const sequelize = buildSequelize(':memory:');
    await sequelize.sync();
    const inst = await seedInstance();

    const first = await Auth.create({
      alias: 'first',
      username: 'u1',
      instanceId: inst.id,
      isCurrent: true,
    });
    expect(first.isCurrent).toBe(true);

    const second = await Auth.create({
      alias: 'second',
      username: 'u2',
      instanceId: inst.id,
      isCurrent: true,
    });

    await first.reload();
    expect(first.isCurrent).toBe(false);
    expect(second.isCurrent).toBe(true);

    const currentCount = await Auth.count({ where: { isCurrent: true } });
    expect(currentCount).toBe(1);
    await sequelize.close();
  });

  it('flips others to false when an EXISTING row is updated to current', async () => {
    const sequelize = buildSequelize(':memory:');
    await sequelize.sync();
    const inst = await seedInstance();

    const a = await Auth.create({
      alias: 'a',
      username: 'u',
      instanceId: inst.id,
      isCurrent: true,
    });
    const b = await Auth.create({
      alias: 'b',
      username: 'u',
      instanceId: inst.id,
      isCurrent: false,
    });

    b.isCurrent = true;
    await b.save();

    await a.reload();
    expect(a.isCurrent).toBe(false);
    expect(b.isCurrent).toBe(true);
    await sequelize.close();
  });

  it('rejects a duplicate alias (globally unique, OS-16)', async () => {
    const sequelize = buildSequelize(':memory:');
    await sequelize.sync();
    const inst = await seedInstance();

    await Auth.create({
      alias: 'dup',
      username: 'u',
      instanceId: inst.id,
      isCurrent: false,
    });
    await expect(
      Auth.create({
        alias: 'dup',
        username: 'u2',
        instanceId: inst.id,
        isCurrent: false,
      }),
    ).rejects.toThrow();

    await sequelize.close();
  });
});
