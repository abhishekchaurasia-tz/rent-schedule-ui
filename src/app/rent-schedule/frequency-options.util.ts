import { LeaseTermType, RentFrequency } from './rent-schedule.models';

/** One entry of a frequency picker: the wire value and the words shown for it. */
export interface FrequencyOption {
  value: RentFrequency;
  label: string;
}

/**
 * Every rent frequency the backend accepts, in the order the pickers show them.
 *
 * Defined once and shared, because three screens offer this choice — the lease form, the schedule
 * preview, and the additional-fee panel — and three copies of a list is three places for one of them
 * to fall out of step with the rules below.
 */
export const RENT_FREQUENCIES: readonly FrequencyOption[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'bi_monthly', label: 'Bi-Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi_weekly', label: 'Bi-Weekly' },
  { value: 'semesterly', label: 'Semi-Annual' },
  { value: 'custom', label: 'Custom' }
];

/**
 * The frequencies offerable for `leaseTermType`.
 *
 * **Semi-Annual is dropped for a month-to-month lease.** The backend refuses that pair outright —
 * `PreviewRentScheduleQueryValidator` and `FirstRentalDueDateOptionsQueryValidator` both answer
 * *"Semi-annual frequency is not supported for month-to-month leases."* — so offering it could only
 * ever end in a `400` the user had no way to see coming. A six-month cadence on a lease with no end
 * date has no window to lay cycles out in, which is the reason behind the rule.
 *
 * **Custom is deliberately still offered**, because the backend allows it: the rule above names
 * Semesterly and nothing else. Removing it here would take away a combination that works.
 */
export function frequenciesFor(leaseTermType: LeaseTermType): readonly FrequencyOption[] {
  return leaseTermType === 'month_to_month'
    ? RENT_FREQUENCIES.filter((option) => option.value !== 'semesterly')
    : RENT_FREQUENCIES;
}

/**
 * Whether `frequency` may be used with `leaseTermType`.
 *
 * The same rule as {@link frequenciesFor}, asked the other way round — a picker filters its options
 * with the first, and a form that already holds a value checks it with this one before the term type
 * changes underneath it.
 */
export function isFrequencyAllowed(frequency: RentFrequency, leaseTermType: LeaseTermType): boolean {
  return frequenciesFor(leaseTermType).some((option) => option.value === frequency);
}
