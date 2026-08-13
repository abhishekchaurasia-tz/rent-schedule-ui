import { toIsoDate } from '../shared/date.util';
import { FrequencyConfig, RentFrequency } from './rent-schedule.models';

/**
 * Builds the frequency-specific `frequencyConfig` shape from a reactive form's raw value, matching
 * whichever `RecurrenceInput` variant the backend expects for `value.frequency`.
 */
export function buildFrequencyConfig(value: any): FrequencyConfig {
  switch (value.frequency as RentFrequency) {
    case 'monthly':
      return { dueOnDay: Number(value.dueOnDay) };
    case 'bi_monthly':
      return { dueOnDays: value.dueOnDays.map((d: string) => Number(d)) };
    case 'weekly':
    case 'bi_weekly':
      return { dayOfWeek: Number(value.dayOfWeek) };
    case 'semesterly':
      return {
        cycle: value.cycle.map((c: any) => ({ month: Number(c.month), day: Number(c.day) }))
      };
    case 'custom':
      return { dueDates: value.dueDates.map(toIsoDate).filter((d: string | null): d is string => !!d) };
    default:
      return {};
  }
}

/**
 * Maps a persisted `frequencyConfig` back onto the form's per-frequency controls — the inverse of
 * {@link buildFrequencyConfig}, used when loading a saved agreement for editing.
 *
 * Only the keys the config actually carries are returned, so `patchValue` leaves the controls for
 * other frequencies at their defaults rather than blanking them.
 */
export function frequencyConfigToFormValue(config: FrequencyConfig | null | undefined): Record<string, unknown> {
  if (!config) {
    return {};
  }

  const value: Record<string, unknown> = {};

  if (config.dueOnDay !== undefined) {
    value['dueOnDay'] = config.dueOnDay;
  }
  if (config.dueOnDays?.length) {
    value['dueOnDays'] = config.dueOnDays;
  }
  if (config.dayOfWeek !== undefined) {
    value['dayOfWeek'] = config.dayOfWeek;
  }
  if (config.cycle?.length) {
    value['cycle'] = config.cycle.map((entry) => ({ month: entry.month, day: entry.day }));
  }
  if (config.dueDates?.length) {
    value['dueDates'] = config.dueDates;
  }

  return value;
}

/**
 * Formats a day-of-month as an ordinal string, e.g. 1 -> "1st", 22 -> "22nd".
 */
export function ordinal(day: number): string {
  const remainder100 = day % 100;
  if (remainder100 >= 11 && remainder100 <= 13) {
    return `${day}th`;
  }
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}
