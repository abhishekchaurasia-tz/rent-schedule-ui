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

/**
 * Parses a "YYYY-MM-DD" string into a local-time `Date` for a datepicker to bind to — the inverse
 * of {@link toIsoDate}.
 *
 * Deliberately avoids `new Date(value)`: that parses a bare date string as **UTC**, which then
 * renders as the previous day for anyone west of Greenwich. Splitting the parts and using the
 * `Date(year, month, day)` constructor keeps it local, matching how `toIsoDate` writes it back.
 */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}
