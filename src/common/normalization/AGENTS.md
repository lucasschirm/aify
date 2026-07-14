# src/common/normalization

Pure, dependency-free string helpers that turn ServiceNow names into filesystem-safe tokens.
No I/O, no NestJS — safe to import anywhere.

| File | Purpose |
|------|---------|
| `normalize-scope.ts` | `normalizeScope(name)` — canonical scope-name normalization (spec "Normalization", C4). Collapses `[@/.\s]+` runs to `_` and trims. |
| `slugify.ts` | `slugifyDisplayValue(value, sysId)` — transliterate → lowercase → `-`-slug of a display value; empty slug falls back to the first 8 chars of `sysId` (OS-11). |
| `normalize-scope.spec.ts` | Vitest cases for `normalizeScope` (spec examples). |
| `slugify.spec.ts` | Vitest cases for `slugifyDisplayValue` (spec examples, transliteration, empty fallback). |
