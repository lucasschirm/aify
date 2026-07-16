/**
 * @file application.module.ts
 * @description NestJS module for the `aify app` command group. Wires ApplicationService
 * and the app commands, importing auth/config/database modules for dependencies.
 */
import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { ApplicationService } from './application.service';
import { AppCommand, AppInitCommand, AppSyncCommand } from './commands/app-init.command';

@Module({
  imports: [AuthenticationModule, ConfigModule, DatabaseModule],
  providers: [ApplicationService, AppCommand, AppInitCommand, AppSyncCommand],
})
export class ApplicationModule {}
