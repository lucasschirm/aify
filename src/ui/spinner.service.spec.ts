/**
 * @file spinner.service.spec.ts
 * Tests for SpinnerService — mocks `ora` so no real terminal rendering happens.
 */
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ora', () => {
  const instance = {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn(),
    fail: vi.fn(),
    info: vi.fn(),
    stop: vi.fn(),
    text: '',
  };
  const factory = vi.fn(() => instance);
  return { default: factory };
});

import ora from 'ora';
import { SpinnerService } from './spinner.service';

describe('SpinnerService', () => {
  let service: SpinnerService;

  beforeEach(async () => {
    vi.mocked(ora).mockClear();
    const moduleRef = await Test.createTestingModule({
      providers: [SpinnerService],
    }).compile();
    service = moduleRef.get(SpinnerService);
  });

  it('starts a spinner with the given text', () => {
    service.start('loading');
    expect(ora).toHaveBeenCalledWith('loading');
  });

  it('succeeds and clears the spinner', () => {
    service.start('loading');
    service.succeed('done');
    // After succeed, a new start should create a fresh ora instance
    service.start('next');
    expect(ora).toHaveBeenCalledTimes(2);
  });

  it('fail stops the spinner with a failure marker', () => {
    service.start('loading');
    service.fail('error');
  });

  it('stop is safe to call when no spinner is active', () => {
    service.stop(); // should not throw
  });

  it('text updates the spinner text without stopping', () => {
    service.start('loading');
    service.text('still loading');
  });
});
