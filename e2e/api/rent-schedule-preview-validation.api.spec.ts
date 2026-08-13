import { APIRequestContext, expect, test } from '@playwright/test';

import { minimalPreviewRequest } from '../fixtures/rent-schedule.fixtures';

/**
 * Expands the real-backend contract checks in `rent-schedule.api.spec.ts` to cover the fuller
 * validation/recurrence matrix documented in docs/ui-automation-test-matrix.md §1. Requires the .NET
 * backend running at API_BASE_URL; skips (rather than fails) the whole file if it isn't reachable.
 */
let backendReachable = true;

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  try {
    await request.post('/api/v1/rent/schedule/preview', {
      data: minimalPreviewRequest(),
      failOnStatusCode: false,
      timeout: 3000
    });
  } catch {
    backendReachable = false;
  }
});

test.beforeEach(() => {
  test.skip(!backendReachable, 'Backend API is not reachable at API_BASE_URL — skipping.');
});

async function preview(request: APIRequestContext, overrides: Record<string, unknown>) {
  return request.post('/api/v1/rent/schedule/preview', {
    data: { ...minimalPreviewRequest(), ...overrides }
  });
}

test.describe('rent-schedule preview — field validation', () => {
  test('rejects rent = 0', async ({ request }) => {
    const response = await preview(request, { rent: 0 });
    expect(response.status()).toBe(400);
  });

  test('rejects negative rent', async ({ request }) => {
    const response = await preview(request, { rent: -100 });
    expect(response.status()).toBe(400);
  });

  test('rejects a blank start date', async ({ request }) => {
    const response = await preview(request, { startDate: '' });
    expect(response.status()).toBe(400);
  });

  test('rejects firstRentalDueDate before startDate', async ({ request }) => {
    const response = await preview(request, { firstRentalDueDate: '2026-08-01' });
    expect(response.status()).toBe(400);
  });

  test('accepts firstRentalDueDate equal to startDate (boundary)', async ({ request }) => {
    const response = await preview(request, { firstRentalDueDate: '2026-09-01' });
    expect(response.ok()).toBeTruthy();
  });
});

test.describe('rent-schedule preview — fixed-term / month-to-month branches', () => {
  test('fixed term rejects endDate equal to startDate', async ({ request }) => {
    const response = await preview(request, { endDate: '2026-09-01' });
    expect(response.status()).toBe(400);
  });

  test('fixed term accepts endDate one day after startDate (boundary)', async ({ request }) => {
    const response = await preview(request, { endDate: '2026-09-02' });
    expect(response.ok()).toBeTruthy();
  });

  test('fixed term rejects a missing endDate', async ({ request }) => {
    const response = await preview(request, { endDate: null });
    expect(response.status()).toBe(400);
  });

  test('month-to-month rejects endDate present alongside it', async ({ request }) => {
    const response = await preview(request, {
      leaseTermType: 'month_to_month',
      endDate: '2027-09-01',
      monthToMonthInvoiceCount: 12
    });
    expect(response.status()).toBe(400);
  });

  test('month-to-month rejects a missing/zero invoice count', async ({ request }) => {
    const response = await preview(request, {
      leaseTermType: 'month_to_month',
      endDate: null,
      monthToMonthInvoiceCount: 0
    });
    expect(response.status()).toBe(400);
  });

  test('month-to-month with a valid invoice count returns exactly that many rows', async ({ request }) => {
    const response = await preview(request, {
      leaseTermType: 'month_to_month',
      endDate: null,
      monthToMonthInvoiceCount: 6
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.rows).toHaveLength(6);
  });

  test('month-to-month rejects nextLeaseStartDate not after firstRentalDueDate', async ({ request }) => {
    const response = await preview(request, {
      leaseTermType: 'month_to_month',
      endDate: null,
      monthToMonthInvoiceCount: 12,
      nextLeaseStartDate: '2026-09-01'
    });
    expect(response.status()).toBe(400);
  });

  test('semesterly + month-to-month combination is always rejected', async ({ request }) => {
    const response = await preview(request, {
      leaseTermType: 'month_to_month',
      endDate: null,
      monthToMonthInvoiceCount: 4,
      frequency: 'semesterly',
      frequencyConfig: { cycle: [{ month: 1, day: 1 }, { month: 7, day: 1 }] }
    });
    expect(response.status()).toBe(400);
  });
});

test.describe('rent-schedule preview — per-frequency recurrence rules', () => {
  test('Monthly: dueOnDay = 0 is rejected', async ({ request }) => {
    const response = await preview(request, { frequencyConfig: { dueOnDay: 0 } });
    expect(response.status()).toBe(400);
  });

  test('Monthly: dueOnDay = 32 is rejected', async ({ request }) => {
    const response = await preview(request, { frequencyConfig: { dueOnDay: 32 } });
    expect(response.status()).toBe(400);
  });

  test('Monthly: dueOnDay = 31 clamps to the last day in a 30-day month', async ({ request }) => {
    const response = await preview(request, {
      startDate: '2026-04-01',
      firstRentalDueDate: '2026-04-01',
      endDate: '2026-06-01',
      frequencyConfig: { dueOnDay: 31 }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.rows.some((r: any) => r.scheduledDate === '2026-04-30')).toBe(true);
  });

  test('Monthly: dueOnDay = 31 clamps to Feb 28 in a non-leap year', async ({ request }) => {
    const response = await preview(request, {
      startDate: '2027-01-01',
      firstRentalDueDate: '2027-01-01',
      endDate: '2027-03-05',
      frequencyConfig: { dueOnDay: 31 }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.rows.some((r: any) => r.scheduledDate === '2027-02-28')).toBe(true);
  });

  test('Monthly: dueOnDay = 31 clamps to Feb 29 in a leap year', async ({ request }) => {
    const response = await preview(request, {
      startDate: '2028-01-01',
      firstRentalDueDate: '2028-01-01',
      endDate: '2028-03-05',
      frequencyConfig: { dueOnDay: 31 }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.rows.some((r: any) => r.scheduledDate === '2028-02-29')).toBe(true);
  });

  test('Monthly: anchor day differs from dueOnDay — row 1 is the anchor, row 2 aligns next month', async ({ request }) => {
    const response = await preview(request, {
      startDate: '2026-11-01',
      firstRentalDueDate: '2026-11-25',
      endDate: '2027-02-01',
      frequencyConfig: { dueOnDay: 1 }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.rows[0].scheduledDate).toBe('2026-11-25');
    expect(body.rows[1].scheduledDate).toBe('2026-12-01');
  });

  test('BiMonthly: duplicate due days are rejected', async ({ request }) => {
    const response = await preview(request, {
      frequency: 'bi_monthly',
      frequencyConfig: { dueOnDays: [15, 15] }
    });
    expect(response.status()).toBe(400);
  });

  test('BiMonthly: an out-of-range due day is rejected', async ({ request }) => {
    const response = await preview(request, {
      frequency: 'bi_monthly',
      frequencyConfig: { dueOnDays: [1, 32] }
    });
    expect(response.status()).toBe(400);
  });

  test('BiMonthly: two distinct days in the same month produce two ascending rows', async ({ request }) => {
    const response = await preview(request, {
      startDate: '2026-09-01',
      firstRentalDueDate: '2026-09-01',
      endDate: '2026-10-01',
      frequency: 'bi_monthly',
      frequencyConfig: { dueOnDays: [20, 5] }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.rows[0].scheduledDate).toBe('2026-09-05');
    expect(body.rows[1].scheduledDate).toBe('2026-09-20');
  });

  test('Weekly: start date not on the target weekday advances to the first occurrence', async ({ request }) => {
    // 2026-09-01 is a Tuesday; target Friday (5) should first land on 2026-09-04.
    const response = await preview(request, {
      startDate: '2026-09-01',
      firstRentalDueDate: '2026-09-01',
      endDate: '2026-09-30',
      frequency: 'weekly',
      frequencyConfig: { dayOfWeek: 5 }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.rows[0].scheduledDate).toBe('2026-09-04');
  });

  test('Semesterly: cycle requires exactly two entries', async ({ request }) => {
    const response = await preview(request, {
      frequency: 'semesterly',
      frequencyConfig: { cycle: [{ month: 1, day: 1 }] }
    });
    expect(response.status()).toBe(400);
  });

  test('Semesterly: invalid calendar date in cycle (Feb 30) is rejected', async ({ request }) => {
    const response = await preview(request, {
      frequency: 'semesterly',
      frequencyConfig: {
        cycle: [
          { month: 2, day: 30 },
          { month: 8, day: 1 }
        ]
      }
    });
    expect(response.status()).toBe(400);
  });

  test('Custom: empty due-dates list is rejected', async ({ request }) => {
    const response = await preview(request, { frequency: 'custom', frequencyConfig: { dueDates: [] } });
    expect(response.status()).toBe(400);
  });

  test('Custom: non-increasing (duplicate) due dates are rejected', async ({ request }) => {
    const response = await preview(request, {
      frequency: 'custom',
      frequencyConfig: { dueDates: ['2026-09-01', '2026-09-01'] }
    });
    expect(response.status()).toBe(400);
  });

  test('Custom: descending due dates are rejected', async ({ request }) => {
    const response = await preview(request, {
      frequency: 'custom',
      frequencyConfig: { dueDates: ['2026-10-01', '2026-09-01'] }
    });
    expect(response.status()).toBe(400);
  });

  test('Custom: valid ascending dates are returned exactly as given', async ({ request }) => {
    const response = await preview(request, {
      frequency: 'custom',
      firstRentalDueDate: '2026-09-01',
      frequencyConfig: { dueDates: ['2026-09-01', '2026-10-15'] }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.rows.map((r: any) => r.scheduledDate)).toEqual(['2026-09-01', '2026-10-15']);
  });

  test('Custom: a due date outside [startDate, endDate] — documents actual (not spec) behavior', async ({ request }) => {
    // docs/rent-schedule-preview-api.md §4.4 says this should be rejected; the read BE code has no
    // such bound check (see docs/ui-automation-test-matrix.md §1.4 item 39). This test intentionally
    // asserts the *current* behavior so a future BE fix shows up as a deliberate test update, not a
    // silently-passing gap.
    const response = await preview(request, {
      frequency: 'custom',
      endDate: '2026-09-30',
      frequencyConfig: { dueDates: ['2026-12-25'] }
    });
    expect(response.status()).toBe(200);
  });
});

test.describe('rent-schedule preview — generation bounds & backdated leases', () => {
  test('rejects a request that would generate 1000+ rows', async ({ request }) => {
    const response = await preview(request, {
      startDate: '1990-01-01',
      firstRentalDueDate: '1990-01-01',
      endDate: '2100-01-01',
      frequency: 'weekly',
      frequencyConfig: { dayOfWeek: 1 }
    });
    expect(response.status()).toBe(400);
  });

  test('a fully backdated lease (start and first-due both in the past) still returns 200', async ({ request }) => {
    const response = await preview(request, {
      startDate: '2020-01-01',
      firstRentalDueDate: '2020-01-01',
      endDate: '2030-01-01'
    });
    expect(response.ok()).toBeTruthy();
  });
});

test.describe('rent-schedule preview — overrides', () => {
  test('override with a scheduledDate matching a generated row updates that row only', async ({ request }) => {
    const response = await preview(request, {
      overrides: [{ scheduledDate: '2026-10-01', rent: 1500 }]
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const overridden = body.rows.find((r: any) => r.scheduledDate === '2026-10-01');
    const untouched = body.rows.find((r: any) => r.scheduledDate === '2026-11-01');
    expect(overridden.rent).toBe(1500);
    expect(untouched.rent).toBe(1000);
  });

  test('override with a scheduledDate not in the generated set is rejected', async ({ request }) => {
    const response = await preview(request, {
      overrides: [{ scheduledDate: '2026-09-15', rent: 1500 }]
    });
    expect(response.status()).toBe(400);
  });

  test('override with rent <= 0 is rejected', async ({ request }) => {
    const response = await preview(request, {
      overrides: [{ scheduledDate: '2026-10-01', rent: 0 }]
    });
    expect(response.status()).toBe(400);
  });
});
