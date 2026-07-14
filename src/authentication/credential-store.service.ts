/**
 * @file credential-store.service.ts
 * @description Thin wrapper around the `keytar` OS keychain. ServiceNow passwords are
 * stored here (OS-17) instead of the database or any file. The keytar service name is
 * always "aify"; the account is the globally-unique auth alias.
 */
import { Injectable } from '@nestjs/common';
import * as keytar from 'keytar';

/** Fixed keytar service name under which every aify credential is stored. */
const SERVICE_NAME = 'aify';

@Injectable()
export class CredentialStore {
  /** Store (or overwrite) the password for an alias in the OS keychain. */
  async setPassword(alias: string, password: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, alias, password);
  }

  /** Return the stored password for an alias, or null when none exists. */
  async getPassword(alias: string): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, alias);
  }

  /** Delete the stored password for an alias (no-op if absent). */
  async deletePassword(alias: string): Promise<void> {
    await keytar.deletePassword(SERVICE_NAME, alias);
  }
}
