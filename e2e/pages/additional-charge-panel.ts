import { Locator, Page } from '@playwright/test';

/**
 * Page Object for the "Add Additional Fee (Optional) Record" side panel
 * (`additional-charge-panel.component.html`), opened from `RentAgreementCreatePage`.
 *
 * Every locator is scoped under `.side-panel` — the panel overlays the "Add Tenant(s)" form rather
 * than replacing it, and both share class names (`.date-field`) and label text (`Start Date`,
 * `End Date`), so an unscoped query can silently match the wrong field underneath.
 */
export class AdditionalChargePanel {
  private readonly root: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('.side-panel');
  }

  private row(index = 0) {
    return this.root.locator('.items-row').nth(index);
  }

  /**
   * Opens row `index`'s "Select Type" dropdown and picks an existing catalog entry by its visible
   * name. The dropdown itself (`.item-picker-menu`) renders as a fixed-position sibling of the form
   * rather than nested in the row — an ancestor's `overflow` would otherwise clip it — but it's
   * still a descendant of `.side-panel`, so `this.root` finds it fine.
   */
  async selectExistingItem(name: string, index = 0): Promise<void> {
    await this.row(index).locator('.item-picker-btn').click();
    await this.root.locator('.item-picker-option', { hasText: name }).click();
  }

  /** Opens row `index`'s picker and types a brand-new item type instead of picking from the catalog. */
  async createNewItemType(name: string, index = 0): Promise<void> {
    await this.row(index).locator('.item-picker-btn').click();
    await this.root.getByRole('button', { name: '+ Add Item Type' }).click();
    await this.root.getByPlaceholder('New item type name').fill(name);
    await this.root.getByRole('button', { name: 'Add', exact: true }).click();
  }

  async setDescription(value: string, index = 0): Promise<void> {
    await this.row(index).locator('input[type="text"]').fill(value);
  }

  async setQuantity(value: number, index = 0): Promise<void> {
    await this.row(index).locator('input[type="number"]').nth(0).fill(String(value));
  }

  async setRate(value: number, index = 0): Promise<void> {
    await this.row(index).locator('input[type="number"]').nth(1).fill(String(value));
  }

  async addItem(): Promise<void> {
    await this.root.getByRole('button', { name: '+ Add Item' }).click();
  }

  async removeItem(index: number): Promise<void> {
    await this.row(index).getByRole('button', { name: 'Remove' }).click();
  }

  async setAlreadyPaid(value: number): Promise<void> {
    await this.root.locator('.summary-row input[type="number"]').fill(String(value));
  }

  async toggleGrouped(): Promise<void> {
    await this.root.getByText('Group with other fees').click();
  }

  async toggleSharedByAll(): Promise<void> {
    await this.root.getByText('Split evenly among all tenants').click();
  }

  async setRecurring(recurring: boolean): Promise<void> {
    const checkbox = this.root
      .locator('.recurring-row', { hasText: 'Is this a Recurring Invoice?' })
      .locator('input[type="checkbox"]');
    if (recurring) {
      await checkbox.check({ force: true });
    } else {
      await checkbox.uncheck({ force: true });
    }
  }

  async setAttachedWithRentalInvoice(attached: boolean): Promise<void> {
    const checkbox = this.root
      .locator('.recurring-row', { hasText: 'Make this a line item on the rental invoice?' })
      .locator('input[type="checkbox"]');
    if (attached) {
      await checkbox.check({ force: true });
    } else {
      await checkbox.uncheck({ force: true });
    }
  }

  async setOneTimeDueDate(mmddyyyy: string): Promise<void> {
    await this.root.locator('.date-field input').first().fill(mmddyyyy);
    await this.page.keyboard.press('Escape');
  }

  async setFrequency(
    value: 'monthly' | 'bi_monthly' | 'weekly' | 'bi_weekly' | 'semesterly' | 'custom'
  ): Promise<void> {
    await this.root.getByLabel(/Frequency/).selectOption(value);
  }

  async setMonthlyDueOnDay(day: number): Promise<void> {
    await this.root.locator('.due-on-row select').first().selectOption(String(day));
  }

  async setRecurringStartDate(mmddyyyy: string): Promise<void> {
    await this.root.getByLabel('Start Date').fill(mmddyyyy);
    await this.page.keyboard.press('Escape');
  }

  async setRecurringEndDate(mmddyyyy: string): Promise<void> {
    await this.root.getByLabel('End Date').fill(mmddyyyy);
    await this.page.keyboard.press('Escape');
  }

  async setHasNoEndDate(value: boolean): Promise<void> {
    const checkbox = this.root.getByText('No End Date').locator('..').locator('input[type="checkbox"]');
    if (value) {
      await checkbox.check({ force: true });
    } else {
      await checkbox.uncheck({ force: true });
    }
  }

  async create(): Promise<void> {
    await this.root.getByRole('button', { name: 'Create' }).click();
  }

  async close(): Promise<void> {
    await this.root.getByRole('button', { name: 'Cancel' }).click();
  }
}
