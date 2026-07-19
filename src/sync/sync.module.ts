/**
 * @file sync.module.ts
 * @description NestJS module for the sync subsystem. Wires SyncService, SyncCommand, the four
 * stages, per-scope locking, hot-mode watcher, and record-metadata access. Imports auth/config/ui
 * modules and record-metadata module for dependencies.
 */

import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { ConfigModule } from '../config/config.module';
import { RecordMetadataModule } from '../record-metadata/record-metadata.module';
import { UiModule } from '../ui/ui.module';
import { WatcherService } from './hot/watcher.service';
import { ScopeLockService } from './lock/scope-lock.service';
import { ConflictCheckStage } from './stages/conflict-check.stage';
import { PullStage } from './stages/pull.stage';
import { PushStage } from './stages/push.stage';
import { WriteStage } from './stages/write.stage';
import { AppSyncCommand, SyncCommand } from './sync.command';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthenticationModule, ConfigModule, UiModule, RecordMetadataModule],
  providers: [
    SyncService,
    SyncCommand,
    AppSyncCommand,
    PullStage,
    ConflictCheckStage,
    WriteStage,
    PushStage,
    ScopeLockService,
    WatcherService,
  ],
  exports: [SyncService, AppSyncCommand],
})
export class SyncModule {}
