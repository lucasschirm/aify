/**
 * Root application module.
 *
 * Aggregates every domain module (authentication, database, config, ...).
 * `DatabaseModule.forRoot()` is called with the global config DB path resolved
 * from `GlobalConfigService.dbPath()` (the `~/.aify/aifydb.sqlite3` path).
 */
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ApplicationModule } from './application/application.module';
import { AuthenticationModule } from './authentication/authentication.module';
import { ConfigModule } from './config/config.module';
import { GlobalConfigService } from './config/global/global-config.service';
import { DatabaseModule } from './database/database.module';
import { SyncModule } from './sync/sync.module';

const globalConfig = new GlobalConfigService();
const dbPath = globalConfig.dbPath();

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ConfigModule,
    DatabaseModule.forRoot(dbPath),
    AuthenticationModule,
    ApplicationModule,
    SyncModule,
  ],
})
export class AppModule {}
