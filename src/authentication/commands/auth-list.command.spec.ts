/**
 * @file auth-list.command.spec.ts
 * Tests for `renderAuthList` (pure renderer backed by cli-table3) and `AuthListCommand` (maps
 * AuthService.list rows to presentation rows and prints the table). The command is tested with
 * a mocked AuthService via @nestjs/testing.
 */
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth.service';
import { AuthListCommand, renderAuthList } from './auth-list.command';

describe('renderAuthList', () => {
  it('renders a header and one row per connection with cli-table3 borders', () => {
    const output = renderAuthList([
      {
        isCurrent: true,
        alias: 'prod',
        instance: 'acme.service-now.com',
        username: 'admin',
        lastUsedAt: new Date('2026-07-13T10:00:00.000Z'),
      },
      {
        isCurrent: false,
        alias: 'dev',
        instance: 'dev.service-now.com',
        username: 'developer',
        lastUsedAt: null,
      },
    ]);

    expect(output).toBe(
      [
        '┌────────────┬───────┬──────────────────────┬───────────┬──────────────────────────┐',
        '│ is_current │ alias │ instance             │ username  │ last_used                │',
        '├────────────┼───────┼──────────────────────┼───────────┼──────────────────────────┤',
        '│ *          │ prod  │ acme.service-now.com │ admin     │ 2026-07-13T10:00:00.000Z │',
        '├────────────┼───────┼──────────────────────┼───────────┼──────────────────────────┤',
        '│            │ dev   │ dev.service-now.com  │ developer │ never                    │',
        '└────────────┴───────┴──────────────────────┴───────────┴──────────────────────────┘',
      ].join('\n'),
    );
  });

  it('renders an empty-state row spanning all columns when there are no connections', () => {
    expect(renderAuthList([])).toBe(
      [
        '┌────────────┬───────┬──────────┬──────────┬───────────┐',
        '│ is_current │ alias │ instance │ username │ last_used │',
        '├────────────┴───────┴──────────┴──────────┴───────────┤',
        '│ _no connections_                                     │',
        '└──────────────────────────────────────────────────────┘',
      ].join('\n'),
    );
  });
});

describe('AuthListCommand', () => {
  let command: AuthListCommand;
  let authService: { list: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = { list: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [AuthListCommand, { provide: AuthService, useValue: authService }],
    }).compile();
    command = moduleRef.get(AuthListCommand);
  });

  it('maps auth rows (with their instance host) and prints the formatted table', async () => {
    authService.list.mockResolvedValue([
      {
        isCurrent: true,
        alias: 'prod',
        username: 'admin',
        lastUsedAt: new Date('2026-07-13T10:00:00.000Z'),
        instance: { instance: 'acme.service-now.com' },
      },
    ]);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await command.run();

    expect(spy).toHaveBeenCalledWith(
      renderAuthList([
        {
          isCurrent: true,
          alias: 'prod',
          instance: 'acme.service-now.com',
          username: 'admin',
          lastUsedAt: new Date('2026-07-13T10:00:00.000Z'),
        },
      ]),
    );
    spy.mockRestore();
  });
});
