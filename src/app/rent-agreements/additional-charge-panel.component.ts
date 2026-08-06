import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { provideNativeDateAdapter } from '@angular/material/core';

import { RentFrequency } from '../rent-schedule/rent-schedule.models';
import { buildFrequencyConfig, ordinal } from '../rent-schedule/frequency-config.util';
import { toIsoDate } from '../shared/date.util';
import { AdditionalChargeCreationRequest } from './rent-agreement.models';
import { LineItemResponse, LineItemScope } from './line-item.models';
import { LineItemsService } from './line-items.service';

/**
 * The "ADD ADDITIONAL FEE (OPTIONAL) RECORD" side panel — one or more line items plus the
 * recurring/one-time due-date matrix from `AdditionalChargeCreationRequest`, including the same
 * per-frequency `frequencyConfig` shapes the lease-terms form uses (monthly due-on-day, bi-monthly
 * two days, weekly/bi-weekly weekday, semesterly month/day cycle, custom due dates) — mirroring the
 * legacy `in-property-owner-app` "Additional Fee" component's `RecurringInvoiceDueDateJsonModel`.
 * Emits the built request on `create` and lets the host decide what to do with it (the create page
 * appends it to its running list); this component holds no knowledge of the parent form or the API.
 */
@Component({
  selector: 'app-additional-charge-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDatepickerModule, MatFormFieldModule, MatInputModule],
  providers: [provideNativeDateAdapter()],
  templateUrl: './additional-charge-panel.component.html',
  styleUrl: './additional-charge-panel.component.scss'
})
export class AdditionalChargePanelComponent implements OnInit {
  /**
   * When `true`, this panel is the deposit-only entry point: the fetched catalog is scoped to
   * `DepositOnly` (deposit-flavored items only), and "attached to rental invoice" is hidden — a
   * deposit fee can never ride the rent invoice (backend-enforced,
   * `DepositAdditionalChargeCannotAttachRentalInvoice`).
   */
  @Input() depositOnly = false;

  /**
   * The requesting property owner — passed through to `GET /api/v1/line-items` as an explicit query
   * parameter (the backend has no session/auth mechanism to resolve it from yet). Without this, the
   * catalog can't be fetched and the item picker stays empty.
   */
  @Input() propertyOwnerId: string | null = null;

  @Output() readonly created = new EventEmitter<AdditionalChargeCreationRequest>();
  @Output() readonly closed = new EventEmitter<void>();

  /**
   * The catalog entries fetched for this panel's scope (`DepositOnly` when `depositOnly`, otherwise
   * `AllExcludingCredit`) — populates the item picker `<select>`. Both scopes already guarantee
   * every entry shares the same deposit-shaped-or-not bucket, so there is no longer a per-item
   * rent/deposit target to pick or a "mixed category" case to guard against.
   */
  readonly lineItems = signal<LineItemResponse[]>([]);

  readonly frequencies: { value: RentFrequency; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'bi_monthly', label: 'Bi-Monthly' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'bi_weekly', label: 'Bi-Weekly' },
    { value: 'semesterly', label: 'Semi-Annual' },
    { value: 'custom', label: 'Custom' }
  ];

  readonly weekdays = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
  ];

  readonly dayOfMonthOptions: { value: number; label: string }[] = Array.from(
    { length: 31 },
    (_, i) => i + 1
  ).map((day) => ({ value: day, label: ordinal(day) }));

  readonly form: FormGroup;

  constructor(private readonly fb: FormBuilder, private readonly lineItemsService: LineItemsService) {
    this.form = this.fb.group({
      items: this.fb.array([this.buildItemGroup()]),
      notes: [''],
      alreadyPaid: [0, [Validators.required, Validators.min(0)]],
      attachedWithRentalInvoice: [false],
      isRecurring: [false],
      dueDate: [null as Date | null, Validators.required],
      frequency: ['monthly' as RentFrequency],
      dueOnDay: [1],
      dueOnDays: this.fb.array([this.fb.control(1), this.fb.control(15)]),
      dayOfWeek: [1],
      cycle: this.fb.array([
        this.fb.group({ month: [1], day: [1] }),
        this.fb.group({ month: [7], day: [1] })
      ]),
      dueDates: this.fb.array([this.fb.control(null as Date | null)]),
      startDate: [null as Date | null],
      endDate: [null as Date | null],
      hasNoEndDate: [false],
      isGrouped: [false],
      isSharedByAll: [true]
    });

    this.form.get('isRecurring')!.valueChanges.subscribe((isRecurring: boolean) => {
      const dueDate = this.form.get('dueDate')!;
      const startDate = this.form.get('startDate')!;

      if (isRecurring) {
        dueDate.clearValidators();
        dueDate.setValue(null);
        startDate.setValidators(Validators.required);
      } else {
        startDate.clearValidators();
        startDate.setValue(null);
        this.form.get('endDate')!.setValue(null);
        this.form.get('hasNoEndDate')!.setValue(false);
        dueDate.setValidators(Validators.required);
      }
      dueDate.updateValueAndValidity();
      startDate.updateValueAndValidity();
    });
  }

  ngOnInit(): void {
    if (this.depositOnly) {
      this.form.get('attachedWithRentalInvoice')!.setValue(false);
      this.form.get('attachedWithRentalInvoice')!.disable();
    }
    this.loadLineItems();
  }

  private loadLineItems(): void {
    if (!this.propertyOwnerId) {
      return;
    }

    const scope: LineItemScope = this.depositOnly ? 'DepositOnly' : 'AllExcludingCredit';

    this.lineItemsService.list(this.propertyOwnerId, scope).subscribe((items) => this.lineItems.set(items));
  }

  /**
   * Looks up a fetched catalog entry by id, for building the request payload in {@link create}.
   */
  private findLineItem(lineItemId: string): LineItemResponse | undefined {
    return this.lineItems().find((item) => item.id === lineItemId);
  }

  get items(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get isRecurring(): boolean {
    return this.form.get('isRecurring')!.value;
  }

  get frequency(): RentFrequency {
    return this.form.get('frequency')!.value;
  }

  get dueOnDays(): FormArray {
    return this.form.get('dueOnDays') as FormArray;
  }

  get cycle(): FormArray {
    return this.form.get('cycle') as FormArray;
  }

  get dueDates(): FormArray {
    return this.form.get('dueDates') as FormArray;
  }

  get subAmount(): number {
    return this.items.controls.reduce((sum, control) => sum + Number(control.get('amount')!.value || 0), 0);
  }

  get balanceDue(): number {
    return this.subAmount - Number(this.form.get('alreadyPaid')!.value || 0);
  }

  addItem(): void {
    this.items.push(this.buildItemGroup());
  }

  removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
    }
  }

  recalculateAmount(index: number): void {
    const group = this.items.at(index);
    const quantity = Number(group.get('quantity')!.value || 0);
    const rate = Number(group.get('rate')!.value || 0);
    group.get('amount')!.setValue(quantity * rate, { emitEvent: false });
  }

  addDueDate(): void {
    this.dueDates.push(this.fb.control(null as Date | null));
  }

  removeDueDate(index: number): void {
    this.dueDates.removeAt(index);
  }

  close(): void {
    this.closed.emit();
  }

  create(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.value;
    const isRecurring = !!value.isRecurring;

    const request: AdditionalChargeCreationRequest = {
      notes: value.notes || null,
      alreadyPaid: Number(value.alreadyPaid),
      attachedWithRentalInvoice: this.depositOnly ? false : !!value.attachedWithRentalInvoice,
      isRecurring,
      dueDate: isRecurring ? null : toIsoDate(value.dueDate),
      frequency: isRecurring ? value.frequency : null,
      frequencyConfig: isRecurring ? buildFrequencyConfig(value) : null,
      startDate: isRecurring ? toIsoDate(value.startDate) : null,
      endDate: isRecurring && !value.hasNoEndDate ? toIsoDate(value.endDate) : null,
      hasNoEndDate: isRecurring ? !!value.hasNoEndDate : false,
      isGrouped: !!value.isGrouped,
      isSharedByAll: !!value.isSharedByAll,
      items: value.items.map((item: any) => ({
        lineItemId: item.lineItemId,
        itemType: this.findLineItem(item.lineItemId)?.itemType ?? '',
        description: item.description,
        quantity: Number(item.quantity),
        rate: Number(item.rate),
        amount: Number(item.quantity) * Number(item.rate)
      }))
    };

    this.created.emit(request);
  }

  private buildItemGroup(): FormGroup {
    return this.fb.group({
      lineItemId: ['', Validators.required],
      description: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      rate: [0, [Validators.required, Validators.min(0.01)]],
      amount: [{ value: 0, disabled: true }]
    });
  }
}
