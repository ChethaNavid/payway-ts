/**
 * Trim utility function that only trims strings, passes through other types
 * @param value - The value to trim (string, null, undefined, or any other type)
 * @returns The trimmed string if input is string, otherwise returns the value as-is
 */
export function trim<T = string | null | undefined>(value: T): T {
  if (typeof value === 'string') return value.trim() as T;
  return value;
}

/**
 * Formats a date as PayWay's `yyyyMMddHHmmss` request timestamp
 *
 * Uses the **local** timezone, matching the behaviour this SDK has always had.
 * Note PayWay's docs describe this field as UTC - if your server timezone is
 * not the one your merchant account expects, that discrepancy is worth
 * confirming with ABA before deploying.
 *
 * @param date - The date to format
 * @returns 14-character timestamp, e.g. "20240310143000"
 */
export function formatRequestTime(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    String(date.getFullYear()).padStart(4, '0') +
    p(date.getMonth() + 1) +
    p(date.getDate()) +
    p(date.getHours()) +
    p(date.getMinutes()) +
    p(date.getSeconds())
  );
}
