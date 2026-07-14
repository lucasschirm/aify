/**
 * @file authentication.module.ts
 * @description NestJS module for the `aify auth` command group. Wires the credential store,
 * auth service, prompt wrapper, Table API client, and the auth commands.
 */
import { Module } from '@nestjs/common';
import { TableApiClient } from '../api/table-api.client';
import { DatabaseModule } from '../database/database.module';
import { CredentialStore } from './credential-store.service';
import { AuthService } from './auth.service';
import { PromptService } from './prompt.service';
import { AuthCommand } from './commands/auth.command';
import { AuthAddCommand } from './commands/auth-add.command';
import { AuthRemoveCommand } from './commands/auth-remove.command';

@Module({
  imports: [DatabaseModule],
  providers: [
    TableApiClient,
    CredentialStore,
    AuthService,
    PromptService,
    AuthCommand,
    AuthAddCommand,
    AuthRemoveCommand,
  ],
})
export class AuthenticationModule {}
