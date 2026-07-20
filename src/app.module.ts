/**
 * Root application module.
 *
 * Aggregates every domain module (authentication, database, config, ...).
 * `DatabaseModule.forRoot()` is called with the global config DB path resolved
 * from `GlobalConfigService.dbPath()` (the `~/.aify/aifydb.sqlite3` path).
 */
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ApiModule } from './api/api.module';
import { ApplicationModule } from './application/application.module';
import { AuthenticationModule } from './authentication/authentication.module';
import { ConfigModule } from './config/config.module';
import { GlobalConfigService } from './config/global/global-config.service';
import { DatabaseModule } from './database/database.module';
import { SyncModule } from './sync/sync.module';
import { TrackerModule } from './tracker/tracker.module';

const globalConfig = new GlobalConfigService();
const dbPath = globalConfig.dbPath();

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ConfigModule,
    DatabaseModule.forRoot(dbPath),
    AuthenticationModule,
    ApiModule,
    ApplicationModule,
    SyncModule,
    TrackerModule,
  ],
})
export class AppModule {}
