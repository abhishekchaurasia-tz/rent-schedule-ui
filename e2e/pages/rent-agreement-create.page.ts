import { Page } from '@playwright/test';

import { AdditionalChargePanel } from './additional-charge-panel';

/**
 * Page Object for the "Add Tenant(s)" rent-agreement create screen
 * (`rent-agreement-create.component.html`). Wraps the raw locators so validation-matrix specs read
 * as a sequence of business actions rather than repeating `getByLabel(...)` everywhere.
 */
export class RentAgreementCreatePage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/rent-agreements/create');
  }

  async setLeaseTermType(value: 'fixed' | 'month_to_month'): Promise<void> {
    await this.page.getByLabel('Lease Term Type').selectOption(value);
  }

  async setStartDate(mmddyyyy: string): Promise<void> {
    await this.page.getByLabel('Start Date').fill(mmddyyyy);
    await this.page.keyboard.press('Escape');
  }

  async setEndDate(mmddyyyy: string): Promise<void> {
    await this.page.getByLabel('End Date').fill(mmddyyyy);
    await this.page.keyboard.press('Escape');
  }

  async setMonthToMonthInvoiceCount(count: number): Promise<void> {
    await this.page.getByLabel('Number of Payments to Preview').fill(String(count));
  }

  async setNextLeaseStartDate(mmddyyyy: string): Promise<void> {
    await this.page.getByLabel('Next Lease Start Date (optional)').fill(mmddyyyy);
    await this.page.keyboard.press('Escape');
  }

  async setFrequency(
    value: 'monthly' | 'bi_monthly' | 'weekly' | 'bi_weekly' | 'semesterly' | 'custom'
  ): Promise<void> {
    await this.page.getByLabel('Payment Frequency').selectOption(value);
  }

  async setRent(value: number): Promise<void> {
    await this.page.getByLabel('Rent').fill(String(value));
  }

  async setMonthlyDueOnDay(day: number): Promise<void> {
    await this.page.locator('.due-on-row select').first().selectOption(String(day));
  }

  async setBiMonthlyDueOnDays(days: [number, number]): Promise<void> {
    const selects = this.page.locator('.due-on-row select');
    await selects.nth(0).selectOption(String(days[0]));
    await selects.nth(1).selectOption(String(days[1]));
  }

  async setDayOfWeek(day: number): Promise<void> {
    await this.page.locator('.due-on-row select').first().selectOption(String(day));
  }

  async setSemesterlyCycle(cycle: [{ month: number; day: number }, { month: number; day: number }]): Promise<void> {
    const entries = this.page.locator('.cycle-entry');
    for (let i = 0; i < cycle.length; i++) {
      const entry = entries.nth(i);
      await entry.locator('input').nth(0).fill(String(cycle[i].month));
      await entry.locator('input').nth(1).fill(String(cycle[i].day));
    }
  }

  async addCustomDueDate(mmddyyyy: string, index = 0): Promise<void> {
    const fields = this.page.locator('.custom-dates .date-field input');
    if ((await fields.count()) <= index) {
      await this.page.getByRole('button', { name: '+ Add Date' }).click();
    }
    await fields.nth(index).fill(mmddyyyy);
    await this.page.keyboard.press('Escape');
  }

  async selectFirstRentalDueDate(isoDate: string): Promise<void> {
    await this.page.getByLabel(/On which date should the first rental invoice be due/).selectOption(isoDate);
  }

  async setFirstRentalDueDateCustom(mmddyyyy: string): Promise<void> {
    await this.page.locator('.first-due-label .date-field input').fill(mmddyyyy);
    await this.page.keyboard.press('Escape');
  }

  async setDeposit(amount: number): Promise<void> {
    await this.page.getByLabel('Deposit Amount').fill(String(amount));
  }

  async setDepositDueDate(mmddyyyy: string): Promise<void> {
    await this.page.getByLabel('Deposit Due Date').fill(mmddyyyy);
    await this.page.keyboard.press('Escape');
  }

  async toggleDepositCollected(): Promise<void> {
    await this.page.getByText('I have already collected the deposit').click();
  }

  async generatePreview(): Promise<void> {
    await this.page.getByRole('button', { name: 'Generate Preview' }).click();
  }

  async save(): Promise<void> {
    await this.page.getByRole('button', { name: 'Save Rent Agreement' }).click();
  }

  async openAdditionalChargePanel(): Promise<AdditionalChargePanel> {
    await this.page.getByRole('button', { name: '+ Add Additional Fee (Optional)' }).click();
    return new AdditionalChargePanel(this.page);
  }

  async openDepositChargePanel(): Promise<AdditionalChargePanel> {
    await this.page.getByRole('button', { name: '+ Add Deposit Fee (Optional)' }).click();
    return new AdditionalChargePanel(this.page);
  }
}
