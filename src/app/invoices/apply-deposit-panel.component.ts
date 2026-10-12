import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';

import {
  ApplyDepositRequest,
  DepositAllocationRequest,
  DepositApplicationContextResponse,
  MaintenanceItemRequest
} from './deposit-application.models';
import { isMoney, roundMoney } from './deposit-refund.util';

/** The backend's limit on a maintenance description (backend BR-08). */
export const MAX_MAINTENANCE_DESCRIPTION = 250;

/** The server's sentences, word for word, so the screen and a `400`/`422` agree (backend BR-08 – BR-10). */
export const ApplyMessages = {
  allocationAmount: 'Each allocation amount must be zero or more, with at most two decimals.',
  maintenanceAmount: 'Each maintenance amount must be above zero, with at most two decimals.',
  maintenanceDescription: 'Each maintenance item needs a description.',
  maintenanceDescriptionTooLong: `A maintenance description can be at most ${MAX_MAINTENANCE_DESCRIPTION} characters.`,
  exceedsBalance: "The amount to apply is more than the invoice's balance due.",
  exceedsAvailable: 'The amount to apply is more than the deposit still holds.',
  nothingToApply: 'At least one amount above zero must be applied.'
} as const;

/**
 * Every reason the request cannot be sent, and which inputs those reasons are about (keys like
 * `invoice.0`, `maintenance.1.description`), so the template can mark them.
 */
interface PanelValidation {
  messages: string[];
  fields: Set<string>;
}

/**
 * The **Apply Deposit** side panel — spec `10-deposit-application-ui.md` FR 4–9, laid out as the owner
 * app's screen.
 *
 * **It builds and checks the request; it does not send it.** The host page posts what `submitted` emits
 * and owns the outcome, exactly as with the Return Deposit panel.
 *
 * **One `applicationId` per opening.** It is minted when the panel is created and sent with every press,
 * so a press after a lost answer is the same submission and Billing answers it as a replay (backend
 * BR-13) instead of applying the deposit twice.
 */
@Component({
  selector: 'app-apply-deposit-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './apply-deposit-panel.component.html',
  styleUrl: './apply-deposit-panel.component.scss'
})
export class ApplyDepositPanelComponent implements OnInit {
  /** What the deposit still holds, and the lease's open invoices with their balances. */
  @Input({ required: true }) context!: DepositApplicationContextResponse;

  /** True while the host's request is in flight. Submitting again is ignored, never queued. */
  @Input() submitting = false;

  @Output() readonly submitted = new EventEmitter<ApplyDepositRequest>();
  @Output() readonly closed = new EventEmitter<void>();

  /** The owner app's sentence under the *Apply* heading. */
  readonly intro =
    'You can apply the deposit amount to outstanding invoices or to move-out maintenance / repairs. ' +
    'Below is a list of invoices associated with this lease that remain unpaid.';

  readonly maxDescription = MAX_MAINTENANCE_DESCRIPTION;

  /** Set by the first press; from then on the list of problems is live, so it shrinks as each is fixed. */
  readonly attempted = signal(false);

  /** The idempotency key for this opening of the panel. */
  readonly applicationId: string;

  readonly form: FormGroup;

  constructor(private readonly fb: FormBuilder) {
    this.applicationId = crypto.randomUUID();
    this.form = this.fb.group({
      maintenance: this.fb.array<FormGroup>([]),
      invoices: this.fb.array<FormGroup>([])
    });
  }

  get maintenanceRows(): FormArray<FormGroup> {
    return this.form.get('maintenance') as FormArray<FormGroup>;
  }

  get invoiceRows(): FormArray<FormGroup> {
    return this.form.get('invoices') as FormArray<FormGroup>;
  }

  /** One empty maintenance row, as the owner app opens, and one row per open invoice — built once. */
  ngOnInit(): void {
    this.addMaintenanceItem();

    for (const invoice of this.context.openInvoices) {
      this.invoiceRows.push(this.fb.group({ invoiceId: [invoice.invoiceId], amount: [null as number | null] }));
    }
  }

  addMaintenanceItem(): void {
    this.maintenanceRows.push(this.fb.group({ description: [''], amount: [null as number | null] }));
  }

  removeMaintenanceItem(index: number): void {
    this.maintenanceRows.removeAt(index);
  }

  /** Σ of every amount typed, rounded to cents. */
  get totalToApply(): number {
    const amounts = [
      ...this.maintenanceRows.controls.map((row) => this.amountOf(row)),
      ...this.invoiceRows.controls.map((row) => this.amountOf(row))
    ];

    return roundMoney(amounts.reduce((sum, amount) => sum + (Number.isFinite(amount) ? amount : 0), 0));
  }

  /** What the deposit would still hold after this apply. Negative means too much is being applied. */
  get remainingAfterApply(): number {
    return roundMoney(this.context.available - this.totalToApply);
  }

  /** The problems to show: none until the first press, every one afterwards. */
  get problems(): PanelValidation {
    return this.attempted() ? this.validate() : { messages: [], fields: new Set<string>() };
  }

  isInvalid(field: string): boolean {
    return this.problems.fields.has(field);
  }

  close(): void {
    this.closed.emit();
  }

  /** Checks the entries and, when they pass, emits the request. Nothing is sent while one is in flight. */
  submit(): void {
    if (this.submitting) {
      return;
    }

    this.attempted.set(true);
    if (this.validate().messages.length > 0) {
      return;
    }

    this.submitted.emit({
      applicationId: this.applicationId,
      allocations: this.allocations(),
      maintenanceItems: this.maintenanceItems()
    });
  }

  /**
   * The server's checks, in its words. A message is listed once however many rows break it; every row
   * that breaks it is marked.
   */
  private validate(): PanelValidation {
    const messages = new Set<string>();
    const fields = new Set<string>();

    this.maintenanceRows.controls.forEach((row, index) => {
      const description = String(row.value.description ?? '').trim();
      const raw = row.value.amount;
      const blankAmount = raw === null || raw === '' || raw === undefined;

      if (!description && blankAmount) {
        return;
      }

      const amount = Number(raw);
      if (blankAmount || !isMoney(amount) || amount <= 0) {
        messages.add(ApplyMessages.maintenanceAmount);
        fields.add(`maintenance.${index}.amount`);
      }

      if (!description) {
        messages.add(ApplyMessages.maintenanceDescription);
        fields.add(`maintenance.${index}.description`);
      } else if (description.length > MAX_MAINTENANCE_DESCRIPTION) {
        messages.add(ApplyMessages.maintenanceDescriptionTooLong);
        fields.add(`maintenance.${index}.description`);
      }
    });

    this.invoiceRows.controls.forEach((row, index) => {
      const raw = row.value.amount;
      if (raw === null || raw === '' || raw === undefined) {
        return;
      }

      const amount = Number(raw);
      if (!isMoney(amount)) {
        messages.add(ApplyMessages.allocationAmount);
        fields.add(`invoice.${index}`);
      } else if (amount > this.context.openInvoices[index].balanceDue) {
        messages.add(ApplyMessages.exceedsBalance);
        fields.add(`invoice.${index}`);
      }
    });

    if (messages.size === 0) {
      if (this.totalToApply <= 0) {
        messages.add(ApplyMessages.nothingToApply);
      } else if (this.totalToApply > this.context.available) {
        messages.add(ApplyMessages.exceedsAvailable);
      }
    }

    return { messages: [...messages], fields };
  }

  /** Every open invoice with an amount above zero. */
  private allocations(): DepositAllocationRequest[] {
    return this.invoiceRows.controls
      .map((row) => ({ invoiceId: String(row.value.invoiceId), amount: roundMoney(this.amountOf(row)) }))
      .filter((line) => line.amount > 0);
  }

  /** Every maintenance row that says something; a blank row is not sent. */
  private maintenanceItems(): MaintenanceItemRequest[] {
    return this.maintenanceRows.controls
      .map((row) => ({ description: String(row.value.description ?? '').trim(), amount: roundMoney(this.amountOf(row)) }))
      .filter((item) => item.description || item.amount > 0);
  }

  private amountOf(row: FormGroup): number {
    const raw = row.value.amount;
    return raw === null || raw === '' || raw === undefined ? 0 : Number(raw);
  }
}
