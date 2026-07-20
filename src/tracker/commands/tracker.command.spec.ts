/**
 * @file tracker.command.spec.ts
 * @description Unit tests for TrackerCommand.
 */

import { describe, expect, it, vi } from 'vitest';
import { TrackerCommand } from './tracker.command';

describe('TrackerCommand', () => {
  it('calls help when run with no subcommand', async () => {
    const helpSpy = vi.fn();
    const command = new TrackerCommand();
    (command as unknown as { command: { help: () => void } }).command = { help: helpSpy };

    await command.run();

    expect(helpSpy).toHaveBeenCalled();
  });
});
