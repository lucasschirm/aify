/**
 * @file api.module.ts
 * NestJS module for ServiceNow API clients and services. Imports ConfigModule and
 * AuthenticationModule (never the reverse — this avoids a DI cycle). Provides and exports
 * the HTTP client, Table API client, schema API client, and schema service.
 */
import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { ConfigModule } from '../config/config.module';
import { SnHttpClient } from './sn-http.client';
import { TableApiClient } from './table-api.client';
import { TableSchemaService } from './table-schema.service';
import { TableSchemaApiClient } from './table-schema-api.client';

@Module({
  imports: [ConfigModule, AuthenticationModule],
  providers: [SnHttpClient, TableApiClient, TableSchemaApiClient, TableSchemaService],
  exports: [TableSchemaService, TableSchemaApiClient, TableApiClient, SnHttpClient],
})
export class ApiModule {}
