# src/ui

Terminal UI helpers (spinner, etc.) used across aify commands and services.

| File | Purpose |
|------|---------|
| `spinner.service.ts` | `SpinnerService` — injectable wrapper around `ora`. `start(text)` / `text(text)` / `succeed(text?)` / `fail(text?)` / `info(text?)` / `stop()`. Hides ora behind a mockable interface. |
| `ui.module.ts` | NestJS module exporting `SpinnerService`. |
| `spinner.service.spec.ts` | Vitest spec; `ora` is mocked with `vi.mock('ora')`. |

## Notes
- `ora@5` is the last CJS-compatible version (the project is CommonJS).
- The spinner is optional — services should call `start()`/`stop()` around long operations but must not rely on it for correctness.
