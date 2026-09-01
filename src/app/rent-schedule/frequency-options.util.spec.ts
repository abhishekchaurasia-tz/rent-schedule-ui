import { RENT_FREQUENCIES, frequenciesFor, isFrequencyAllowed } from './frequency-options.util';

describe('frequency options', () => {
  it('offers every frequency for a fixed-term lease', () => {
    expect(frequenciesFor('fixed').map((option) => option.value)).toEqual([
      'monthly',
      'bi_monthly',
      'weekly',
      'bi_weekly',
      'semesterly',
      'custom'
    ]);
  });

  it('drops Semi-Annual for a month-to-month lease, and only Semi-Annual', () => {
    expect(frequenciesFor('month_to_month').map((option) => option.value)).toEqual([
      'monthly',
      'bi_monthly',
      'weekly',
      'bi_weekly',
      'custom'
    ]);
  });

  it('keeps Custom for a month-to-month lease, because the backend allows it', () => {
    // The validator names Semesterly and nothing else; removing Custom here would take away a
    // combination that works.
    expect(isFrequencyAllowed('custom', 'month_to_month')).toBeTrue();
  });

  it('answers the same rule from the other direction', () => {
    expect(isFrequencyAllowed('semesterly', 'fixed')).toBeTrue();
    expect(isFrequencyAllowed('semesterly', 'month_to_month')).toBeFalse();
    expect(isFrequencyAllowed('monthly', 'month_to_month')).toBeTrue();
  });

  it('does not mutate the shared list when narrowing it', () => {
    frequenciesFor('month_to_month');

    expect(RENT_FREQUENCIES.length).toBe(6);
    expect(RENT_FREQUENCIES.some((option) => option.value === 'semesterly')).toBeTrue();
  });
});
