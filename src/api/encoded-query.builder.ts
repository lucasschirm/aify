/**
 * @file encoded-query.builder.ts
 * Pure builders for ServiceNow encoded-query fragments and URL splitting. Encodes the API facts
 * the spec pins down: gs.dateGenerate date filters (A2), the IN operator (A7), and the 1800-char
 * URL cap (OS-25).
 */

/**
 * Build a `javascript:gs.dateGenerate('YYYY-MM-DD','HH:MM:SS')` clause from a ServiceNow
 * `YYYY-MM-DD HH:MM:SS` timestamp (A2).
 *
 * @param sysTimestamp A `sys_updated_on`-style timestamp string.
 * @returns The `javascript:gs.dateGenerate(...)` encoded-query value.
 */
export function dateGenerate(sysTimestamp: string): string {
  const [date, time] = sysTimestamp.trim().split(/\s+/);
  return `javascript:gs.dateGenerate('${date}','${time}')`;
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
