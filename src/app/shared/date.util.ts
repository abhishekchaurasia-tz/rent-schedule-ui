/**
 * Formats a datepicker value as a "YYYY-MM-DD" string in local time (avoids the UTC-shift bug of
 * `Date#toISOString`). Passes strings through unchanged and normalizes empty values to `null`.
 */
export function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
