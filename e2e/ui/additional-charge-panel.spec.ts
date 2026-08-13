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
    await page.route('**/api/v1/rent/schedule/first-rental-due-date-options', async (route) => {
      await route.fulfill({ json: { dates: [] } });
    });
    await page.route('**/api/v1/line-items*', async (route) => {
      await route.fulfill({
        json: [
          { id: '11111111-1111-1111-1111-111111111111', name: 'Late Fee', itemType: 'LateFee', isDepositType: false },
          { id: '22222222-2222-2222-2222-222222222222', name: 'Parking', itemType: 'Parking', isDepositType: false },
          {
            id: '33333333-3333-3333-3333-333333333333',
            name: 'Security Deposit',
            itemType: 'SecurityDeposit',
            isDepositType: true
          }
        ]
      });
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

    // Target the endDate control directly by formControlName rather than by label text — the
    // "End Date" select's own implicit-label accessible name absorbs its rendered option text (a
    // <select>, unlike an <input>, has visible content of its own), and "No End Date" also contains
    // the substring "End Date", so `getByLabel` is ambiguous/unreliable here either way.
    const sidePanel = page.locator('.side-panel');
    const endDateField = sidePanel.locator('[formcontrolname="endDate"]');
    await expect(endDateField).toBeVisible();

    await panel.setHasNoEndDate(true);
    await expect(endDateField).toHaveCount(0);

    await panel.setHasNoEndDate(false);
    await expect(endDateField).toBeVisible();
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

  test('a charge can mix an existing catalog item with a brand-new item type', async ({ page }) => {
    // There is no per-item category anymore (removed alongside the mixed-category rule) — the
    // picker only distinguishes "pick from the catalog" vs. "type a new item type", and a single
    // charge can freely combine both kinds of item.
    const form = new RentAgreementCreatePage(page);
    const panel = await form.openAdditionalChargePanel();

    await panel.selectExistingItem('Late Fee', 0);
    await panel.setDescription('Late fee', 0);
    await panel.setQuantity(1, 0);
    await panel.setRate(50, 0);

    await panel.addItem();
    await panel.createNewItemType('Snow Removal', 1);
    await panel.setDescription('Winter snow removal', 1);
    await panel.setQuantity(1, 1);
    await panel.setRate(75, 1);

    await panel.setOneTimeDueDate('09/15/2026');
    await panel.create();

    await expect(page.locator('.charges-table')).toBeVisible();
    await expect(page.getByRole('cell', { name: '$125.00' })).toBeVisible();
  });

  test('picking an existing catalog item succeeds and appears in the fees table', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    const panel = await form.openAdditionalChargePanel();

    await panel.selectExistingItem('Parking', 0);
    await panel.setDescription('Parking space', 0);
    await panel.setQuantity(1, 0);
    await panel.setRate(75, 0);
    await panel.setOneTimeDueDate('09/15/2026');

    await panel.create();

    await expect(page.locator('.charges-table')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Rent' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '$75.00' })).toBeVisible();
  });

  test('deposit-only panel hides the rental-invoice attach toggle', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    await form.openDepositChargePanel();

    // depositOnly=true: the `@if (!depositOnly)` block around "Make this a line item on the rental
    // invoice?" should not render at all — a deposit fee can never attach to the rental invoice.
    await expect(page.getByText('Make this a line item on the rental invoice?')).toHaveCount(0);
    await expect(page.getByText('Add Additional Deposit Fee (Optional) Record')).toBeVisible();
  });

  test('deposit-only panel item picker has no "+ Add Item Type" option', async ({ page }) => {
    // A non-system property owner can never create a new deposit-category catalog entry (backend
    // `DepositItemMustBeSystemDefined`) — the deposit-only panel only offers picking from the
    // already-fetched (system-defined) deposit catalog.
    const form = new RentAgreementCreatePage(page);
    const panel = await form.openDepositChargePanel();
    void panel;

    await page.locator('.side-panel .item-picker-btn').click();
    await expect(page.locator('.item-picker-menu')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add Item Type' })).toHaveCount(0);
    await expect(page.locator('.item-picker-option', { hasText: 'Security Deposit' })).toBeVisible();
  });

  test('regular Additional Fee panel still offers "+ Add Item Type"', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    const panel = await form.openAdditionalChargePanel();
    void panel;

    await page.locator('.side-panel .item-picker-btn').click();
    await expect(page.getByRole('button', { name: '+ Add Item Type' })).toBeVisible();
  });

  test('scenario 96 — negative "already paid" is rejected client-side', async ({ page }) => {
    const form = new RentAgreementCreatePage(page);
    const panel = await form.openAdditionalChargePanel();

    await panel.selectExistingItem('Late Fee', 0);
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
