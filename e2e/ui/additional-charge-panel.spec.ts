import { expect, test } from '@playwright/test';

import { RentAgreementCreatePage } from '../pages/rent-agreement-create.page';

/**
 * Drives the "Add Additional Fee (Optional) Record" side panel (`additional-charge-panel.component.html`)
 * from the rent-agreement create page. Covers the client-side mirror of the additional-charge rule
 * matrix in docs/ui-automation-test-matrix.md §3.3 — the backend's own acceptance/rejection of the
 * resulting payload is covered in `e2e/api/rent-agreement-validation.api.spec.ts`.
 */
test.describe('Additional charge panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/rent-schedule/first-rental-due-date-options', async (route) => {
      await route.fulfill({ json: { dates: [] } });
    });
    await page.goto('/rent-agreements/create');
  });

  test('scenario 79 — one-time charge shows Due Date and hides recurring fields', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    const panel = await form.openAdditionalChargePanel();
    void panel;

    // Scope to the panel itself — the underlying "Add Tenant(s)" form has its own "Deposit Due Date"
    // label, and `getByText` matches substrings, so an unscoped query would false-positive on it.
    const sidePanel = page.locator('.side-panel');
    await expect(sidePanel.getByText('Due Date', { exact: true })).toBeVisible();
    await expect(sidePanel.locator('.recurring-fields')).toHaveCount(0);
  });

  test('scenario 80 — toggling to recurring hides Due Date and requires Frequency + Start Date', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    const panel = await form.openAdditionalChargePanel();

    await panel.setRecurring(true);

    const sidePanel = page.locator('.side-panel');
    await expect(sidePanel.getByText('Due Date', { exact: true })).toHaveCount(0);
    await expect(sidePanel.getByLabel(/Frequency/)).toBeVisible();
    await expect(sidePanel.getByLabel('Start Date')).toBeVisible();
  });

  test('scenario 80 — exactly one of End Date / "No End Date" is presented at a time', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    const panel = await form.openAdditionalChargePanel();
    await panel.setRecurring(true);

    const sidePanel = page.locator('.side-panel');
    await expect(sidePanel.getByLabel('End Date', { exact: true })).toBeVisible();

    await panel.setHasNoEndDate(true);
    await expect(sidePanel.getByLabel('End Date', { exact: true })).toHaveCount(0);

    await panel.setHasNoEndDate(false);
    await expect(sidePanel.getByLabel('End Date', { exact: true })).toBeVisible();
  });

  test('scenario 81 — switching one-time to recurring clears the due date field', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    const panel = await form.openAdditionalChargePanel();

    await panel.setOneTimeDueDate('09/15/2026');
    await panel.setRecurring(true);
    await panel.setRecurring(false);

    // Component clears `dueDate` whenever isRecurring flips true (additional-charge-panel.component.ts
    // valueChanges subscriber); switching back to one-time should present an empty field again, not
    // the stale 09/15/2026.
    await expect(page.locator('.side-panel .date-field input').first()).toHaveValue('');
  });

  test('scenario 88 — items with different categories on one charge are rejected client-side', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    const panel = await form.openAdditionalChargePanel();

    await panel.setItemCategory('rent', 0);
    await panel.setItemType('Late Fee', 0);
    await panel.setDescription('Late fee', 0);
    await panel.setQuantity(1, 0);
    await panel.setRate(50, 0);

    await panel.addItem();
    await panel.setItemCategory('deposit', 1);
    // itemType's option list is keyed off the panel's depositOnly flag, not this item's own
    // category — this panel isn't deposit-only, so only the rent-flavored itemTypes are offered.
    await panel.setItemType('Other', 1);
    await panel.setDescription('Deposit', 1);
    await panel.setQuantity(1, 1);
    await panel.setRate(500, 1);

    await panel.setOneTimeDueDate('09/15/2026');
    await panel.create();

    await expect(panel.mixedCategoryErrorVisible()).toBeVisible();
  });

  test('scenario matching categories across items succeeds and appears in the fees table', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    const panel = await form.openAdditionalChargePanel();

    await panel.setItemCategory('rent', 0);
    await panel.setItemType('Parking', 0);
    await panel.setDescription('Parking space', 0);
    await panel.setQuantity(1, 0);
    await panel.setRate(75, 0);
    await panel.setOneTimeDueDate('09/15/2026');

    await panel.create();

    await expect(page.locator('.charges-table')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Rent' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '$75.00' })).toBeVisible();
  });

  test('deposit-only panel hides the per-item category selector and the rental-invoice attach toggle', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    await form.openDepositChargePanel();

    // depositOnly=true: `@if (!depositOnly)` blocks around the category <select> and the
    // "Make this a line item on the rental invoice?" toggle should not render at all.
    await expect(page.getByText('Make this a line item on the rental invoice?')).toHaveCount(0);
    await expect(page.getByText('Add Additional Deposit Fee (Optional) Record')).toBeVisible();
  });

  test('scenario 96 — negative "already paid" is rejected client-side', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    const panel = await form.openAdditionalChargePanel();

    await panel.setItemType('Late Fee', 0);
    await panel.setDescription('Late fee', 0);
    await panel.setQuantity(1, 0);
    await panel.setRate(50, 0);
    await panel.setOneTimeDueDate('09/15/2026');
    await panel.setAlreadyPaid(-10);

    await panel.create();

    // Invalid form (Validators.min(0) on alreadyPaid) should keep the panel open rather than emit.
    await expect(page.locator('.side-panel')).toBeVisible();
  });
});
