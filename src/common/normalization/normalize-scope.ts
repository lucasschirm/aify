/**
 * normalize-scope.ts
 *
 * Canonical scope-name normalization (spec "Normalization", resolves C4/OS decisions).
 * Turns a ServiceNow scope/application name into a filesystem-safe folder token.
 */

/**
 * Replace every run of `[@/.\s]+` with a single `_`, collapse repeated `_`,
 * and trim leading/trailing `_`.
 *
 * @param name Raw scope or application name (e.g. `@myscope/name`).
 * @returns Normalized token (e.g. `myscope_name`).
 */
export function normalizeScope(name: string): string {
  return name
    .replace(/[@/.\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}
