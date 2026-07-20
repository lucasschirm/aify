/**
 * @file application.module.ts
 * @description NestJS module for the `aify app` command group. Wires ApplicationService
 * and the app commands, importing auth/config/database modules for dependencies.
 */
import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { SyncModule } from '../sync/sync.module';
import { ApplicationService } from './application.service';
import { AppCommand, AppInitCommand } from './commands/app-init.command';
import { AppListCommand } from './commands/app-list.command';

@Module({
  imports: [AuthenticationModule, ConfigModule, DatabaseModule, SyncModule],
  providers: [ApplicationService, AppCommand, AppInitCommand, AppListCommand],
})
export class ApplicationModule {}
