/**
 * Root application module.
 *
 * Aggregates every domain module (authentication, database, config, api, sync, ...).
 * It is intentionally empty in the scaffold; later tasks add their modules to `imports`.
 */
import { Module } from '@nestjs/common';

@Module({
  imports: [],
})
export class AppModule {}
