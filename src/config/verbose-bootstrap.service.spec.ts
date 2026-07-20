/**
 * @file verbose-bootstrap.service.spec.ts
 * Tests for VerboseBootstrapService — wires the --verbose flag to GlobalConfigService.
 */

import type { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlobalConfigService } from './global/global-config.service';
import { VerboseBootstrapService } from './verbose-bootstrap.service';

describe('VerboseBootstrapService', () => {
  let service: VerboseBootstrapService;
  let mockCommander: {
    option: ReturnType<typeof vi.fn>;
    hook: ReturnType<typeof vi.fn>;
  };
  let mockGlobalConfig: {
    setVerbose: ReturnType<typeof vi.fn>;
  };
  let hookCallbacks: Map<
    string,
    (thisCmd: unknown, actionCmd: { optsWithGlobals: () => unknown }) => void
  >;

  beforeEach(() => {
    hookCallbacks = new Map();
    mockCommander = {
      option: vi.fn(),
      hook: vi.fn((event, callback) => {
        hookCallbacks.set(event, callback);
      }),
    };
    mockGlobalConfig = {
      setVerbose: vi.fn(),
    };
    service = new VerboseBootstrapService(
      mockCommander as unknown as Command,
      mockGlobalConfig as unknown as GlobalConfigService,
    );
  });

  it('registers the --verbose option on the commander instance', () => {
    service.onModuleInit();
    expect(mockCommander.option).toHaveBeenCalledWith('-v, --verbose', expect.any(String));
  });

  it('registers a preAction hook', () => {
    service.onModuleInit();
    expect(mockCommander.hook).toHaveBeenCalledWith('preAction', expect.any(Function));
  });

  it('calls setVerbose(true) when --verbose flag is set', () => {
    service.onModuleInit();
    const hook = hookCallbacks.get('preAction');
    expect(hook).toBeDefined();
    if (hook) {
      hook({}, { optsWithGlobals: () => ({ verbose: true }) });
      expect(mockGlobalConfig.setVerbose).toHaveBeenCalledWith(true);
    }
  });

  it('does not call setVerbose when --verbose flag is not set', () => {
    service.onModuleInit();
    const hook = hookCallbacks.get('preAction');
    expect(hook).toBeDefined();
    if (hook) {
      mockGlobalConfig.setVerbose.mockClear();
      hook({}, { optsWithGlobals: () => ({ verbose: false }) });
      expect(mockGlobalConfig.setVerbose).not.toHaveBeenCalled();
    }
  });
});
