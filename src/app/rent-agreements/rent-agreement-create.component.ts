import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { provideNativeDateAdapter } from '@angular/material/core';
import { debounceTime } from 'rxjs';

import { RentScheduleService } from '../rent-schedule/rent-schedule.service';
import {
  CandidateDateRequest,
  LeaseTermType,
  PreviewRentScheduleResponse,
  RentFrequency
} from '../rent-schedule/rent-schedule.models';
import { buildFrequencyConfig, ordinal } from '../rent-schedule/frequency-config.util';
import { toIsoDate } from '../shared/date.util';
import { RentAgreementsService } from './rent-agreements.service';
import {
  AdditionalChargeCreationRequest,
  CreatedAdditionalCharge,
  CreateRentAgreementRequest,
  CreateRentAgreementResponse
} from './rent-agreement.models';
import { AdditionalChargePanelComponent } from './additional-charge-panel.component';

/**
 * The lease wizard's "Add Lease" save: previews a schedule, then persists the agreement with
 * those previewed rows via `POST /rent-agreements`. `CreateRentAgreementRequest` has no
 * `leaseTermType` field — the backend derives it from whether `endDate` is present — so the form's
 * `leaseTermType` control exists only to drive this component's own UI (which date fields to show,
 * whether to ask for a month-to-month invoice count) and is never sent on the wire.
 */
@Component({
  selector: 'app-rent-agreement-create',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    AdditionalChargePanelComponent
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './rent-agreement-create.component.html',
  styleUrl: './rent-agreement-create.component.scss'
})
export class RentAgreementCreateComponent {
  readonly frequencies: { value: RentFrequency; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'bi_monthly', label: 'Bi-Monthly' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'bi_weekly', label: 'Bi-Weekly' },
    { value: 'semesterly', label: 'Semi-Annual' },
    { value: 'custom', label: 'Custom' }
  ];

  readonly leaseTermTypes: { value: LeaseTermType; label: string }[] = [
    { value: 'fixed', label: 'Fixed Term' },
    { value: 'month_to_month', label: 'Month-to-Month' }
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

  readonly previewResult = signal<PreviewRentScheduleResponse | null>(null);
  readonly previewLoading = signal(false);
  readonly previewError = signal<string | null>(null);

  readonly candidateDates = signal<string[]>([]);
  readonly candidateDatesLoading = signal(false);

  readonly saveResult = signal<CreateRentAgreementResponse | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly additionalCharges = signal<AdditionalChargeCreationRequest[]>([]);

  /**
   * Display-only label per entry in {@link additionalCharges}, index-aligned — which panel a charge
   * was created from ('Rent' for the general panel, 'Deposit' for the deposit-only one). The
   * backend derives this itself per charge (`RentAgreementAdditionalChargeResponse.category`), but
   * this list is client-side, pre-submission, so there's no server response to read it from yet;
   * `AdditionalChargeCreationRequest` itself carries no category field (removed 2026-08-05, spec
   * 02-invoicing.md v6 — items now carry `lineItemId`/`itemType` instead).
   */
  readonly additionalChargeTargets = signal<('Rent' | 'Deposit')[]>([]);

  readonly showAdditionalChargePanel = signal(false);
  readonly showDepositChargePanel = signal(false);

  /** Index into `previewResult().rows` currently open for inline editing, or `null` if none. */
  readonly editingRowIndex = signal<number | null>(null);
  readonly editRowDueDate = signal('');
  readonly editRowRent = signal<number | null>(null);
  readonly editRowError = signal<string | null>(null);

  /**
   * A snapshot of the schedule-affecting fields as of the last successful preview. Used to tell a
   * change to a schedule-irrelevant field (deposit, property ids) apart from one that actually
   * invalidates the previewed rows.
   */
  private lastPreviewSignature: string | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly rentScheduleService: RentScheduleService,
    private readonly rentAgreementsService: RentAgreementsService
  ) {
    this.form = this.fb.group({
      propertyUnitId: [crypto.randomUUID(), Validators.required],
      propertyId: [crypto.randomUUID(), Validators.required],
      propertyOwnerId: [crypto.randomUUID(), Validators.required],
      startDate: [null as Date | null, Validators.required],
      endDate: [null as Date | null],
      leaseTermType: ['fixed' as LeaseTermType, Validators.required],
      rent: [100, [Validators.required, Validators.min(0)]],
      frequency: ['monthly' as RentFrequency, Validators.required],
      firstRentalDueDate: [null as Date | string | null, Validators.required],
      monthToMonthInvoiceCount: [12],
      nextLeaseStartDate: [null as Date | null],
      deposit: [null],
      depositDueDate: [null as Date | null],
      depositCollected: [false],
      dueOnDay: [1],
      dueOnDays: this.fb.array([this.fb.control(1), this.fb.control(15)]),
      dayOfWeek: [1],
      cycle: this.fb.array([
        this.fb.group({ month: [1], day: [1] }),
        this.fb.group({ month: [7], day: [1] })
      ]),
      dueDates: this.fb.array([this.fb.control(null as Date | null)])
    });

    this.form
      .get('startDate')!
      .valueChanges.pipe(takeUntilDestroyed())
      .subscribe((startDate: Date | null) => {
        if (startDate && this.form.get('leaseTermType')!.value === 'fixed') {
          this.form.get('endDate')!.setValue(RentAgreementCreateComponent.addOneYear(startDate));
        }
      });

    this.form
      .get('deposit')!
      .valueChanges.pipe(takeUntilDestroyed())
      .subscribe((deposit: number | string | null) => {
        if ((deposit === null || deposit === '' || Number(deposit) <= 0) && this.form.get('depositCollected')!.value) {
          this.form.get('depositCollected')!.setValue(false);
        }
      });

    this.form.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      if (this.previewResult() && this.scheduleSignature() !== this.lastPreviewSignature) {
        this.previewResult.set(null);
        this.saveResult.set(null);
      }
      this.refreshCandidateDates();
    });
    this.refreshCandidateDates();
  }

  get frequency(): RentFrequency {
    return this.form.get('frequency')!.value;
  }

  get leaseTermType(): LeaseTermType {
    return this.form.get('leaseTermType')!.value;
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

  addDueDate(): void {
    this.dueDates.push(this.fb.control(null as Date | null));
  }

  removeDueDate(index: number): void {
    this.dueDates.removeAt(index);
  }

  openAdditionalChargePanel(): void {
    this.showAdditionalChargePanel.set(true);
  }

  closeAdditionalChargePanel(): void {
    this.showAdditionalChargePanel.set(false);
  }

  openDepositChargePanel(): void {
    this.showDepositChargePanel.set(true);
  }

  closeDepositChargePanel(): void {
    this.showDepositChargePanel.set(false);
  }

  /**
   * The panel keeps Rent-flavored and Deposit-flavored items in separate groups (a single charge
   * can never mix categories — backend `MixedAdditionalChargeItemType`), so one "Add Additional
   * Fee" submission can emit up to two charges here, one per non-empty group.
   */
  onAdditionalChargeCreated(charges: CreatedAdditionalCharge[]): void {
    for (const { charge, target } of charges) {
      this.appendAdditionalCharge(charge, target);
    }
    this.showAdditionalChargePanel.set(false);
  }

  onDepositChargeCreated(charges: CreatedAdditionalCharge[]): void {
    for (const { charge, target } of charges) {
      this.appendAdditionalCharge(charge, target);
    }
    this.showDepositChargePanel.set(false);
  }

  private appendAdditionalCharge(charge: AdditionalChargeCreationRequest, target: 'Rent' | 'Deposit'): void {
    this.additionalCharges.update((charges) => [...charges, charge]);
    this.additionalChargeTargets.update((targets) => [...targets, target]);
  }

  removeAdditionalCharge(index: number): void {
    this.additionalCharges.update((charges) => charges.filter((_, i) => i !== index));
    this.additionalChargeTargets.update((targets) => targets.filter((_, i) => i !== index));
  }

  additionalChargeTotal(charge: AdditionalChargeCreationRequest): number {
    return charge.items.reduce((sum, item) => sum + item.amount, 0);
  }

  generatePreview(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.previewLoading.set(true);
    this.previewError.set(null);
    this.previewResult.set(null);
    this.saveResult.set(null);

    const value = this.form.value;

    this.rentScheduleService
      .preview({
        startDate: toIsoDate(value.startDate)!,
        endDate: value.leaseTermType === 'fixed' ? toIsoDate(value.endDate) : null,
        leaseTermType: value.leaseTermType,
        rent: Number(value.rent),
        frequency: value.frequency,
        firstRentalDueDate: toIsoDate(value.firstRentalDueDate)!,
        frequencyConfig: buildFrequencyConfig(value),
        monthToMonthInvoiceCount:
          value.leaseTermType === 'month_to_month' ? Number(value.monthToMonthInvoiceCount) : null,
        nextLeaseStartDate:
          value.leaseTermType === 'month_to_month' ? toIsoDate(value.nextLeaseStartDate) : null
      })
      .subscribe({
        next: (response) => {
          this.previewResult.set(response);
          this.lastPreviewSignature = this.scheduleSignature();
          this.previewLoading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.previewError.set(RentAgreementCreateComponent.describeError(err));
          this.previewLoading.set(false);
        }
      });
  }

  /**
   * Opens row `index` of the previewed schedule for inline editing (due date + rent). The
   * scheduled date itself is not editable — it's the row's identity, matching how the backend's
   * own override mechanism keys a row (`ScheduleOverride.scheduledDate`); editing it here would
   * effectively create a new row rather than adjust an existing one.
   */
  startEditRow(index: number): void {
    const row = this.previewResult()?.rows[index];
    if (!row) {
      return;
    }

    this.editingRowIndex.set(index);
    this.editRowDueDate.set(row.dueDate);
    this.editRowRent.set(row.rent);
    this.editRowError.set(null);
  }

  cancelEditRow(): void {
    this.editingRowIndex.set(null);
    this.editRowError.set(null);
  }

  /**
   * Commits the in-progress edit back into `previewResult()`. The backend never regenerates or
   * re-validates `scheduleRows` against `frequencyConfig` on save (rows are persisted verbatim), so
   * adjusting a row here client-side before saving is equivalent to the API's own override support
   * — no extra preview round-trip is required.
   */
  saveEditRow(index: number): void {
    const preview = this.previewResult();
    const dueDate = this.editRowDueDate();
    const rent = this.editRowRent();

    if (!preview) {
      return;
    }
    if (!dueDate) {
      this.editRowError.set('Due date is required.');
      return;
    }
    if (rent === null || Number(rent) <= 0) {
      this.editRowError.set('Rent must be greater than 0.');
      return;
    }

    const rows = preview.rows.map((row, i) => (i === index ? { ...row, dueDate, rent: Number(rent) } : row));

    this.previewResult.set({
      ...preview,
      rows,
      totalAmount: rows.reduce((sum, row) => sum + row.rent, 0)
    });

    this.editingRowIndex.set(null);
    this.editRowError.set(null);
  }

  save(): void {
    const preview = this.previewResult();
    if (!preview) {
      return;
    }

    const value = this.form.value;

    if ((value.deposit === null || value.deposit === '') !== !value.depositDueDate) {
      this.saveError.set('Deposit and deposit due date must both be provided, or both left blank.');
      return;
    }

    if (value.depositCollected && !(Number(value.deposit) > 0 && value.depositDueDate)) {
      this.saveError.set('Deposit collected can only be checked when a positive deposit and due date are set.');
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.saveResult.set(null);

    const request: CreateRentAgreementRequest = {
      propertyUnitId: value.propertyUnitId,
      propertyId: value.propertyId,
      propertyOwnerId: value.propertyOwnerId,
      startDate: toIsoDate(value.startDate)!,
      endDate: value.leaseTermType === 'fixed' ? toIsoDate(value.endDate) : null,
      fullRent: Number(value.rent),
      frequency: value.frequency,
      frequencyConfig: buildFrequencyConfig(value),
      firstRentalDueDate: toIsoDate(value.firstRentalDueDate)!,
      deposit: value.deposit !== null && value.deposit !== '' ? Number(value.deposit) : null,
      depositDueDate: toIsoDate(value.depositDueDate),
      depositCollected: Boolean(value.depositCollected),
      scheduleRows: preview.rows.map((row) => ({
        scheduledDate: row.scheduledDate,
        dueDate: row.dueDate,
        rent: row.rent
      })),
      additionalCharges: this.additionalCharges()
    };

    this.rentAgreementsService.create(request).subscribe({
      next: (response) => {
        this.saveResult.set(response);
        this.saving.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.saveError.set(RentAgreementCreateComponent.describeError(err));
        this.saving.set(false);
      }
    });
  }

  /**
   * A stable JSON snapshot of every field that feeds `preview()`/`save()`'s schedule — everything
   * except deposit/property fields, which don't change the rows a preview would produce.
   */
  private scheduleSignature(): string {
    const value = this.form.value;
    return JSON.stringify({
      startDate: toIsoDate(value.startDate),
      endDate: value.leaseTermType === 'fixed' ? toIsoDate(value.endDate) : null,
      leaseTermType: value.leaseTermType,
      rent: value.rent,
      frequency: value.frequency,
      firstRentalDueDate: toIsoDate(value.firstRentalDueDate),
      dueOnDay: value.dueOnDay,
      dueOnDays: value.dueOnDays,
      dayOfWeek: value.dayOfWeek,
      cycle: value.cycle,
      dueDates: value.dueDates.map(toIsoDate),
      monthToMonthInvoiceCount:
        value.leaseTermType === 'month_to_month' ? value.monthToMonthInvoiceCount : null,
      nextLeaseStartDate:
        value.leaseTermType === 'month_to_month' ? toIsoDate(value.nextLeaseStartDate) : null
    });
  }

  private refreshCandidateDates(): void {
    const value = this.form.value;

    const canRequestOptions =
      value.frequency !== 'custom' &&
      !!value.startDate &&
      (value.leaseTermType === 'fixed' ? !!value.endDate : !!value.monthToMonthInvoiceCount);

    if (!canRequestOptions) {
      this.candidateDates.set([]);
      this.candidateDatesLoading.set(false);
      return;
    }

    const request: CandidateDateRequest = {
      startDate: toIsoDate(value.startDate)!,
      endDate: value.leaseTermType === 'fixed' ? toIsoDate(value.endDate) : null,
      leaseTermType: value.leaseTermType,
      frequency: value.frequency,
      frequencyConfig: buildFrequencyConfig(value),
      monthToMonthInvoiceCount:
        value.leaseTermType === 'month_to_month' ? Number(value.monthToMonthInvoiceCount) : null,
      nextLeaseStartDate:
        value.leaseTermType === 'month_to_month' ? toIsoDate(value.nextLeaseStartDate) : null
    };

    this.candidateDatesLoading.set(true);

    this.rentScheduleService.firstRentalDueDateOptions(request).subscribe({
      next: (response) => {
        const dates = response.dates;
        this.candidateDates.set(dates);
        this.candidateDatesLoading.set(false);

        const currentSelection = this.form.get('firstRentalDueDate')!.value;
        if (dates.length > 0 && !dates.includes(currentSelection)) {
          this.form.get('firstRentalDueDate')!.setValue(null, { emitEvent: false });
        }
      },
      error: () => {
        this.candidateDates.set([]);
        this.candidateDatesLoading.set(false);
      }
    });
  }

  /**
   * Renders a user-facing message for a failed request. A 400 is a malformed/structurally invalid
   * body; a 422 is a domain-rule violation (e.g. the deposit pairing rule) — both carry an RFC 9457
   * Problem Details body whose `detail` names the problem (see `RentAgreementController`).
   */
  private static describeError(err: HttpErrorResponse): string {
    if (err.status === 0) {
      return 'Could not reach the API. Is it running and is CORS configured for this origin?';
    }

    const detail = err.error?.detail;
    return typeof detail === 'string' && detail.length > 0
      ? detail
      : `Request failed: ${err.status} ${err.statusText}`;
  }

  /**
   * Adds one year to a date, returning a new `Date` (leaves the input untouched).
   */
  private static addOneYear(date: Date): Date {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + 1);
    return result;
  }
}
