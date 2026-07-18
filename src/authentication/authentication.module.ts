/**
 * @file authentication.module.ts
 * @description NestJS module for the `aify auth` command group. Wires the credential store,
 * auth service, prompt wrapper, Table API client, and the auth commands.
 */
import { Module } from '@nestjs/common';
import { TableApiClient } from '../api/table-api.client';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { UiModule } from '../ui/ui.module';
import { AuthService } from './auth.service';
import { AuthCommand } from './commands/auth.command';
import { AuthAddCommand } from './commands/auth-add.command';
import { AuthListCommand } from './commands/auth-list.command';
import { AuthRemoveCommand } from './commands/auth-remove.command';
import { AuthUpdateCommand } from './commands/auth-update.command';
import { AuthUseCommand } from './commands/auth-use.command';
import { AuthVerifyCommand } from './commands/auth-verify.command';
import { CredentialStore } from './credential-store.service';
import { PromptService } from './prompt.service';

@Module({
  imports: [DatabaseModule, ConfigModule, UiModule],
  providers: [
    TableApiClient,
    CredentialStore,
    AuthService,
    PromptService,
    AuthCommand,
    AuthAddCommand,
    AuthListCommand,
    AuthRemoveCommand,
    AuthUpdateCommand,
    AuthUseCommand,
    AuthVerifyCommand,
  ],
  exports: [TableApiClient, AuthService, PromptService],
})
export class AuthenticationModule {}
