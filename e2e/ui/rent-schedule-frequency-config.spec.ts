import { expect, test } from '@playwright/test';

import { RentAgreementCreatePage } from '../pages/rent-agreement-create.page';

/**
 * Confirms each frequency's config UI (`rent-agreement-create.component.html`'s `@if (frequency ===
 * ...)` blocks) actually builds the `frequencyConfig` shape `buildFrequencyConfig` sends to
 * `POST /rent-schedule/preview` — see docs/ui-automation-test-matrix.md §1.4. Backend is mocked via
 * `page.route` so these run without the .NET API; the equivalent real-backend acceptance/rejection
 * of each shape is covered in `e2e/api/rent-schedule-preview-validation.api.spec.ts`.
 */
test.describe('rent-schedule create — frequency config wiring', () => {
  let previewRequestBody: any = null;

  test.beforeEach(async ({ page }) => {
    previewRequestBody = null;

    await page.route('**/api/v1/rent-schedule/first-rental-due-date-options', async (route) => {
      await route.fulfill({
        json: { dates: ['2026-09-01', '2026-10-01', '2026-11-01'] }
      });
    });

    await page.route('**/api/v1/rent-schedule/preview', async (route) => {
      previewRequestBody = route.request().postDataJSON();
      await route.fulfill({
        json: { rows: [{ scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 100 }], totalInvoices: 1, totalAmount: 100 }
      });
    });

    await page.goto('/rent-agreements/create');
  });

  test('Monthly — sends { dueOnDay }', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    await form.setStartDate('09/01/2026');
    await form.setFrequency('monthly');
    await form.setMonthlyDueOnDay(15);
    await form.selectFirstRentalDueDate('2026-09-01');
    await form.generatePreview();

    await expect.poll(() => previewRequestBody?.frequencyConfig).toEqual({ dueOnDay: 15 });
  });

  test('Bi-Monthly — sends { dueOnDays } in the two selected days', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    await form.setStartDate('09/01/2026');
    await form.setFrequency('bi_monthly');
    await form.setBiMonthlyDueOnDays([5, 20]);
    await form.selectFirstRentalDueDate('2026-09-01');
    await form.generatePreview();

    await expect.poll(() => previewRequestBody?.frequencyConfig).toEqual({ dueOnDays: [5, 20] });
  });

  test('Weekly — sends { dayOfWeek }', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    await form.setStartDate('09/01/2026');
    await form.setFrequency('weekly');
    await form.setDayOfWeek(3);
    await form.selectFirstRentalDueDate('2026-09-01');
    await form.generatePreview();

    await expect.poll(() => previewRequestBody?.frequencyConfig).toEqual({ dayOfWeek: 3 });
  });

  test('Bi-Weekly — sends { dayOfWeek } via the same weekday selector as Weekly', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    await form.setStartDate('09/01/2026');
    await form.setFrequency('bi_weekly');
    await form.setDayOfWeek(5);
    await form.selectFirstRentalDueDate('2026-09-01');
    await form.generatePreview();

    await expect.poll(() => previewRequestBody?.frequencyConfig).toEqual({ dayOfWeek: 5 });
  });

  test('Semesterly — sends { cycle } with both month/day pairs', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    await form.setStartDate('09/01/2026');
    await form.setFrequency('semesterly');
    await form.setSemesterlyCycle([
      { month: 3, day: 10 },
      { month: 9, day: 10 }
    ]);
    await form.selectFirstRentalDueDate('2026-09-01');
    await form.generatePreview();

    await expect
      .poll(() => previewRequestBody?.frequencyConfig)
      .toEqual({
        cycle: [
          { month: 3, day: 10 },
          { month: 9, day: 10 }
        ]
      });
  });

  test('Custom — replaces the due-date select with date pickers and sends { dueDates }', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    await form.setStartDate('09/01/2026');
    await form.setFrequency('custom');

    // Scenario 63: Custom has no candidate-list concept — the first-rental-due-date field must be a
    // date picker, not the API-backed dropdown, and no options call should be needed to populate it.
    await expect(page.locator('.first-due-label .date-field input')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add Date' })).toBeVisible();

    await form.addCustomDueDate('09/05/2026', 0);
    await form.setFirstRentalDueDateCustom('09/05/2026');
    await form.generatePreview();

    await expect.poll(() => previewRequestBody?.frequencyConfig).toEqual({ dueDates: ['2026-09-05'] });
  });

  test('Custom — "+ Add Date" appends an additional date picker (scenario 36 support)', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    await form.setFrequency('custom');

    await expect(page.locator('.custom-dates .date-field input')).toHaveCount(1);
    await page.getByRole('button', { name: '+ Add Date' }).click();
    await expect(page.locator('.custom-dates .date-field input')).toHaveCount(2);
  });
});

test.describe('rent-schedule create — lease term type field visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/rent-schedule/first-rental-due-date-options', async (route) => {
      await route.fulfill({ json: { dates: [] } });
    });
    await page.goto('/rent-agreements/create');
  });

  test('Fixed term shows End Date and hides month-to-month-only fields', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    await form.setLeaseTermType('fixed');

    await expect(page.getByLabel('End Date')).toBeVisible();
    await expect(page.getByLabel('Number of Payments to Preview')).toHaveCount(0);
    await expect(page.getByLabel('Next Lease Start Date (optional)')).toHaveCount(0);
  });

  test('Month-to-Month hides End Date and shows invoice count + next-lease-start fields', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    await form.setLeaseTermType('month_to_month');

    await expect(page.getByLabel('End Date')).toHaveCount(0);
    await expect(page.getByLabel('Number of Payments to Preview')).toBeVisible();
    await expect(page.getByLabel('Next Lease Start Date (optional)')).toBeVisible();
  });
});

test.describe('rent-schedule create — deposit client-side guard', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/rent-schedule/first-rental-due-date-options', async (route) => {
      await route.fulfill({ json: { dates: ['2026-09-01'] } });
    });
    await page.route('**/api/v1/rent-schedule/preview', async (route) => {
      await route.fulfill({
        json: { rows: [{ scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 100 }], totalInvoices: 1, totalAmount: 100 }
      });
    });
    await page.goto('/rent-agreements/create');
  });

  test('scenario 76 — unchecking deposit back to blank auto-unchecks "deposit collected"', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    await form.setDeposit(500);
    await form.setDepositDueDate('09/15/2026');
    await form.toggleDepositCollected();
    await expect(page.getByRole('checkbox', { name: /already collected the deposit/ })).toBeChecked();

    await form.setDeposit(0);

    await expect(page.getByRole('checkbox', { name: /already collected the deposit/ })).not.toBeChecked();
  });

  test('scenario 75 — deposit amount without a due date blocks save client-side, no API call', async ({ page }) => {
    let createCalled = false;
    await page.route('**/api/v1/rent-agreements', async (route) => {
      createCalled = true;
      await route.fulfill({ status: 201, json: {} });
    });

    const form = new RentAgreementCreatePage(page);
    await form.setStartDate('09/01/2026');
    await form.selectFirstRentalDueDate('2026-09-01');
    await form.setDeposit(500);
    // deliberately leave depositDueDate blank
    await form.generatePreview();
    await expect(page.getByText('payments generated')).toBeVisible();

    await form.save();

    await expect(
      page.getByText('Deposit and deposit due date must both be provided, or both left blank.')
    ).toBeVisible();
    expect(createCalled).toBe(false);
  });
});
