/**
 * @file encoded-query.builder.ts
 * Pure builders for ServiceNow encoded-query fragments and URL splitting. Encodes the API facts
 * the spec pins down: gs.dateGenerate date filters (A2), the IN operator (A7), and the 1800-char
 * URL cap (OS-25).
 */

/**
 * Build the `sys_updated_on>` comparison value from a stored ServiceNow timestamp.
 *
 * Deliberately NOT wrapped in `javascript:gs.dateGenerate(...)`: per ServiceNow's own docs,
 * `GlideSystem.dateGenerate()` interprets its arguments in the calling user's SESSION time
 * zone and converts them to UTC. `sys_updated_on` values returned by the Table API are
 * already UTC (aify never sets `sysparm_display_value`), so wrapping an already-UTC
 * timestamp in `dateGenerate()` re-interprets it as session-local time, shifting the
 * incremental "changed since" threshold by the session's UTC offset — silently dropping any
 * record updated within that skew window from every subsequent pull. A plain literal value
 * compares directly against the stored UTC `sys_updated_on`, with no timezone conversion.
 *
 * @param sysTimestamp A `sys_updated_on`-style "YYYY-MM-DD HH:MM:SS" UTC timestamp string.
 * @returns The trimmed timestamp, ready to use as an encoded-query comparison value.
 */
export function dateGenerate(sysTimestamp: string): string {
  return sysTimestamp.trim();
}

/**
 * Build a ServiceNow `IN` clause `${field}IN${values.join(',')}` (A7). No surrounding spaces —
 * the caller is responsible for splitting when the whole URL would exceed the length cap.
 *
 * @param field Column to filter (e.g. `sys_class_name`).
 * @param values Values to match.
 * @returns e.g. `sys_class_nameINa,b,c`.
 */
export function inClause(field: string, values: string[]): string {
  return `${field}IN${values.join(',')}`;
}

/**
 * Split a large IN filter across as few request URLs as possible so no URL exceeds `limit`
 * characters (OS-25). Values are packed greedily; a single value that already exceeds the cap
 * still gets its own URL (it cannot be split further).
 *
 * @param baseUrl Everything up to (and including) the point where the IN clause is appended.
 * @param field Column for the IN clause.
 * @param values Values to distribute across URLs.
 * @param limit Max characters per URL (default 1800).
 */
export function splitByUrlLimit(
  baseUrl: string,
  field: string,
  values: string[],
  limit = 1800,
): string[] {
  const build = (chunk: string[]): string => `${baseUrl}${inClause(field, chunk)}`;
  const urls: string[] = [];
  let current: string[] = [];
  for (const value of values) {
    const candidate = [...current, value];
    if (current.length > 0 && build(candidate).length > limit) {
      urls.push(build(current));
      current = [value];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) {
    urls.push(build(current));
  }
  return urls;
}
