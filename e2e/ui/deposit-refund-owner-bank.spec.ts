import { test, expect } from '@playwright/test';

/**
 * The owner's bank picker, end to end against a live gateway — the one thing the unit suites could
 * not have caught.
 *
 * **Why this exists.** Every layer of this was green while the picker showed nothing: the specs
 * flushed a camelCase bare array that merlin never sends, so the envelope and the casing were both
 * wrong and both silent. A test that goes through a real dev-server proxy to a real merlin is the
 * only one that would have failed.
 *
 * **Skipped without a token**, because merlin answers only to a bearer and there is nowhere in CI to
 * get one. Run it with the token from a signed-in qa session:
 *
 *   QA_ACCESS_TOKEN=eyJ… UI_BASE_URL=http://localhost:4300 npm run e2e:ui
 *
 * `QA_DEPOSIT_INVOICE_ID` overrides the invoice; the default is a fully paid deposit invoice on qa,
 * which may be cleaned up eventually — a 404 on load means it is time to pick another.
 */
const TOKEN = process.env['QA_ACCESS_TOKEN'] ?? '';
const INVOICE =
  process.env['QA_DEPOSIT_INVOICE_ID'] ?? '01a11acb-1cb5-76c7-9d85-fbb9a2e802ff';

test.describe('Deposit refund — the owner bank picker, against a live merlin', () => {
  test.skip(TOKEN.length === 0, 'Set QA_ACCESS_TOKEN to run this against the qa gateway.');

  test('lists the owner\'s real accounts, masked, from merlin\'s envelope', async ({ page }) => {
    const merlin: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('GetPropertyOwnerBankDetails')) {
        merlin.push(`${response.status()} ${response.headers()['content-type'] ?? ''}`);
      }
    });

    await page.goto('/');

    // Typed, not blurred: `change` fired only on blur, so a pasted token was never stored and every
    // call went out unauthenticated. `fill` dispatches `input` alone, which is what that regressed on.
    await page.locator('#scope-access-token').fill(TOKEN);

    await page.goto(`/invoices/deposit-refund?invoiceId=${INVOICE}`);
    await page.getByRole('button', { name: 'Load' }).click();
    await page.getByRole('button', { name: 'Refund Deposit' }).click();
    await page.getByRole('radio', { name: /Return Online/ }).click();

    const select = page.locator('.online-row select[formcontrolname="bankId"]');
    await expect(select).toBeVisible();

    // A dev server whose proxy config predates the `/api` entry answers this path with index.html,
    // 200 and text/html. Asserting the type keeps that from passing as a working read.
    expect(merlin.join(', ')).toContain('application/json');

    const options = (await select.locator('option').allTextContents()).join(' | ');
    expect(options).toContain('xxxx-1111');
    expect(options).toContain('xxxx-0000');

    // Masked only: the three encrypted values never reach the screen (BR-22).
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('8wZHdAKJ');
    expect(body).not.toContain('nq1gWsh1');
  });
});
