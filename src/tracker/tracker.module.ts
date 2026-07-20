/**
 * @file tracker.module.ts
 * @description NestJS module for the tracker subsystem. Wires TrackerService, TrackerTypeService,
 * TrackerTargetService, and the tracker commands. Imports ApiModule, ConfigModule, and
 * AuthenticationModule for schema access, configuration management, and prompting.
 */

import { Module } from '@nestjs/common';
import { ApiModule } from '../api/api.module';
import { AuthenticationModule } from '../authentication/authentication.module';
import { ConfigModule } from '../config/config.module';
import { TrackerCommand } from './commands/tracker.command';
import { TrackerTablesCommand } from './commands/tracker-tables.command';
import { TrackerTablesAddCommand } from './commands/tracker-tables-add.command';
import { TrackerTypesCommand } from './commands/tracker-types.command';
import { TrackerTypesAddCommand } from './commands/tracker-types-add.command';
import { TrackerService } from './tracker.service';
import { TrackerTargetService } from './tracker-target.service';
import { TrackerTypeService } from './tracker-type.service';

@Module({
  imports: [ApiModule, ConfigModule, AuthenticationModule],
  providers: [
    TrackerTargetService,
    TrackerTypeService,
    TrackerService,
    TrackerCommand,
    TrackerTablesCommand,
    TrackerTablesAddCommand,
    TrackerTypesCommand,
    TrackerTypesAddCommand,
  ],
})
export class TrackerModule {}
