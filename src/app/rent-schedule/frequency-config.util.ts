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
