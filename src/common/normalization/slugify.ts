/**
 * slugify.ts
 *
 * Slugify a ServiceNow display value into a filesystem-safe folder token (spec "Normalization",
 * OS-11). Diacritics are transliterated to ASCII; an empty result falls back to the sys_id.
 */

/**
 * Transliterate to ASCII, lowercase, replace every non-`[0-9a-z]` run with `-`, and trim `-`
 * so the slug starts and ends with `[0-9a-z]`. When the result is empty (the display value was
 * all punctuation), return the first 8 chars of `sysId` (OS-11).
 *
 * @param value Display value from ServiceNow (e.g. `My Record - Name`).
 * @param sysId The record's sys_id, used as the empty-slug fallback.
 * @returns A slug such as `my-record-name`, or the first 8 chars of `sysId`.
 */
export function slugifyDisplayValue(value: string, sysId: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? sysId.slice(0, 8) : slug;
}
