/**
 * @file record-metadata.module.ts
 * @description NestJS module for the record-metadata bridge. Exports `RecordMetadataService`
 * to the sync and application modules.
 */

import { Module } from '@nestjs/common';
import { RecordMetadataService } from './record-metadata.service';

@Module({
  providers: [RecordMetadataService],
  exports: [RecordMetadataService],
})
export class RecordMetadataModule {}
