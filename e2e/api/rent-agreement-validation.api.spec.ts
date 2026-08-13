import { APIRequestContext, expect, test } from '@playwright/test';

import {
  minimalCreateAgreementRequest,
  minimalOneTimeCharge,
  minimalPreviewRequest,
  minimalRecurringCharge
} from '../fixtures/rent-schedule.fixtures';

/**
 * Real-backend contract checks for `POST /rent-agreements`, expanding on
 * `CreateRentAgreementEndpointTests.cs` from the BE test suite — see
 * docs/ui-automation-test-matrix.md §3. Requires the .NET backend at API_BASE_URL; skips the whole
 * file if unreachable.
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

const validRow = { scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 1000 };

async function createAgreement(request: APIRequestContext, overrides: Record<string, unknown>) {
  return request.post('/api/v1/rent/agreements', {
    data: { ...minimalCreateAgreementRequest([validRow]), ...overrides }
  });
}

test.describe('rent-agreement create — core fields', () => {
  test('scenario 66 — fullRent = 0 with no schedule rows saves successfully', async ({ request }) => {
    const response = await createAgreement(request, { fullRent: 0, scheduleRows: [] });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.scheduleRows).toEqual([]);
  });

  test('scenario 68 — fullRent > 0 with no schedule rows is rejected (422)', async ({ request }) => {
    const response = await createAgreement(request, { scheduleRows: [] });
    expect(response.status()).toBe(422);
  });

  test('scenario 69 — a schedule row with rent <= 0 is rejected', async ({ request }) => {
    const response = await createAgreement(request, { scheduleRows: [{ ...validRow, rent: 0 }] });
    expect(response.status()).toBe(422);
  });

  test('scenario 70 — endDate equal to startDate is rejected', async ({ request }) => {
    const response = await createAgreement(request, { endDate: minimalCreateAgreementRequest().startDate });
    expect(response.status()).toBe(422);
  });

  test('scenario 71 — firstRentalDueDate before startDate is rejected', async ({ request }) => {
    const response = await createAgreement(request, { firstRentalDueDate: '2026-08-01' });
    expect(response.status()).toBe(422);
  });

  test('scenario 72 — schedule rows inconsistent with the chosen frequency are persisted verbatim (no server recompute)', async ({
    request
  }) => {
    // frequencyConfig says dueOnDay=1 (monthly) but the submitted row is a Tuesday mid-month value —
    // the backend does not regenerate/validate rows against frequencyConfig (FR-002).
    const staleRow = { scheduledDate: '2026-09-17', dueDate: '2026-09-20', rent: 1000 };
    const response = await createAgreement(request, { scheduleRows: [staleRow] });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.scheduleRows[0]).toMatchObject({ scheduledDate: '2026-09-17', dueDate: '2026-09-20' });
  });

  test('scenario 73 — a missing required field returns 400, distinct from the 422 business-rule errors above', async ({
    request
  }) => {
    const { startDate: _omit, ...withoutStartDate } = minimalCreateAgreementRequest([validRow]);
    const response = await request.post('/api/v1/rent/agreements', { data: withoutStartDate });
    expect(response.status()).toBe(400);
  });

  test('spec v20 — isManualChanged is persisted per row and echoed back', async ({ request }) => {
    const response = await createAgreement(request, {
      scheduleRows: [
        { scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 800, isManualChanged: true },
        { scheduledDate: '2026-10-01', dueDate: '2026-10-05', rent: 1000, isManualChanged: false }
      ]
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.scheduleRows[0].isManualChanged).toBe(true);
    // Row 2 moved only its due date — the flag tracks the amount, so it stays false.
    expect(body.scheduleRows[1].isManualChanged).toBe(false);
  });

  test('spec v20 — isManualChanged is optional and defaults to false when omitted', async ({ request }) => {
    // validRow carries no isManualChanged at all — pre-v20 payloads must keep working.
    const response = await createAgreement(request, {});
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.scheduleRows[0].isManualChanged).toBe(false);
  });

  test('scenarios 97-99 — response echoes server-generated ids distinct from the request and 1:1 row count', async ({
    request
  }) => {
    const response = await createAgreement(request, {});
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.status).toBe('draft');
    expect(body.scheduleRows).toHaveLength(1);
    expect(body.scheduleRows[0].id).toBeTruthy();
  });
});

test.describe('rent-agreement create — deposit rules', () => {
  test('scenario 75 — deposit without a due date is rejected', async ({ request }) => {
    const response = await createAgreement(request, { deposit: 500, depositDueDate: null });
    expect(response.status()).toBe(422);
  });

  test('scenario 75 — deposit due date without a deposit amount is rejected', async ({ request }) => {
    const response = await createAgreement(request, { deposit: null, depositDueDate: '2026-09-15' });
    expect(response.status()).toBe(422);
  });

  test('scenario 76 — depositCollected=true with deposit=0 is rejected', async ({ request }) => {
    const response = await createAgreement(request, {
      deposit: 0,
      depositDueDate: '2026-09-15',
      depositCollected: true
    });
    expect(response.status()).toBe(422);
  });

  test('scenario 76 — depositCollected=true with no deposit fields at all is rejected', async ({ request }) => {
    const response = await createAgreement(request, { depositCollected: true });
    expect(response.status()).toBe(422);
  });

  test('scenario 77 — depositCollected=true with a positive deposit and due date saves successfully', async ({
    request
  }) => {
    const response = await createAgreement(request, {
      deposit: 500,
      depositDueDate: '2026-09-15',
      depositCollected: true
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.depositCollected).toBe(true);
  });

  test('scenario 78 — omitting depositCollected entirely defaults to false', async ({ request }) => {
    const { depositCollected: _omit, ...rest } = minimalCreateAgreementRequest([validRow]) as any;
    const response = await request.post('/api/v1/rent/agreements', { data: rest });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.depositCollected).toBe(false);
  });
});

test.describe('rent-agreement create — additional charges', () => {
  test('scenario 79 — one-time charge forbids frequency/startDate being set', async ({ request }) => {
    const response = await createAgreement(request, {
      additionalCharges: [minimalOneTimeCharge({ frequency: 'monthly', frequencyConfig: { dueOnDay: 1 } })]
    });
    expect(response.status()).toBe(422);
  });

  test('scenario 79 — one-time charge without a dueDate is rejected', async ({ request }) => {
    const response = await createAgreement(request, {
      additionalCharges: [minimalOneTimeCharge({ dueDate: null })]
    });
    expect(response.status()).toBe(422);
  });

  test('scenario 80 — recurring charge without frequencyConfig is rejected', async ({ request }) => {
    const response = await createAgreement(request, {
      additionalCharges: [minimalRecurringCharge({ frequencyConfig: null })]
    });
    expect(response.status()).toBe(422);
  });

  test('scenario 80 — recurring charge with both endDate and hasNoEndDate set is rejected', async ({ request }) => {
    const response = await createAgreement(request, {
      additionalCharges: [minimalRecurringCharge({ endDate: '2027-09-01', hasNoEndDate: true })]
    });
    expect(response.status()).toBe(422);
  });

  test('scenario 80 — recurring charge with neither endDate nor hasNoEndDate set is rejected', async ({ request }) => {
    const response = await createAgreement(request, {
      additionalCharges: [minimalRecurringCharge({ endDate: null, hasNoEndDate: false })]
    });
    expect(response.status()).toBe(422);
  });

  test('scenario 82/83 — item quantity or rate <= 0 is rejected', async ({ request }) => {
    const response = await createAgreement(request, {
      additionalCharges: [
        minimalOneTimeCharge({
          items: [{ lineItemId: null, newItemCategory: 'rent', itemType: 'Late Fee', description: 'x', quantity: 0, rate: 50, amount: 0 }]
        })
      ]
    });
    expect(response.status()).toBe(422);
  });

  test('scenario 84 — amount not equal to quantity * rate (off by 0.01) is rejected, no rounding tolerance', async ({
    request
  }) => {
    const response = await createAgreement(request, {
      additionalCharges: [
        minimalOneTimeCharge({
          items: [
            {
              lineItemId: null,
              newItemCategory: 'rent',
              itemType: 'Late Fee',
              description: 'x',
              quantity: 3,
              rate: 10,
              amount: 30.01
            }
          ]
        })
      ]
    });
    expect(response.status()).toBe(422);
  });

  test('scenario 88 — a charge with items resolving to mixed categories is rejected', async ({ request }) => {
    const response = await createAgreement(request, {
      additionalCharges: [
        minimalOneTimeCharge({
          items: [
            { lineItemId: null, newItemCategory: 'rent', itemType: 'Late Fee', description: 'rent item', quantity: 1, rate: 50, amount: 50 },
            {
              lineItemId: null,
              newItemCategory: 'deposit',
              itemType: 'Security Deposit',
              description: 'deposit item',
              quantity: 1,
              rate: 500,
              amount: 500
            }
          ]
        })
      ]
    });
    expect(response.status()).toBe(422);
  });

  test('scenario 89 — a recurring Deposit-category charge is allowed (post-v16 regression)', async ({ request }) => {
    const response = await createAgreement(request, {
      additionalCharges: [
        minimalRecurringCharge({
          items: [
            {
              lineItemId: null,
              newItemCategory: 'deposit',
              itemType: 'Security Deposit',
              description: 'recurring deposit',
              quantity: 1,
              rate: 100,
              amount: 100
            }
          ]
        })
      ]
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.additionalCharges[0].category).toBe('Deposit');
  });

  test('scenario 90 — a Deposit charge with attachedWithRentalInvoice=true is rejected (v18 rule)', async ({
    request
  }) => {
    const response = await createAgreement(request, {
      additionalCharges: [
        minimalOneTimeCharge({
          attachedWithRentalInvoice: true,
          items: [
            {
              lineItemId: null,
              newItemCategory: 'deposit',
              itemType: 'Security Deposit',
              description: 'deposit',
              quantity: 1,
              rate: 100,
              amount: 100
            }
          ]
        })
      ]
    });
    expect(response.status()).toBe(422);
  });

  test('scenario 91 — the same Deposit charge with attachedWithRentalInvoice=false is allowed', async ({ request }) => {
    const response = await createAgreement(request, {
      additionalCharges: [
        minimalOneTimeCharge({
          attachedWithRentalInvoice: false,
          items: [
            {
              lineItemId: null,
              newItemCategory: 'deposit',
              itemType: 'Security Deposit',
              description: 'deposit',
              quantity: 1,
              rate: 100,
              amount: 100
            }
          ]
        })
      ]
    });
    expect(response.status()).toBe(201);
  });

  test('scenario 92 — a Rent charge with attachedWithRentalInvoice=true is unaffected by the v18 rule', async ({
    request
  }) => {
    const response = await createAgreement(request, {
      additionalCharges: [minimalOneTimeCharge({ attachedWithRentalInvoice: true })]
    });
    expect(response.status()).toBe(201);
  });

  test('scenario 95 — a charge with zero items is rejected', async ({ request }) => {
    const response = await createAgreement(request, {
      additionalCharges: [minimalOneTimeCharge({ items: [] })]
    });
    expect(response.status()).toBe(422);
  });

  test('scenario 96 — negative alreadyPaid is rejected', async ({ request }) => {
    const response = await createAgreement(request, {
      additionalCharges: [minimalOneTimeCharge({ alreadyPaid: -1 })]
    });
    expect(response.status()).toBe(422);
  });

  test('a valid one-time Rent charge saves successfully alongside the base agreement', async ({ request }) => {
    const response = await createAgreement(request, {
      additionalCharges: [minimalOneTimeCharge()]
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.additionalCharges).toHaveLength(1);
    expect(body.additionalCharges[0].category).toBe('Rent');
  });
});
