/**
 * @file auth-update.command.spec.ts
 * Tests for AuthUpdateCommand — mocked CredentialStore and PromptService.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AuthUpdateCommand } from './auth-update.command';
import { AuthService } from '../auth.service';
import { CredentialStore } from '../credential-store.service';
import { PromptService } from '../prompt.service';

describe('AuthUpdateCommand', () => {
  let command: AuthUpdateCommand;
  let credentials: { setPassword: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    credentials = { setPassword: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthUpdateCommand,
        { provide: AuthService, useValue: {} },
        { provide: CredentialStore, useValue: credentials },
        { provide: PromptService, useValue: { password: vi.fn().mockResolvedValue('n3w') } },
      ],
    }).compile();
    command = moduleRef.get(AuthUpdateCommand);
  });

  it('prompts for alias (with flag) and masked password', async () => {
    await command.run([], { alias: 'prod' });

    expect(credentials.setPassword).toHaveBeenCalledWith('prod', 'n3w');
  });

  it('prompts for alias when no flag', async () => {
    const prompt = {
      password: vi.fn().mockResolvedValue('n3w'),
      input: vi.fn().mockResolvedValue('dev'),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthUpdateCommand,
        { provide: AuthService, useValue: {} },
        { provide: CredentialStore, useValue: credentials },
        { provide: PromptService, useValue: prompt },
      ],
    }).compile();
    const cmd = moduleRef.get(AuthUpdateCommand);

    await cmd.run([]);

    expect(prompt.input).toHaveBeenCalledWith('Alias:');
    expect(prompt.password).toHaveBeenCalledWith('New Password:');
  });
});
