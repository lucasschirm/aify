/**
 * @file tracker-types.command.spec.ts
 * @description Unit tests for TrackerTypesCommand.
 */

import { describe, expect, it, vi } from 'vitest';
import { TrackerTypesCommand } from './tracker-types.command';

describe('TrackerTypesCommand', () => {
  it('calls help when run with no subcommand', async () => {
    const helpSpy = vi.fn();
    const command = new TrackerTypesCommand();
    (command as unknown as { command: { help: () => void } }).command = { help: helpSpy };

    await command.run();

    expect(helpSpy).toHaveBeenCalled();
  });
});
