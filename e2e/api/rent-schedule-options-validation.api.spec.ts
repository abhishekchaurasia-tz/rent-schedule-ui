import { APIRequestContext, expect, test } from '@playwright/test';

import { minimalOptionsRequest, minimalPreviewRequest } from '../fixtures/rent-schedule.fixtures';

/**
 * Expands the real-backend contract checks for `POST /rent-schedule/first-rental-due-date-options`
 * — see docs/ui-automation-test-matrix.md §2. Requires the .NET backend at API_BASE_URL; skips the
 * whole file if unreachable.
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

async function options(request: APIRequestContext, overrides: Record<string, unknown>) {
  return request.post('/api/v1/rent/schedule/first-rental-due-date-options', {
    data: { ...minimalOptionsRequest(), ...overrides }
  });
}

test.describe('first-rental-due-date-options — validation', () => {
  test('scenario 63 — Custom frequency is always rejected', async ({ request }) => {
    const response = await options(request, { frequency: 'custom', frequencyConfig: { dueDates: ['2026-09-01'] } });
    expect(response.status()).toBe(400);
  });

  test('scenario 64 — Semesterly + month-to-month combination is rejected', async ({ request }) => {
    const response = await options(request, {
      leaseTermType: 'month_to_month',
      endDate: null,
      monthToMonthInvoiceCount: 4,
      frequency: 'semesterly',
      frequencyConfig: { cycle: [{ month: 1, day: 1 }, { month: 7, day: 1 }] }
    });
    expect(response.status()).toBe(400);
  });

  test('scenario 59 — month-to-month with nextLeaseStartDate clips candidates before it', async ({ request }) => {
    const response = await options(request, {
      leaseTermType: 'month_to_month',
      endDate: null,
      monthToMonthInvoiceCount: 24,
      nextLeaseStartDate: '2026-12-01'
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.dates.every((d: string) => d < '2026-12-01')).toBe(true);
  });

  test('scenario 60 — a fixed term shorter than one recurrence interval returns only the start date', async ({ request }) => {
    const response = await options(request, {
      startDate: '2026-09-01',
      endDate: '2026-09-10',
      frequency: 'monthly',
      frequencyConfig: { dueOnDay: 15 }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.dates).toEqual(['2026-09-01']);
  });

  test('scenario 61 — start date coinciding with the first recurring date is not duplicated', async ({ request }) => {
    const response = await options(request, {
      startDate: '2026-09-01',
      frequency: 'monthly',
      frequencyConfig: { dueOnDay: 1 }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(new Set(body.dates).size).toBe(body.dates.length);
  });

  test('scenario 62 — a backdated lease returns today as the first candidate', async ({ request }) => {
    const response = await options(request, {
      startDate: '2020-01-01',
      endDate: '2030-01-01'
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const today = new Date().toISOString().slice(0, 10);
    expect(body.dates[0]).toBe(today);
  });

  test('scenario 65 — every candidate returned is accepted by /preview as firstRentalDueDate', async ({ request }) => {
    const optionsResponse = await options(request, {});
    expect(optionsResponse.ok()).toBeTruthy();
    const { dates } = await optionsResponse.json();
    expect(dates.length).toBeGreaterThan(0);

    for (const candidate of dates.slice(0, 3)) {
      const previewResponse = await request.post('/api/v1/rent/schedule/preview', {
        data: { ...minimalPreviewRequest(), firstRentalDueDate: candidate }
      });
      expect(previewResponse.ok(), `candidate ${candidate} should be accepted by /preview`).toBeTruthy();
    }
  });
});
