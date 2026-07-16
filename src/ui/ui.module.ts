/**
 * @file ui.module.ts
 * NestJS module for UI helpers (spinner, etc.). Exports `SpinnerService` so any domain
 * module that wants to show a loading animation can inject it.
 */
import { Module } from '@nestjs/common';
import { SpinnerService } from './spinner.service';

@Module({
  providers: [SpinnerService],
  exports: [SpinnerService],
})
export class UiModule {}
