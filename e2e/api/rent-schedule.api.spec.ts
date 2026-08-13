import { APIRequestContext, expect, test } from '@playwright/test';

/**
 * Hits the real .NET API directly (no browser, no mocks) to check the contract the UI relies on.
 * Requires the backend from the `innago-property-management` solution running at `API_BASE_URL`
 * (defaults to http://localhost:5169). Skips the whole file if it isn't reachable, rather than
 * failing the run — this suite is opt-in for local/CI runs that have the backend up.
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

function minimalPreviewRequest() {
  return {
    startDate: '2026-09-01',
    endDate: '2027-09-01',
    leaseTermType: 'fixed',
    rent: 1000,
    frequency: 'monthly',
    firstRentalDueDate: '2026-09-01',
    frequencyConfig: { dueOnDay: 1 }
  };
}

test.describe('rent-schedule API', () => {
  test('POST /preview returns a schedule for a monthly lease', async ({ request }) => {
    const response = await request.post('/api/v1/rent/schedule/preview', {
      data: minimalPreviewRequest()
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.totalInvoices).toBe(body.rows.length);
    expect(body.rows.length).toBeGreaterThanOrEqual(12);
    expect(body.rows[0]).toMatchObject({ scheduledDate: '2026-09-01', dueDate: '2026-09-01' });
  });

  test('POST /preview rejects an end date before the start date', async ({ request }) => {
    const response = await request.post('/api/v1/rent/schedule/preview', {
      data: { ...minimalPreviewRequest(), endDate: '2026-08-01' }
    });

    expect(response.status()).toBe(400);
    const problem = await response.json();
    expect(problem.detail).toBeTruthy();
  });

  test('POST /first-rental-due-date-options returns candidate dates', async ({ request }) => {
    const { firstRentalDueDate, ...rest } = minimalPreviewRequest();
    const response = await request.post('/api/v1/rent/schedule/first-rental-due-date-options', {
      data: rest
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body.dates)).toBe(true);
    expect(body.dates.length).toBeGreaterThan(0);
  });
});

test.describe('rent-agreements API', () => {
  test('POST /rent-agreements creates a draft agreement from a previewed schedule', async ({ request }) => {
    const previewResponse = await request.post('/api/v1/rent/schedule/preview', {
      data: minimalPreviewRequest()
    });
    expect(previewResponse.ok()).toBeTruthy();
    const preview = await previewResponse.json();

    const createResponse = await request.post('/api/v1/rent/agreements', {
      data: {
        propertyUnitId: crypto.randomUUID(),
        propertyId: crypto.randomUUID(),
        propertyOwnerId: crypto.randomUUID(),
        ...minimalPreviewRequest(),
        fullRent: 1000,
        scheduleRows: preview.rows,
        additionalCharges: []
      }
    });

    expect(createResponse.ok()).toBeTruthy();
    const created = await createResponse.json();
    expect(created.agreementId).toBeTruthy();
    expect(created.scheduleRows).toHaveLength(preview.rows.length);
  });
});
