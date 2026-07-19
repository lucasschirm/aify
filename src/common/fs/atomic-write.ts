/**
 * @file atomic-write.ts
 * @description Atomic file writes for aify: create a temporary file next to the target, write the
 * payload, then rename it into place. This avoids readers seeing a partially-written file.
 */

import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Write `data` to `filePath` atomically. Parent directories are created as needed.
 *
 * @param filePath Absolute path of the file to write.
 * @param data Text content to write.
 */
export async function writeFileAtomic(filePath: string, data: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  await writeFile(tmpPath, data, 'utf8');
  await rename(tmpPath, filePath);
}
