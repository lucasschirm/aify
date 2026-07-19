# sync/hot

Hot-mode (`aify sync --hot`) support: file watching with self-write suppression and the
`AIFY_FILE_WRITTEN` event contract.

## Files
- `hot-events.ts` — `AIFY_FILE_WRITTEN` event name + payload shape.
- `watcher.service.ts` — `WatcherService`: chokidar watch, debounce, suppress exactly one
  subsequent change per aify-written path.
- `watcher.service.spec.ts` — unit tests with mocked chokidar + fake timers.

## Notes
- `WatcherService.onAifyWrite` is decorated with `@OnEvent(AIFY_FILE_WRITTEN)` so
  `WriteStage` can emit a single event and the watcher ignores its own writes (OS-22).
