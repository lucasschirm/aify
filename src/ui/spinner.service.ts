/**
 * @file spinner.service.ts
 * Injectable wrapper around `ora` for showing a loading spinner during long-running
 * operations (auth test, sync, etc.). Hides the ora dependency behind a simple interface
 * so it can be mocked in tests without pulling in the real terminal renderer.
 */
import { Injectable } from '@nestjs/common';
import ora, { type Ora } from 'ora';

@Injectable()
export class SpinnerService {
  private spinner: Ora | undefined;

  /** Start a spinner with the given text. Replaces any existing spinner. */
  start(text: string): void {
    this.stop();
    this.spinner = ora(text).start();
  }

  /** Update the spinner text without stopping it. */
  text(text: string): void {
    if (this.spinner) this.spinner.text = text;
  }

  /** Stop the spinner and mark it as succeeded with an optional final message. */
  succeed(text?: string): void {
    if (this.spinner) {
      this.spinner.succeed(text);
      this.spinner = undefined;
    }
  }

  /** Stop the spinner and mark it as failed with an optional final message. */
  fail(text?: string): void {
    if (this.spinner) {
      this.spinner.fail(text);
      this.spinner = undefined;
    }
  }

  /** Stop the spinner and mark it with an info symbol + optional final message. */
  info(text?: string): void {
    if (this.spinner) {
      this.spinner.info(text);
      this.spinner = undefined;
    }
  }

  /** Stop the spinner silently (no success/fail marker). */
  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = undefined;
    }
  }
}
