/**
 * @file hot-events.ts
 * @description Event names used by the hot-sync subsystem. `AIFY_FILE_WRITTEN` is emitted by
 * `WriteStage` before it writes a file so the `WatcherService` can ignore its own disk changes.
 */

export const AIFY_FILE_WRITTEN = 'aify.file.written';

export interface AifyFileWrittenPayload {
  filePath: string;
}
