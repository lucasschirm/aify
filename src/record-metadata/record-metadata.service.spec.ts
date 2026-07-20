/**
 * @file record-metadata.service.spec.ts
 * Tests for RecordMetadataService — record folder resolution, metadata reading/writing, scope loading.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecordMetadataService } from './record-metadata.service';
import type { RecordMetadata } from './record-metadata.types';

describe('RecordMetadataService', () => {
  let root: string;
  let service: RecordMetadataService;

  beforeEach(async () => {
    // Create a temp directory for testing
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    root = join(tmpdir(), `aify-record-meta-${timestamp}-${randomSuffix}`);
    await mkdir(root, { recursive: true });
    service = new RecordMetadataService();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('read', () => {
    it('returns null when the metadata file does not exist', async () => {
      const result = await service.read(join(root, 'nonexistent'));
      expect(result).toBeNull();
    });

    it('reads and parses record metadata', async () => {
      const folder = join(root, 'scope', 'table', 'record');
      await mkdir(folder, { recursive: true });
      const meta: RecordMetadata = {
        $sys_id: 'id123',
        $table: 'sys_app',
        $display_value: 'Test App',
        $parsed_display_value: 'Test App',
        $sys_updated_on: '2026-07-20T10:00:00.000Z',
        $sys_mod_count: 1,
        $hash: { script: 'abc123' },
        $conflicts: {},
      };
      await writeFile(join(folder, 'record_metadata.json'), JSON.stringify(meta));

      const result = await service.read(folder);

      expect(result).toEqual(meta);
    });
  });

  describe('write', () => {
    it('writes metadata atomically and creates parent directories', async () => {
      const folder = join(root, 'new', 'scope', 'table', 'record');
      const meta: RecordMetadata = {
        $sys_id: 'id123',
        $table: 'sys_app',
        $display_value: 'Test App',
        $parsed_display_value: 'Test App',
        $sys_updated_on: '2026-07-20T10:00:00.000Z',
        $sys_mod_count: 1,
        $hash: {},
        $conflicts: {},
      };

      await service.write(folder, meta);

      const written = await readFile(join(folder, 'record_metadata.json'), 'utf8');
      expect(JSON.parse(written)).toEqual(meta);
    });
  });

  describe('loadScopeMap', () => {
    it('returns an empty map when the scope directory does not exist', async () => {
      const map = await service.loadScopeMap(root, 'nonexistent_scope');
      expect(map.size).toBe(0);
    });

    it('loads all record metadata from a scope into a map keyed by sys_id', async () => {
      const scopePath = join(root, 'my_scope', 'sys_app', 'rec1');
      await mkdir(scopePath, { recursive: true });
      const meta1: RecordMetadata = {
        $sys_id: 'sys_id_1',
        $table: 'sys_app',
        $display_value: 'App 1',
        $parsed_display_value: 'App 1',
        $sys_updated_on: '2026-07-20T10:00:00.000Z',
        $sys_mod_count: 1,
        $hash: {},
        $conflicts: {},
      };
      await writeFile(join(scopePath, 'record_metadata.json'), JSON.stringify(meta1));

      const map = await service.loadScopeMap(root, 'my_scope');

      expect(map.has('sys_id_1')).toBe(true);
      expect(map.get('sys_id_1')?.meta).toEqual(meta1);
    });
  });

  describe('rename', () => {
    it('does nothing when oldFolder === newFolder', async () => {
      const folder = join(root, 'scope', 'table', 'record');
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'test.txt'), 'content');

      await service.rename(folder, folder);

      const exists = await readFile(join(folder, 'test.txt'), 'utf8');
      expect(exists).toBe('content');
    });

    it('renames a folder when paths differ', async () => {
      const oldFolder = join(root, 'old_name');
      const newFolder = join(root, 'new_name');
      await mkdir(oldFolder, { recursive: true });
      await writeFile(join(oldFolder, 'file.txt'), 'content');

      await service.rename(oldFolder, newFolder);

      const exists = await readFile(join(newFolder, 'file.txt'), 'utf8');
      expect(exists).toBe('content');
    });
  });
});
