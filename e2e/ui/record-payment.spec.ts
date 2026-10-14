import { expect, Page, Route, test } from '@playwright/test';

/**
 * The Record Payment panel (spec `11-record-payment-ui.md`), driven from the Invoices list's row menu.
 *
 * **Billing is stubbed** with `page.route`, as `additional-charge-panel.spec.ts` stubs the catalog, so this
 * runs against `ng serve` alone and covers what the component tests cannot: the real template, the
 * Material datepicker, the debounce against a real clock, and the list's re-read after a `202`. The
 * backend's own answers are Billing's tests (`18-record-payment.md` v2); matrix scenario 167 is the run
 * against a live Billing.
 *
 * The figures are Billing spec 18's worked example: `INV-102026-000101`, $190.00 with $5.00 paid, two
 * tenants, and two later invoices on the same agreement.
 */
const INVOICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GEETIKA = '11111111-1111-1111-1111-111111111111';
const PANDIT = '22222222-2222-2222-2222-222222222222';

const row = {
  invoiceId: INVOICE,
  invoiceNumber: 'INV-102026-000101',
  invoiceType: 'rent',
  status: 'partial_paid',
  generatedOn: '2026-10-01',
  dueDate: '2026-10-09',
  total: 190,
  amountPaid: 5,
  balance: 185,
  propertyId: '66666666-6666-6666-6666-666666666666',
  rentAgreementId: '88888888-8888-8888-8888-888888888888',
  tenantIds: [GEETIKA, PANDIT]
};

const context = {
  invoiceId: INVOICE,
  invoiceNumber: 'INV-102026-000101',
  total: 190,
  paid: 5,
  payable: 185,
  tenants: [
    { tenantId: GEETIKA, name: 'Geetika Shukla', share: 95, paid: 5, suggestedAmount: 90 },
    { tenantId: PANDIT, name: 'Pandit Yeman', share: 95, paid: 0, suggestedAmount: 95 }
  ],
  methods: ['cash', 'check', 'money_order']
};

const allocation = (invoiceNumber: string, dueDate: string, payableBefore: number, applied: number) => ({
  invoiceId: invoiceNumber === row.invoiceNumber ? INVOICE : invoiceNumber,
  invoiceNumber,
  dueDate,
  payableBefore,
  applied,
  payableAfter: payableBefore - applied,
  slices: []
});

/** What Billing would answer for a total: within the invoice, spilling over, or more than 585 can take. */
function previewFor(total: number) {
  if (total > 585) {
    return {
      totalEntered: total,
      payable: 185,
      excess: total - 185,
      maxPayable: 585,
      exceedsPayable: true,
      message: 'There are no other unpaid or future invoices, therefore, you cannot enter an amount greater than $585.00.',
      allocations: []
    };
  }

  const allocations = [allocation(row.invoiceNumber, '2026-10-09', 185, Math.min(total, 185))];
  if (total > 185) {
    allocations.push(allocation('INV-112026-000102', '2026-11-02', 200, Math.min(total - 185, 200)));
  }
  if (total > 385) {
    allocations.push(allocation('INV-122026-000103', '2026-12-02', 200, total - 385));
  }

  return { totalEntered: total, payable: 185, excess: Math.max(0, total - 185), maxPayable: 585, exceedsPayable: false, message: null, allocations };
}

interface Stubs {
  submissions: { submissionId: string; tenantId: string; payments: { method: string; amount: number }[] }[];
  listReads: number;
}

async function stubBilling(page: Page, submitStatuses: number[] = [202]): Promise<Stubs> {
  const stubs: Stubs = { submissions: [], listReads: 0 };

  await page.route('**/api/v1/invoices**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/v1\/invoices/, '');

    if (path === '' || path === '/') {
      stubs.listReads++;
      return route.fulfill({
        json: { items: [row], totalCount: 1, pageNumber: 1, pageSize: 50, totalPages: 1, hasNextPage: false, hasPreviousPage: false }
      });
    }
    if (path === `/${INVOICE}`) {
      return route.fulfill({ json: { invoiceId: INVOICE, lines: [{ description: 'Rent due on October 9, 2026' }] } });
    }
    if (path === `/${INVOICE}/offline-payment`) {
      return route.fulfill({ json: context });
    }
    if (path === `/${INVOICE}/offline-payments/preview`) {
      const body = route.request().postDataJSON() as { payments: { amount: number }[] };
      return route.fulfill({ json: previewFor(body.payments.reduce((sum, line) => sum + line.amount, 0)) });
    }
    if (path === `/${INVOICE}/offline-payments`) {
      const body = route.request().postDataJSON();
      stubs.submissions.push(body);
      const status = submitStatuses[Math.min(stubs.submissions.length, submitStatuses.length) - 1];
      if (status === 202) {
        return route.fulfill({ status, json: { invoiceId: INVOICE, submissionId: body.submissionId, status: 'accepted', allocations: [] } });
      }
      return route.fulfill({
        status,
        contentType: 'application/problem+json',
        body: JSON.stringify({ status, detail: 'not confirmed', errorCode: 'record_payment.submission_unconfirmed' })
      });
    }

    return route.fallback();
  });

  return stubs;
}

async function openPanel(page: Page) {
  await page.goto('/invoices');
  await page.getByRole('button', { name: 'Invoice actions' }).first().click();
  await page.getByRole('button', { name: 'Record Payment…' }).click();
  const panel = page.getByRole('dialog', { name: 'Record Payment' });
  await expect(panel.getByText('INVOICE SUMMARY')).toBeVisible();
  return panel;
}

test.describe('Record Payment panel', () => {
  test('scenario 149, 160, 164 — the summary, then an overpayment shown and submitted once', async ({ page }) => {
    const stubs = await stubBilling(page);
    const panel = await openPanel(page);

    await expect(panel.locator('.summary-table tbody td')).toHaveText([
      'INV-102026-000101',
      'Rent due on October 9, 2026',
      '$190.00',
      '$5.00',
      '$185.00'
    ]);

    await panel.getByLabel('Tenant').selectOption(GEETIKA);
    await panel.getByLabel('Payment Method').selectOption('cash');
    await expect(panel.getByLabel('Amount Paid')).toHaveValue('90');
    await panel.getByLabel('Amount Paid').fill('400');

    await expect(panel.locator('.excess-box p')).toHaveText(
      'You entered an amount greater than the balance due. The excess amount of $215.00 will be applied on the following invoices.'
    );
    await expect(panel.locator('.excess-row')).toHaveCount(2);
    await expect(panel.locator('.excess-row').nth(1)).toContainText('INV-122026-000103');
    await expect(panel.locator('.excess-row').nth(1)).toContainText('$15.00');

    await panel.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Please review the payment information before submitting');
    await page.getByRole('button', { name: 'Yes', exact: true }).click();

    await expect(page.locator('.banner.success')).toContainText('Payment submitted on INV-102026-000101');
    await expect(panel).toHaveCount(0);
    expect(stubs.submissions).toHaveLength(1);
    expect(stubs.submissions[0].tenantId).toBe(GEETIKA);
    expect(stubs.submissions[0].payments).toEqual([expect.objectContaining({ method: 'cash', amount: 400 })]);
    expect(stubs.listReads).toBe(2);
  });

  test('scenario 154, 156 — a second line is locked to the tenant and can be removed', async ({ page }) => {
    await stubBilling(page);
    const panel = await openPanel(page);

    await panel.getByLabel('Tenant').selectOption(GEETIKA);
    await panel.getByLabel('Payment Method').selectOption('cash');
    await panel.getByRole('button', { name: 'Add Additional Payment' }).click();

    const second = panel.locator('.payment-line').nth(1);
    await expect(second.getByLabel('Tenant')).toBeDisabled();
    await expect(second.getByLabel('Tenant')).toHaveValue(GEETIKA);
    await second.getByLabel('Payment Method').selectOption('money_order');
    await expect(second.getByLabel('Money Order Number')).toBeVisible();

    await second.getByRole('button', { name: 'Remove' }).click();
    await expect(panel.locator('.payment-line')).toHaveCount(1);
  });

  test('scenario 161 — a total no invoice can take is refused before Submit', async ({ page }) => {
    await stubBilling(page);
    const panel = await openPanel(page);

    await panel.getByLabel('Tenant').selectOption(GEETIKA);
    await panel.getByLabel('Payment Method').selectOption('cash');
    await panel.getByLabel('Amount Paid').fill('600');

    await expect(panel.locator('.exceeds-message')).toHaveText(
      'There are no other unpaid or future invoices, therefore, you cannot enter an amount greater than $585.00.'
    );
    await expect(panel.getByRole('button', { name: 'Submit' })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Add Additional Payment' })).toBeDisabled();
  });

  test('scenario 165 — an unconfirmed submission warns, and the retry carries the same submission id', async ({ page }) => {
    const stubs = await stubBilling(page, [502, 202]);
    const panel = await openPanel(page);

    await panel.getByLabel('Tenant').selectOption(PANDIT);
    await panel.getByLabel('Payment Method').selectOption('check');
    await panel.getByLabel('Check Number').fill('1042');
    await expect(panel.getByRole('button', { name: 'Submit' })).toBeEnabled();

    await panel.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(panel.locator('.submit-error.warn')).toContainText('It may still have been queued');

    await panel.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(page.locator('.banner.success')).toContainText('Payment submitted');

    expect(stubs.submissions).toHaveLength(2);
    expect(stubs.submissions[1].submissionId).toBe(stubs.submissions[0].submissionId);
  });
});
