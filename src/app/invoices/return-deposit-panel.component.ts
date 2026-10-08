import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';

import {
  BackupAddressRequest,
  CreateDepositRefundRequest,
  DepositRefundMode,
  DepositRefundResponse,
  DepositReturnRequest,
  OfflineReturnMethod
} from './deposit-refund.models';
import { isMoney, roundMoney, tenantDisplayName } from './deposit-refund.util';

/** Matches a canonical 8-4-4-4-12 UUID, case-insensitive — the same check the other id screens use. */
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The backend's limit on a check or money-order number (BR-17). */
const MAX_CHECK_NUMBER_LENGTH = 25;

/** The server's own sentence for BR-19, used word for word so the screen and the `422` agree. */
const EXCEEDS_REMAINING = 'Amount to return should be less than remaining amount.';

/**
 * The outcome of checking the panel: every reason the request cannot be sent, and which inputs those
 * reasons are about (keys like `offline.0.amount`, `online.bankId`), so the template can mark them.
 */
interface PanelValidation {
  messages: string[];
  fields: Set<string>;
}

/**
 * The **Return Deposit** side panel — spec `09-deposit-refund-ui.md` FR 5–11.
 *
 * **It builds and checks the request; it does not send it.** The host page posts what `submitted`
 * emits and owns the outcome — the success sentence, the re-read, the error above the panel — exactly as
 * the Invoices list owns the `POST` behind `AdditionalChargePanelComponent`. That keeps the one rule
 * that matters about this write — it reaches Finance at most once (backend BR-23) — in one place.
 *
 * **The checks mirror the server's, sentence for sentence** (BR-17, BR-19), because the owner app checks
 * first and a `400` lists one rule at a time. The server still checks everything again on a fresh
 * Finance read, so a check that drifts here costs a `422`, never a wrong refund. One rule is the
 * client's own (FR 8a): interest on a row with no amount, which the server would drop silently.
 *
 * **Each mode keeps its own form**, so choosing *Return Online* to look and then going back to *Return
 * Offline* loses nothing typed into either.
 */
@Component({
  selector: 'app-return-deposit-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './return-deposit-panel.component.html',
  styleUrl: './return-deposit-panel.component.scss'
})
export class ReturnDepositPanelComponent implements OnInit {
  /** The refund view the panel returns against: its tenants, and the `remaining` that caps it. */
  @Input({ required: true }) view!: DepositRefundResponse;

  /** True while the host's request is in flight. Submitting again is ignored, never queued. */
  @Input() submitting = false;

  @Output() readonly submitted = new EventEmitter<CreateDepositRefundRequest>();
  @Output() readonly closed = new EventEmitter<void>();

  /** The three instruments an offline return may be recorded by, in the order the owner app lists them. */
  readonly methodOptions: readonly { value: OfflineReturnMethod; label: string }[] = [
    { value: 'check', label: 'Check' },
    { value: 'cash', label: 'Cash' },
    { value: 'money_order', label: 'Money Order' }
  ];

  /** `null` until the owner picks *Return Offline* or *Return Online*. */
  readonly mode = signal<DepositRefundMode | null>(null);

  /**
   * Set by the first submit in the current mode. Until then nothing is reported — a form that opens
   * already listing eight problems reads as an accusation — and from then on the list is live, so it
   * shrinks as the owner fixes each entry.
   */
  readonly attempted = signal(false);

  /** One row per paying tenant, under a group so the template can bind `formArrayName`. */
  readonly offlineForm: FormGroup;

  readonly online: FormGroup;

  private readonly destroyRef = inject(DestroyRef);

  constructor(private readonly fb: FormBuilder) {
    this.offlineForm = this.fb.group({ rows: this.fb.array<FormGroup>([]) });

    // Flat rather than nested: every field is one input with one message, and a flat group keeps the
    // template's `formControlName`s and the validation keys the same words.
    this.online = this.fb.group({
      tenantId: [''],
      amount: [null as number | null],
      interest: [null as number | null],
      bankId: [''],
      bankName: [''],
      accountHolder: [''],
      accountTypeId: [null as number | null],
      accountNumber: [''],
      routingNumber: [''],
      fundingSource: [''],
      includeBackupAddress: [false],
      line1: [''],
      line2: [''],
      city: [''],
      state: [''],
      zip: ['']
    });
  }

  /**
   * Builds the offline rows from the view's tenants. Once only: a refresh of the view while the panel
   * is open (a scope change, FR 19) updates the figures the panel checks against, and leaves what the
   * owner has typed alone.
   */
  ngOnInit(): void {
    for (const tenant of this.view.tenants) {
      const row = this.fb.group({
        tenantId: [tenant.tenantId],
        method: ['check' as OfflineReturnMethod],
        checkNumber: [''],
        amount: [null as number | null],
        interest: [null as number | null]
      });

      // A subscription rather than a `(change)` handler, so the rule holds however the method is set.
      row
        .get('method')!
        .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((method) => this.applyCashRule(row, method));

      this.offlineRows.push(row);
    }

    // Online names exactly one tenant; when only one paid there is nothing to choose.
    if (this.view.tenants.length === 1) {
      this.online.patchValue({ tenantId: this.view.tenants[0].tenantId });
    }
  }

  get offlineRows(): FormArray<FormGroup> {
    return this.offlineForm.get('rows') as FormArray<FormGroup>;
  }

  /** Picks a mode. The attempt flag resets, so the other mode's form is not judged before it is tried. */
  chooseMode(mode: DepositRefundMode): void {
    this.mode.set(mode);
    this.attempted.set(false);
  }

  /** The name a tenant row is shown under — the server's, else the app's stand-in (FR 18). */
  tenantName(tenantId: string): string {
    const tenant = this.view.tenants.find((candidate) => candidate.tenantId === tenantId);
    return tenantDisplayName(tenantId, tenant?.name);
  }

  /**
   * *Deposit Held* for a row's tenant, looked up by id in the current view — so a re-read while the
   * panel is open shows the new figure against the row the owner is already typing into.
   */
  heldFor(tenantId: string): number | null {
    return this.view.tenants.find((tenant) => tenant.tenantId === tenantId)?.held ?? null;
  }

  isCash(index: number): boolean {
    return this.offlineRows.at(index).get('method')!.value === 'cash';
  }

  get includesBackupAddress(): boolean {
    return !!this.online.get('includeBackupAddress')!.value;
  }

  // ---- running totals (FR 7) ---------------------------------------------------------------------

  /** *Total Held* — the deposit lines, as served (BR-05). */
  get totalHeld(): number {
    return this.view.totals.depositAmount;
  }

  /** Σ principal entered in the current mode. An unreadable entry counts as nothing here. */
  get enteredPrincipal(): number {
    return roundMoney(this.entries().reduce((sum, entry) => sum + safe(entry.amount), 0));
  }

  get enteredInterest(): number {
    return roundMoney(this.entries().reduce((sum, entry) => sum + safe(entry.interest), 0));
  }

  /** *Amount to Return* — principal plus interest, what the tenant receives. */
  get amountToReturn(): number {
    return roundMoney(this.enteredPrincipal + this.enteredInterest);
  }

  /** *Remaining Deposit* — what would remain after this return. Interest never reduces it (BR-06). */
  get remainingAfter(): number {
    return roundMoney(this.view.totals.remaining - this.enteredPrincipal);
  }

  /** Shown live, before any attempt, because it is the one rule the totals themselves make visible. */
  get exceedsRemaining(): boolean {
    return this.enteredPrincipal > roundMoney(this.view.totals.remaining);
  }

  // ---- checking and sending (FR 8–11) -------------------------------------------------------------

  /** Every reason the request cannot be sent — empty until the first attempt in this mode. */
  get errors(): string[] {
    return this.attempted() ? this.validate().messages : [];
  }

  /** Whether the input behind `key` (`offline.0.amount`, `online.bankId`, …) is one of the reasons. */
  isInvalid(key: string): boolean {
    return this.attempted() && this.validate().fields.has(key);
  }

  /**
   * Checks the current mode's entries against the client mirror of backend BR-17 and BR-19.
   *
   * Every reason is collected rather than the first one returned, so the owner fixes the form in one
   * pass instead of meeting the rules one refusal at a time.
   */
  validate(): PanelValidation {
    const mode = this.mode();
    if (mode === 'offline') {
      return this.validateOffline();
    }
    if (mode === 'online') {
      return this.validateOnline();
    }
    return { messages: ['Choose Return Offline or Return Online.'], fields: new Set() };
  }

  /**
   * Emits the request when every check passes. A second press while the host's request is in flight is
   * dropped, not queued: the write reaches Finance at most once (BR-23).
   */
  submit(): void {
    const mode = this.mode();
    if (this.submitting || mode === null || this.view.tenants.length === 0) {
      return;
    }

    this.attempted.set(true);
    if (this.validate().messages.length > 0) {
      return;
    }

    this.submitted.emit(mode === 'offline' ? this.buildOfflineRequest() : this.buildOnlineRequest());
  }

  close(): void {
    this.closed.emit();
  }

  // ---- private --------------------------------------------------------------------------------------

  /** Clears and disables the number for Cash, which carries none (BR-17); enables it for the others. */
  private applyCashRule(row: FormGroup, method: OfflineReturnMethod | null): void {
    const checkNumber = row.get('checkNumber')!;
    if (method === 'cash') {
      checkNumber.setValue('', { emitEvent: false });
      checkNumber.disable({ emitEvent: false });
    } else {
      checkNumber.enable({ emitEvent: false });
    }
  }

  /** The current mode's principal and interest entries, parsed; blank is 0, junk is `NaN`. */
  private entries(): { amount: number; interest: number }[] {
    const mode = this.mode();
    if (mode === 'offline') {
      return this.offlineRows.controls.map((row) => {
        const value = row.getRawValue();
        return { amount: toNumber(value.amount), interest: toNumber(value.interest) };
      });
    }
    if (mode === 'online') {
      const value = this.online.getRawValue();
      return [{ amount: toNumber(value.amount), interest: toNumber(value.interest) }];
    }
    return [];
  }

  private validateOffline(): PanelValidation {
    const messages: string[] = [];
    const fields = new Set<string>();

    this.offlineRows.controls.forEach((row, index) => {
      const value = row.getRawValue();
      const name = this.tenantName(value.tenantId);
      const amount = toNumber(value.amount);
      const interest = toNumber(value.interest);

      if (!isMoney(amount) || !isMoney(interest)) {
        messages.push(`${name}: amounts must be 0 or more, with at most two decimals.`);
        if (!isMoney(amount)) {
          fields.add(`offline.${index}.amount`);
        }
        if (!isMoney(interest)) {
          fields.add(`offline.${index}.interest`);
        }
        return;
      }

      if (amount === 0) {
        // FR 8a. BR-18 drops this row before Finance is called, and the interest goes with it.
        if (interest > 0) {
          messages.push(
            `${name}: deposit interest is returned only with an amount. Enter an amount, or clear the interest.`
          );
          fields.add(`offline.${index}.amount`);
        }
        return;
      }

      if (value.method !== 'cash') {
        const label = value.method === 'money_order' ? 'money order' : 'check';
        const number = String(value.checkNumber ?? '').trim();

        if (!number) {
          messages.push(`${name}: enter the ${label} number.`);
          fields.add(`offline.${index}.checkNumber`);
        } else if (number.length > MAX_CHECK_NUMBER_LENGTH) {
          messages.push(`${name}: the ${label} number can be at most ${MAX_CHECK_NUMBER_LENGTH} characters.`);
          fields.add(`offline.${index}.checkNumber`);
        }
      }
    });

    const anyAmount = this.entries().some((entry) => isMoney(entry.amount) && entry.amount > 0);
    if (!anyAmount) {
      messages.push('Enter an amount to return for at least one tenant.');
    }

    if (this.exceedsRemaining) {
      messages.push(EXCEEDS_REMAINING);
    }

    return { messages, fields };
  }

  private validateOnline(): PanelValidation {
    const messages: string[] = [];
    const fields = new Set<string>();
    const value = this.online.getRawValue();

    const refuse = (field: string, message: string): void => {
      messages.push(message);
      fields.add(`online.${field}`);
    };

    if (!value.tenantId) {
      refuse('tenantId', 'Choose the tenant to return the deposit to.');
    }

    const amount = toNumber(value.amount);
    const interest = toNumber(value.interest);
    if (!isMoney(amount) || !isMoney(interest)) {
      messages.push('Amounts must be 0 or more, with at most two decimals.');
      if (!isMoney(amount)) {
        fields.add('online.amount');
      }
      if (!isMoney(interest)) {
        fields.add('online.interest');
      }
    } else if (amount === 0) {
      refuse('amount', 'Enter an amount to return.');
    } else if (this.exceedsRemaining) {
      refuse('amount', EXCEEDS_REMAINING);
    }

    const bankId = text(value.bankId);
    if (!bankId) {
      refuse('bankId', 'Enter the bank ID.');
    } else if (!GUID_PATTERN.test(bankId) || /^[0-]+$/.test(bankId)) {
      refuse('bankId', 'The bank ID must be a GUID, like 8f14e45f-ceea-467e-bd9f-000000000001.');
    }

    if (!text(value.bankName)) {
      refuse('bankName', 'Enter the bank name.');
    }

    // An `int` on the wire: anything else is refused by the API's JSON reader before any rule runs.
    const accountTypeId = value.accountTypeId;
    if (accountTypeId === null || accountTypeId === '' || !Number.isInteger(Number(accountTypeId)) || Number(accountTypeId) < 0) {
      refuse('accountTypeId', 'Enter the account type ID as a whole number.');
    }

    if (!text(value.accountNumber)) {
      refuse('accountNumber', 'Enter the encrypted account number.');
    }
    if (!text(value.routingNumber)) {
      refuse('routingNumber', 'Enter the encrypted routing number.');
    }
    if (!text(value.fundingSource)) {
      refuse('fundingSource', 'Enter the encrypted funding source.');
    }

    if (value.includeBackupAddress) {
      if (!text(value.line1)) {
        refuse('line1', 'Backup address: enter address line 1.');
      }
      const city = text(value.city);
      if (!city) {
        refuse('city', 'Backup address: enter the city.');
      } else if (!/^[a-zA-Z\s]+$/.test(city)) {
        refuse('city', 'Backup address: the city may hold only letters and spaces.');
      }
      if (!text(value.state)) {
        refuse('state', 'Backup address: enter the state.');
      }
      if (!/^\d{5}$/.test(text(value.zip))) {
        refuse('zip', 'Backup address: the ZIP code must be 5 digits.');
      }
    }

    return { messages, fields };
  }

  /**
   * Rows with an amount only (BR-18), each carrying `checkNumber` only when its method has one — a key
   * present on a cash row is a `400` (BR-17).
   */
  private buildOfflineRequest(): CreateDepositRefundRequest {
    const returns: DepositReturnRequest[] = this.offlineRows.controls
      .map((row) => row.getRawValue())
      .filter((value) => toNumber(value.amount) > 0)
      .map((value) => ({
        tenantId: value.tenantId,
        method: value.method,
        ...(value.method !== 'cash' ? { checkNumber: text(value.checkNumber) } : {}),
        amount: roundMoney(toNumber(value.amount)),
        interest: roundMoney(toNumber(value.interest))
      }));

    return { mode: 'offline', returns };
  }

  /** One return, no `method` or `checkNumber`, the owner's bank, and the address only when included. */
  private buildOnlineRequest(): CreateDepositRefundRequest {
    const value = this.online.getRawValue();

    const request: CreateDepositRefundRequest = {
      mode: 'online',
      returns: [
        {
          tenantId: value.tenantId,
          amount: roundMoney(toNumber(value.amount)),
          interest: roundMoney(toNumber(value.interest))
        }
      ],
      ownerBank: {
        bankId: text(value.bankId),
        bankName: text(value.bankName),
        accountHolder: text(value.accountHolder),
        accountTypeId: Number(value.accountTypeId),
        accountNumber: text(value.accountNumber),
        routingNumber: text(value.routingNumber),
        fundingSource: text(value.fundingSource)
      }
    };

    if (value.includeBackupAddress) {
      const address: BackupAddressRequest = {
        line1: text(value.line1),
        city: text(value.city),
        state: text(value.state),
        zip: text(value.zip)
      };
      const line2 = text(value.line2);
      if (line2) {
        address.line2 = line2;
      }
      request.backupAddress = address;
    }

    return request;
  }
}

/** A number input's value as a number: blank is 0 (nothing entered), anything unreadable is `NaN`. */
function toNumber(raw: unknown): number {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return 0;
  }
  return Number(raw);
}

/** For the running totals only: an unreadable entry adds nothing rather than turning the total into `NaN`. */
function safe(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** A text input's value, trimmed. */
function text(raw: unknown): string {
  return String(raw ?? '').trim();
}
