/**
 * @file authentication.module.spec.ts
 * Sanity check that AuthenticationModule compiles under DI.
 */
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AuthenticationModule } from './authentication.module';
import { AuthService } from './auth.service';
import { AuthAddCommand } from './commands/auth-add.command';
import { DatabaseModule } from '../database/database.module';

describe('AuthenticationModule', () => {
  it('compiles with all providers injected', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRoot(':memory:'), AuthenticationModule],
    }).compile();

    const authService = moduleRef.get(AuthService);
    expect(authService).toBeInstanceOf(AuthService);
  });
});
