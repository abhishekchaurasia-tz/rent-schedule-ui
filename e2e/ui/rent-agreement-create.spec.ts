import { expect, test } from '@playwright/test';

/**
 * Drives the "Add Lease" flow end to end through the UI. The backend is mocked via `page.route` so
 * this suite is deterministic and doesn't require the .NET API to be running — see
 * `e2e/api/rent-schedule.api.spec.ts` for the real-backend contract checks. There is no "Generate
 * Preview" button — the schedule auto-populates ~300ms after the last edit once the required
 * fields are filled, so tests just wait on the resulting banner/table rather than clicking one.
 */
test.describe('Add Lease — rent agreement create', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/rent-schedule/first-rental-due-date-options', async (route) => {
      await route.fulfill({
        json: { dates: ['2026-09-01', '2026-10-01', '2026-11-01'] }
      });
    });

    await page.goto('/rent-agreements/create');
  });

  test('fills the lease form, generates a preview, and saves the agreement', async ({ page }) => {
    await page.route('**/api/v1/rent-schedule/preview', async (route) => {
      await route.fulfill({
        json: {
          rows: [
            { scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 100 },
            { scheduledDate: '2026-10-01', dueDate: '2026-10-01', rent: 100 }
          ],
          totalInvoices: 2,
          totalAmount: 200
        }
      });
    });

    await page.route('**/api/v1/rent-agreements', async (route) => {
      const body = route.request().postDataJSON();
      expect(body.startDate).toBe('2026-08-01');
      expect(body.fullRent).toBe(100);
      expect(body.frequency).toBe('monthly');

      await route.fulfill({
        status: 201,
        json: {
          agreementId: 'agreement-123',
          status: 'Draft',
          depositCollected: false,
          scheduleRows: [],
          additionalCharges: []
        }
      });
    });

    await page.getByLabel('Start Date').fill('08/01/2026');
    await page.keyboard.press('Escape');

    await expect(page.getByLabel('End Date')).toHaveValue('8/1/2027');

    await page
      .getByLabel('On which date should the first rental invoice be due?')
      .selectOption('2026-09-01');

    await expect(page.getByText('2 payments generated — total 200.00')).toBeVisible();
    await expect(page.getByRole('cell', { name: '2026-09-01' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Save Rent Agreement' }).click();

    await expect(page.getByText('Saved as agreement')).toBeVisible();
    await expect(page.getByText('agreement-123')).toBeVisible();
  });

  test('opens the calendar when the date field itself is clicked', async ({ page }) => {
    await page.getByLabel('Start Date').click();
    await expect(page.locator('mat-calendar')).toBeVisible();
  });

  test('surfaces a preview error from the API', async ({ page }) => {
    await page.route('**/api/v1/rent-schedule/preview', async (route) => {
      await route.fulfill({
        status: 400,
        json: { title: 'Bad Request', status: 400, detail: 'Start date must be in the future.' }
      });
    });

    await page.getByLabel('Start Date').fill('08/01/2026');
    await page.keyboard.press('Escape');

    await page
      .getByLabel('On which date should the first rental invoice be due?')
      .selectOption('2026-09-01');

    await expect(page.getByText('Start date must be in the future.')).toBeVisible();
  });

  test('switching to Custom frequency swaps the due-date select for date pickers', async ({ page }) => {
    await page.getByLabel('Payment Frequency').selectOption('custom');

    await expect(page.locator('.custom-dates .date-field input')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add Date' })).toBeVisible();
  });
});
