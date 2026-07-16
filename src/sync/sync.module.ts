/**
 * @file sync.module.ts
 * @description NestJS module for the sync subsystem. Wires SyncService and SyncCommand,
 * importing auth/config/ui modules for dependencies.
 */
import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { ConfigModule } from '../config/config.module';
import { UiModule } from '../ui/ui.module';
import { SyncCommand } from './sync.command';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthenticationModule, ConfigModule, UiModule],
  providers: [SyncService, SyncCommand],
})
export class SyncModule {}
