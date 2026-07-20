# `.github/workflows/` — CI gates

## `ci.yml`

**Purpose:** Pull-request gate on `main` that enforces code quality and test coverage.

**Trigger:** Every pull request to `main`.

**Setup:**
- Checks out the code
- Sets up pnpm 11 and Node 22
- Installs `libsecret-1-dev` (Linux native dependency for `keytar`)
- Runs `pnpm install --frozen-lockfile`

**Checks (in sequence):**
1. **Typecheck** — `pnpm tsc --noEmit` (TypeScript compilation check)
2. **Lint & format** — `pnpm biome ci .` (Biome linter and format checker)
3. **Tests + coverage** — `pnpm vitest run --coverage` (Vitest unit tests; fails if coverage drops below 80% thresholds)

**Job id:** `ci` — this is the exact required status-check name enabled via branch protection on `main` (manual step in MANUAL_TASK.md step 8).

**Exit on failure:** Any step failure stops the job and marks the PR check as failed, preventing merge.
