/**
 * @file tracker-tables.command.spec.ts
 * @description Unit tests for TrackerTablesCommand.
 */

import { describe, expect, it, vi } from 'vitest';
import { TrackerTablesCommand } from './tracker-tables.command';

describe('TrackerTablesCommand', () => {
  it('calls help when run with no subcommand', async () => {
    const helpSpy = vi.fn();
    const command = new TrackerTablesCommand();
    (command as unknown as { command: { help: () => void } }).command = { help: helpSpy };

    await command.run();

    expect(helpSpy).toHaveBeenCalled();
  });
});
