# src/

Root of all aify TypeScript source. Compiled to `dist/` by `nest build`; the CLI
is published as `@lucasschirm/aify` and run as the `aify` command.

## Files
- `main.ts` — CLI entry point (`#!/usr/bin/env node`). Imports `reflect-metadata`
  and boots nest-commander via `CommandFactory.run(AppModule, { cliName, version })`.
- `app.module.ts` — root NestJS module; imports every domain module.

## Conventions
- CommonJS, TypeScript 5.x, `experimentalDecorators` + `emitDecoratorMetadata`.
- One NestJS module per domain, each in its own folder with its own `AGENTS.md`.
- Header comment on every file; JSDoc on every exported service/method.