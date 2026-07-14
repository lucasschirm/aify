# Plan for Task 002: Biome

## Context
Task 001 set up the basic scaffold and boilerplate. Task 002 adds Biome linting with two critical rules enforced as errors: no explicit `any` and no unused variables. This gate is essential for the rest of the project, as every committed source must pass `biome ci .`.

## Approach
Follow the five-step verification loop: prove the linter blocks forbidden patterns with a failing probe, configure biome.json to treat those rules as errors (not just warnings), format the existing source so `biome ci .` is clean, and verify that the probe now fails while the real code passes.

## Status
- `@biomejs/biome` v2.5.3 ✅ already installed
- `biome init` ✅ ran (creates v2 config)
- `lint` script ✅ already exists as `biome ci .`
- `format` script ❌ needs to be added

## Steps
- [x] Step 1: Create `src/biome-probe.ts` containing an explicit `any` and unused variable
- [x] Step 2: Run Biome check on probe — `noExplicitAny` is already ERROR in recommended preset, `noUnusedVariables` is WARNING
- [x] Step 3: Update `biome.json` with noExplicitAny(error) + noUnusedVariables(error) + space indent + lineWidth 100 + single quotes
- [x] Step 4: Add `format` script to `package.json`
- [x] Step 5: Format the scaffold sources with `biome check --write` — 2 files formatted
- [x] Step 6: Probe rejected with 2 errors (exit=1), probe deleted, `pnpm lint` passes (exit=0), `pnpm format` passes
- [ ] Step 7: Commit all changes
