/**
 * @file config.module.ts
 * NestJS module for project and global configuration. Exposes `ProjectConfigService`,
 * `GlobalConfigService`, and `TrackedTablesService` so other domains can resolve project roots,
 * global paths, and merged tracked-table configuration. Also registers `VerboseBootstrapService`
 * which adds the global `--verbose` flag to the nest-commander CLI.
 */
import { Module } from '@nestjs/common';
import { GlobalConfigService } from './global/global-config.service';
import { ProjectConfigService } from './project/project-config.service';
import { TrackedTablesService } from './tracked-tables/tracked-tables.service';
import { VerboseBootstrapService } from './verbose-bootstrap.service';

@Module({
  providers: [
    GlobalConfigService,
    ProjectConfigService,
    TrackedTablesService,
    VerboseBootstrapService,
  ],
  exports: [GlobalConfigService, ProjectConfigService, TrackedTablesService],
})
export class ConfigModule {}
