/**
 * @file credential-store.service.spec.ts
 * Unit tests for CredentialStore (keytar wrapper). keytar is mocked —
 * tests never touch a real OS keychain.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as keytar from 'keytar';
import { CredentialStore } from './credential-store.service';

// Mock keytar so tests never read/write the real OS keychain.
vi.mock('keytar', () => ({
  setPassword: vi.fn(),
  getPassword: vi.fn(),
  deletePassword: vi.fn(),
}));

describe('CredentialStore', () => {
  let store: CredentialStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new CredentialStore();
  });

  it('setPassword stores under service "aify" and the alias account', async () => {
    await store.setPassword('prod', 's3cret');
    expect(keytar.setPassword).toHaveBeenCalledWith('aify', 'prod', 's3cret');
  });

  it('getPassword returns the keychain value', async () => {
    vi.mocked(keytar.getPassword).mockResolvedValue('s3cret');
    await expect(store.getPassword('prod')).resolves.toBe('s3cret');
    expect(keytar.getPassword).toHaveBeenCalledWith('aify', 'prod');
  });

  it('getPassword returns null when nothing is stored', async () => {
    vi.mocked(keytar.getPassword).mockResolvedValue(null);
    await expect(store.getPassword('missing')).resolves.toBeNull();
  });

  it('deletePassword removes the keychain entry for the alias', async () => {
    await store.deletePassword('prod');
    expect(keytar.deletePassword).toHaveBeenCalledWith('aify', 'prod');
  });
});
