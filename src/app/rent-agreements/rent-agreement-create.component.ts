import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { provideNativeDateAdapter } from '@angular/material/core';
import { debounceTime } from 'rxjs';

import { RentScheduleService } from '../rent-schedule/rent-schedule.service';
import {
  CandidateDateRequest,
  ExistingScheduleRowInput,
  LeaseTermType,
  PreviewRentScheduleResponse,
  RentFrequency
} from '../rent-schedule/rent-schedule.models';
import { buildFrequencyConfig, frequencyConfigToFormValue, ordinal } from '../rent-schedule/frequency-config.util';
import { parseIsoDate, toIsoDate } from '../shared/date.util';
import { RentAgreementsService } from './rent-agreements.service';
import {
  AdditionalChargeCreationRequest,
  CreateRentAgreementRequest,
  CreateRentAgreementResponse,
  RentAgreementDetailResponse,
  ScheduleRowStatus,
  UpdateRentAgreementTermsRequest,
  toChargeCreationRequest
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

  /** Index into `additionalCharges()` currently open for editing, or `null` when adding a new one. */
  readonly editingChargeIndex = signal<number | null>(null);

  /** The charge passed as `[initialCharge]` to whichever panel is open, or `null` for a fresh add. */
  get editingCharge(): AdditionalChargeCreationRequest | null {
    const index = this.editingChargeIndex();
    return index !== null ? this.additionalCharges()[index] : null;
  }

  /** Index into `previewResult().rows` currently open for inline editing, or `null` if none. */
  readonly editingRowIndex = signal<number | null>(null);
  readonly editRowDueDate = signal('');
  readonly editRowRent = signal<number | null>(null);
  readonly editRowError = signal<string | null>(null);

  /** Index of the row whose kebab (⋮) menu is currently open, or `null` if none. */
  readonly openRowMenuIndex = signal<number | null>(null);

  /**
   * Viewport coordinates for the open row menu, computed from the clicked kebab button's
   * `getBoundingClientRect()`. The menu itself renders as a `position: fixed` sibling of the
   * (`max-height` + `overflow-y: auto`) schedule table wrapper rather than a child of any row —
   * an ancestor's `overflow` clips *any* descendant's paint, `position: fixed` included, so a menu
   * nested inside that scrolling wrapper would get cut off for rows near its bottom edge.
   */
  readonly rowMenuPosition = signal<{ top: number; left: number } | null>(null);

  /**
   * `scheduledDate`s of rows whose **rent** the user has hand-edited, sent to the backend as each
   * row's `isManualChanged`. Keyed by `scheduledDate` because that is the row's immutable identity,
   * unaffected by editing the due date.
   *
   * Deliberately **not** set by a due-date-only edit. The backend needs no flag for that case — it
   * compares `dueDate` against the `scheduledDate` anchor — so flagging it here would wrongly freeze
   * the row's amount against regeneration.
   */
  readonly manuallyChangedRowDates = signal<Set<string>>(new Set());

  /**
   * The agreement being edited, taken from the `:id` route parameter, or `null` when creating.
   * Everything that differs between the two modes keys off this.
   */
  readonly agreementId = signal<string | null>(null);

  readonly loadingAgreement = signal(false);
  readonly loadError = signal<string | null>(null);

  /**
   * The saved agreement as last loaded from the server. Kept so the save can send back rows and
   * charges with their real ids (decision E2) rather than re-creating them.
   */
  readonly loadedAgreement = signal<RentAgreementDetailResponse | null>(null);

  /** `scheduledDate`s of loaded rows the server marked frozen — locked, and not removable. */
  readonly frozenRowDates = signal<Set<string>>(new Set());

  /**
   * `scheduledDate`s of every cancelled row — the component's **single** source of truth for
   * cancellation, and never computed by correlating dates or positions itself. It is set from an
   * authoritative status the server reported: `status === 'Cancelled'` on a preview row (backend spec
   * v46/v47) or on a loaded/saved agreement row, plus the user's own click in `deleteRow()`.
   *
   * There is deliberately no second "deleted this session" set. The backend treats a submitted
   * `isCancelled: true` as decisive regardless of the row's stored status (spec v47), so every
   * cancelled row is sent the same way on Save and the client needs no notion of *which kind* of
   * cancellation it is.
   */
  readonly cancelledRowDates = signal<Set<string>>(new Set());

  /** `id`s of loaded additional charges the server marked applied (already invoiced) — locked, and not editable/removable. */
  readonly appliedChargeIds = signal<Set<string>>(new Set());

  get isEditMode(): boolean {
    return this.agreementId() !== null;
  }

  /**
   * A snapshot of the schedule-affecting fields as of the last successful preview. Used to tell a
   * change to a schedule-irrelevant field (deposit, property ids) apart from one that actually
   * invalidates the previewed rows.
   */
  private lastPreviewSignature: string | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly rentScheduleService: RentScheduleService,
    private readonly rentAgreementsService: RentAgreementsService,
    private readonly route: ActivatedRoute
  ) {
    const today = new Date();

    this.form = this.fb.group({
      propertyUnitId: [crypto.randomUUID(), Validators.required],
      propertyId: [crypto.randomUUID(), Validators.required],
      propertyOwnerId: [crypto.randomUUID(), Validators.required],
      startDate: [today as Date | null, Validators.required],
      endDate: [RentAgreementCreateComponent.addSixMonths(today) as Date | null],
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
          this.form.get('endDate')!.setValue(RentAgreementCreateComponent.addSixMonths(startDate));
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
      if (this.scheduleSignature() !== this.lastPreviewSignature) {
        this.saveResult.set(null);
      }
      this.refreshCandidateDates();
      this.maybeAutoGeneratePreview();
    });

    const routeAgreementId = this.route.snapshot.paramMap.get('id');
    if (routeAgreementId) {
      this.agreementId.set(routeAgreementId);
      this.loadAgreement(routeAgreementId);
      return;
    }

    this.refreshCandidateDates();
    this.maybeAutoGeneratePreview();
  }

  /**
   * Loads a saved agreement into the form for editing.
   *
   * The delicate part is the schedule table: the loaded rows are the *persisted* ones, carrying real
   * ids, hand-edited amounts and frozen flags. Patching the form fires `valueChanges`, which would
   * normally auto-preview and replace them with freshly generated rows — silently discarding all of
   * that. Stamping `lastPreviewSignature` with the loaded terms makes `maybeAutoGeneratePreview`
   * treat them as already previewed, so a regeneration only happens once the user actually changes
   * a schedule-affecting field.
   */
  private loadAgreement(agreementId: string): void {
    this.loadingAgreement.set(true);
    this.loadError.set(null);

    this.rentAgreementsService.getById(agreementId).subscribe({
      next: (agreement) => {
        this.loadedAgreement.set(agreement);

        this.form.patchValue(
          {
            propertyUnitId: agreement.propertyUnitId,
            propertyId: agreement.propertyId,
            propertyOwnerId: agreement.propertyOwnerId,
            startDate: parseIsoDate(agreement.startDate),
            endDate: parseIsoDate(agreement.endDate),
            leaseTermType: agreement.leaseTermType,
            rent: agreement.fullRent,
            frequency: agreement.frequency,
            firstRentalDueDate: agreement.firstRentalDueDate,
            deposit: agreement.deposit ?? null,
            depositDueDate: parseIsoDate(agreement.depositDueDate),
            depositCollected: agreement.depositCollected,
            ...frequencyConfigToFormValue(agreement.frequencyConfig)
          },
          { emitEvent: false }
        );

        this.previewResult.set({
          rows: agreement.scheduleRows.map((row) => ({
            scheduledDate: row.scheduledDate,
            dueDate: row.dueDate,
            rent: row.rent
          })),
          totalInvoices: agreement.scheduleRows.filter((r) => !RentAgreementCreateComponent.isCancelledStatus(r.status)).length,
          totalAmount: agreement.scheduleRows
            .filter((r) => !RentAgreementCreateComponent.isCancelledStatus(r.status))
            .reduce((sum, row) => sum + row.rent, 0)
        });

        this.manuallyChangedRowDates.set(
          new Set(agreement.scheduleRows.filter((r) => r.isManualChanged).map((r) => r.scheduledDate))
        );
        this.frozenRowDates.set(
          new Set(agreement.scheduleRows.filter((r) => r.isFrozen).map((r) => r.scheduledDate))
        );
        this.cancelledRowDates.set(
          new Set(
            agreement.scheduleRows
              .filter((r) => RentAgreementCreateComponent.isCancelledStatus(r.status))
              .map((r) => r.scheduledDate)
          )
        );
        this.additionalCharges.set(agreement.additionalCharges.map(toChargeCreationRequest));
        this.additionalChargeTargets.set(agreement.additionalCharges.map((c) => c.category));
        this.appliedChargeIds.set(
          new Set(agreement.additionalCharges.filter((c) => c.isApplied).map((c) => c.id))
        );

        // Treat the loaded terms as already previewed — see the doc comment above.
        this.lastPreviewSignature = this.scheduleSignature();
        this.loadingAgreement.set(false);
        this.refreshCandidateDates();
      },
      error: (err: HttpErrorResponse) => {
        this.loadError.set(
          err.status === 404
            ? `No rent agreement found with id ${agreementId}.`
            : RentAgreementCreateComponent.describeError(err)
        );
        this.loadingAgreement.set(false);
      }
    });
  }

  /** Whether a loaded row is frozen by the server — its rent and dates cannot be changed. */
  isRowFrozen(scheduledDate: string): boolean {
    return this.frozenRowDates().has(scheduledDate);
  }

  /** Whether a loaded row is already cancelled by the server — display-only, no row-menu. */
  isRowCancelled(scheduledDate: string): boolean {
    return this.cancelledRowDates().has(scheduledDate);
  }

  /** Whether a loaded additional charge is already applied (invoiced) — cannot be edited or removed. */
  isChargeApplied(index: number): boolean {
    const id = this.additionalCharges()[index]?.id;
    return !!id && this.appliedChargeIds().has(id);
  }

  get frequency(): RentFrequency {
    return this.form.get('frequency')!.value;
  }

  get leaseTermType(): LeaseTermType {
    return this.form.get('leaseTermType')!.value;
  }

  /**
   * The lease's own start/end date and (when month-to-month) invoice count, passed down to
   * `AdditionalChargePanelComponent` so its recurring Start Date/End Date can be presented as a
   * candidate-date `<select>` rather than a free-form calendar — see that component's
   * `leaseStartDate` doc comment for why.
   */
  get formStartDateIso(): string | null {
    return toIsoDate(this.form.get('startDate')!.value);
  }

  get formEndDateIso(): string | null {
    return this.leaseTermType === 'fixed' ? toIsoDate(this.form.get('endDate')!.value) : null;
  }

  get formMonthToMonthInvoiceCount(): number | null {
    return this.leaseTermType === 'month_to_month'
      ? Number(this.form.get('monthToMonthInvoiceCount')!.value)
      : null;
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
    this.editingChargeIndex.set(null);
  }

  openDepositChargePanel(): void {
    this.showDepositChargePanel.set(true);
  }

  closeDepositChargePanel(): void {
    this.showDepositChargePanel.set(false);
    this.editingChargeIndex.set(null);
  }

  /** Reopens row `index` of the running additional-charges list for editing, in whichever panel matches its target. */
  editAdditionalCharge(index: number): void {
    this.editingChargeIndex.set(index);
    if (this.additionalChargeTargets()[index] === 'Deposit') {
      this.showDepositChargePanel.set(true);
    } else {
      this.showAdditionalChargePanel.set(true);
    }
  }

  onAdditionalChargeCreated(charge: AdditionalChargeCreationRequest): void {
    this.upsertAdditionalCharge(charge, 'Rent');
    this.showAdditionalChargePanel.set(false);
  }

  onDepositChargeCreated(charge: AdditionalChargeCreationRequest): void {
    this.upsertAdditionalCharge(charge, 'Deposit');
    this.showDepositChargePanel.set(false);
  }

  private upsertAdditionalCharge(charge: AdditionalChargeCreationRequest, target: 'Rent' | 'Deposit'): void {
    const editIndex = this.editingChargeIndex();
    if (editIndex !== null) {
      this.additionalCharges.update((charges) => charges.map((c, i) => (i === editIndex ? charge : c)));
      this.additionalChargeTargets.update((targets) => targets.map((t, i) => (i === editIndex ? target : t)));
      this.editingChargeIndex.set(null);
    } else {
      this.additionalCharges.update((charges) => [...charges, charge]);
      this.additionalChargeTargets.update((targets) => [...targets, target]);
    }
  }

  removeAdditionalCharge(index: number): void {
    this.additionalCharges.update((charges) => charges.filter((_, i) => i !== index));
    this.additionalChargeTargets.update((targets) => targets.filter((_, i) => i !== index));
  }

  additionalChargeTotal(charge: AdditionalChargeCreationRequest): number {
    return charge.items.reduce((sum, item) => sum + item.amount, 0);
  }

  /**
   * Auto-triggers a preview once every field the request needs is filled in — there is no manual
   * "Generate Preview" button; the schedule simply appears as soon as it can be computed. Guarded
   * against re-firing for a combination already previewed (`lastPreviewSignature`) and against
   * overlapping calls while one is still in flight.
   */
  private maybeAutoGeneratePreview(): void {
    if (this.previewLoading()) {
      return;
    }
    if (this.scheduleSignature() === this.lastPreviewSignature) {
      return;
    }
    if (!this.canGeneratePreview()) {
      return;
    }
    this.generatePreview();
  }

  /**
   * Whether every field `preview()`'s request needs is actually filled in. Deliberately stricter
   * than `this.form.invalid` — `endDate`, `monthToMonthInvoiceCount`, and the per-frequency
   * `frequencyConfig` fields (`dueOnDay`, `dueOnDays`, `dayOfWeek`, `cycle`, `dueDates`) carry no
   * `Validators.required` of their own (their relevance depends on `leaseTermType`/`frequency`), so
   * the form can be Angular-"valid" while still missing what the API actually requires.
   */
  private canGeneratePreview(): boolean {
    const value = this.form.value;

    if (!value.startDate || !value.firstRentalDueDate || !(Number(value.rent) > 0)) {
      return false;
    }
    if (value.leaseTermType === 'fixed' && !value.endDate) {
      return false;
    }
    if (value.leaseTermType === 'month_to_month' && !value.monthToMonthInvoiceCount) {
      return false;
    }

    switch (value.frequency as RentFrequency) {
      case 'monthly':
        return !!value.dueOnDay;
      case 'bi_monthly':
        return (value.dueOnDays as unknown[]).every((day) => !!day);
      case 'weekly':
      case 'bi_weekly':
        return value.dayOfWeek !== null && value.dayOfWeek !== undefined && value.dayOfWeek !== '';
      case 'semesterly':
        return (value.cycle as { month: unknown; day: unknown }[]).every((entry) => !!entry.month && !!entry.day);
      case 'custom':
        return (value.dueDates as unknown[]).some((date) => !!date);
      default:
        return false;
    }
  }

  generatePreview(): void {
    if (!this.canGeneratePreview()) {
      return;
    }

    // Captured before the reset below clears `previewResult` — this is what the request sends AND
    // the caller-known row state the backend correlates the fresh schedule against (spec v46/v47).
    const existingRows = this.buildExistingRows();

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
          value.leaseTermType === 'month_to_month' ? toIsoDate(value.nextLeaseStartDate) : null,
        existingRows: existingRows.length > 0 ? existingRows : undefined
      })
      .subscribe({
        next: (response) => {
          // The backend decides which row is cancelled and computes totals excluding those rows
          // (backend spec v46/v47), correlating the `existingRows` this call just sent against the
          // freshly generated schedule anchor-first, position-second. This component therefore does no
          // correlation of its own — it reads the status it was given. That is the whole point of the
          // v46/v47 move: no date-matching, position-matching, or row-count reasoning lives here.
          this.previewResult.set(response);
          this.lastPreviewSignature = this.scheduleSignature();
          this.previewLoading.set(false);
          // A hand-edited row's amount is deliberately NOT preserved — any schedule-affecting change
          // takes the fresh computed value for every row and resets `manuallyChangedRowDates`, mirroring
          // the backend's reversed D4/D12 rule (spec v44).
          this.manuallyChangedRowDates.set(new Set());
          this.cancelledRowDates.set(
            new Set(
              response.rows
                .filter((row) => RentAgreementCreateComponent.isCancelledStatus(row.status))
                .map((row) => row.scheduledDate)
            )
          );
          this.closeRowMenu();
        },
        error: (err: HttpErrorResponse) => {
          this.previewError.set(RentAgreementCreateComponent.describeError(err));
          this.previewLoading.set(false);
        }
      });
  }

  /**
   * Builds the `existingRows` the preview request sends so the backend can derive each fresh row's
   * status (backend spec v46) — every row currently in `previewResult()`, tagged `'Cancelled'` when
   * the client currently tracks it as deleted (this session) or already cancelled (on the server),
   * `'Planned'` otherwise. Empty for the very first preview of a brand-new lease, when there is nothing
   * to correlate against yet.
   */
  private buildExistingRows(): ExistingScheduleRowInput[] {
    const preview = this.previewResult();
    if (!preview) {
      return [];
    }

    return preview.rows.map((row) => ({
      scheduledDate: row.scheduledDate,
      dueDate: row.dueDate,
      rent: row.rent,
      isManualChanged: this.manuallyChangedRowDates().has(row.scheduledDate),
      status: this.cancelledRowDates().has(row.scheduledDate) ? 'Cancelled' : 'Planned',
      invoiceStatus: null,
      invoiceDueDate: null
    }));
  }

  toggleRowMenu(index: number, event: MouseEvent): void {
    if (this.openRowMenuIndex() === index) {
      this.closeRowMenu();
      return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.rowMenuPosition.set({ top: rect.bottom, left: rect.right - 110 });
    this.openRowMenuIndex.set(index);
  }

  closeRowMenu(): void {
    this.openRowMenuIndex.set(null);
    this.rowMenuPosition.set(null);
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
    this.closeRowMenu();
  }

  cancelEditRow(): void {
    this.editingRowIndex.set(null);
    this.editRowError.set(null);
  }

  /**
   * `editRowDueDate` is stored as an ISO "YYYY-MM-DD" string (matching `ScheduleRow.dueDate`), but
   * `mat-datepicker` (with `provideNativeDateAdapter()`, same as every other date field on this
   * form) works in terms of native `Date` objects — this is the one place that ISO string needs to
   * become a `Date` for display, parsed in local time to match `toIsoDate`'s own local-time
   * formatting (avoids the UTC-shift-by-a-day bug plain `new Date(iso)` has).
   */
  editRowDueDateAsDate(): Date | null {
    const iso = this.editRowDueDate();
    if (!iso) {
      return null;
    }
    return new Date(`${iso}T00:00:00`);
  }

  onEditRowDueDateChange(date: Date | null): void {
    this.editRowDueDate.set(toIsoDate(date) ?? '');
  }

  /**
   * Cancels a row (kebab menu → Delete). The row stays visible, greyed out, with a Restore
   * affordance; on Save it is sent flagged `isCancelled: true` rather than omitted, so the backend
   * applies any edit made to it first and then cancels it (backend spec v45).
   */
  deleteRow(scheduledDate: string): void {
    this.cancelledRowDates.update((dates) => new Set(dates).add(scheduledDate));
    this.closeRowMenu();
    if (this.editingRowIndex() !== null) {
      this.cancelEditRow();
    }
  }

  /**
   * Un-cancels a row, whether it was cancelled a moment ago in this session or came back cancelled
   * from the server — the two are handled identically, because the backend restores a cancelled row
   * precisely when it is resubmitted *without* the `isCancelled` flag (backend spec v47).
   */
  restoreRow(scheduledDate: string): void {
    this.cancelledRowDates.update((dates) => {
      const next = new Set(dates);
      next.delete(scheduledDate);
      return next;
    });
    this.closeRowMenu();
  }

  /**
   * Kept as the name the cancelled-row template branch calls; identical to {@link restoreRow} now that
   * a server-reported cancellation and a this-session one are the same thing to this component.
   */
  restoreCancelledRow(scheduledDate: string): void {
    this.restoreRow(scheduledDate);
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

    const target = preview.rows[index];
    const newRent = Number(rent);

    // Only an actual change to the AMOUNT flags the row. Moving the due date, or re-saving the
    // dialog without touching the rent, must leave the flag alone — see `manuallyChangedRowDates`.
    if (target && newRent !== target.rent) {
      this.manuallyChangedRowDates.update((dates) => new Set(dates).add(target.scheduledDate));
    }

    const rows = preview.rows.map((row, i) => (i === index ? { ...row, dueDate, rent: newRent } : row));

    this.previewResult.set({
      ...preview,
      rows,
      totalAmount: rows.reduce((sum, row) => sum + row.rent, 0)
    });

    this.editingRowIndex.set(null);
    this.editRowError.set(null);
  }

  /** Whether a row's rent was hand-edited — drives both the table's badge and the save payload. */
  isRowManuallyChanged(scheduledDate: string): boolean {
    return this.manuallyChangedRowDates().has(scheduledDate);
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

    const editingId = this.agreementId();
    if (editingId) {
      this.saveEdit(editingId, value, preview);
      return;
    }

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
      // Every previewed row is sent — a row the user removed via the kebab menu's Delete is still
      // submitted, flagged isCancelled, so the backend persists it directly with a Cancelled status
      // (spec v39) instead of it never existing.
      scheduleRows: preview.rows.map((row) => ({
        scheduledDate: row.scheduledDate,
        dueDate: row.dueDate,
        rent: row.rent,
        isManualChanged: this.manuallyChangedRowDates().has(row.scheduledDate),
        isCancelled: this.cancelledRowDates().has(row.scheduledDate)
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
   * Saves an edit through `PUT /rent-agreements/{id}/terms`.
   *
   * Both collections are sent **complete** — every row and every charge, changed or not (decisions
   * D8 / E1). A row or charge the user removed is simply absent, which is how the server is told to
   * delete it, so these lists must never be filtered down to "just what changed".
   *
   * Only the schedule-affecting terms are included (decision D3): `startDate`, the property/owner
   * ids and the deposit fields are not editable here, so they are deliberately not sent even though
   * the form still holds them.
   */
  private saveEdit(agreementId: string, value: any, preview: PreviewRentScheduleResponse): void {
    const request: UpdateRentAgreementTermsRequest = {
      endDate: value.leaseTermType === 'fixed' ? toIsoDate(value.endDate) : null,
      fullRent: Number(value.rent),
      frequency: value.frequency,
      frequencyConfig: buildFrequencyConfig(value),
      firstRentalDueDate: toIsoDate(value.firstRentalDueDate)!,
      // EVERY row is sent, cancelled or not — no filtering. A cancelled row goes up flagged
      // `isCancelled: true`, which the backend treats as decisive whatever the row's stored status
      // (spec v47): an already-cancelled row stays cancelled, and a freshly-cancelled one is cancelled
      // after its in-flight edits are applied (spec v45). Un-cancelling is expressed by the same row
      // going up with the flag `false`, which is the restore signal (spec v42). This is why the client
      // no longer needs to know whether a cancellation originated here or on the server.
      scheduleRows: preview.rows.map((row) => ({
        scheduledDate: row.scheduledDate,
        dueDate: row.dueDate,
        rent: row.rent,
        isManualChanged: this.manuallyChangedRowDates().has(row.scheduledDate),
        isCancelled: this.cancelledRowDates().has(row.scheduledDate)
      })),
      additionalCharges: this.additionalCharges()
    };

    this.rentAgreementsService.updateTerms(agreementId, request).subscribe({
      next: (agreement) => {
        // Re-seed from the server's response: rows and charges come back with their real ids and
        // refreshed frozen flags, and rows the reconcile removed are simply gone.
        this.loadedAgreement.set(agreement);
        this.previewResult.set({
          rows: agreement.scheduleRows.map((row) => ({
            scheduledDate: row.scheduledDate,
            dueDate: row.dueDate,
            rent: row.rent
          })),
          totalInvoices: agreement.scheduleRows.filter((r) => !RentAgreementCreateComponent.isCancelledStatus(r.status)).length,
          totalAmount: agreement.scheduleRows
            .filter((r) => !RentAgreementCreateComponent.isCancelledStatus(r.status))
            .reduce((sum, row) => sum + row.rent, 0)
        });
        this.manuallyChangedRowDates.set(
          new Set(agreement.scheduleRows.filter((r) => r.isManualChanged).map((r) => r.scheduledDate))
        );
        this.frozenRowDates.set(
          new Set(agreement.scheduleRows.filter((r) => r.isFrozen).map((r) => r.scheduledDate))
        );
        this.cancelledRowDates.set(
          new Set(
            agreement.scheduleRows
              .filter((r) => RentAgreementCreateComponent.isCancelledStatus(r.status))
              .map((r) => r.scheduledDate)
          )
        );
        this.additionalCharges.set(agreement.additionalCharges.map(toChargeCreationRequest));
        this.additionalChargeTargets.set(agreement.additionalCharges.map((c) => c.category));
        this.appliedChargeIds.set(
          new Set(agreement.additionalCharges.filter((c) => c.isApplied).map((c) => c.id))
        );

        this.lastPreviewSignature = this.scheduleSignature();
        this.saveResult.set({
          agreementId: agreement.agreementId,
          status: agreement.status,
          depositCollected: agreement.depositCollected,
          scheduleRows: agreement.scheduleRows,
          additionalCharges: agreement.additionalCharges
        });
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
   * Whether a row's `status` is "cancelled" — comparing case-insensitively because `ScheduleStatus`
   * is a backend smart enum, not a plain C# `enum`, so it is deliberately **not** passed through the
   * API's snake_case/lowercase enum-value convention and arrives PascalCase (`"Cancelled"`), unlike
   * every other status-shaped field on the wire (`leaseTermType`, `frequency`, etc).
   */
  private static isCancelledStatus(status: ScheduleRowStatus | string | undefined): boolean {
    return status?.toLowerCase() === 'cancelled';
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
   * Adds six months to a date, returning a new `Date` (leaves the input untouched).
   */
  private static addSixMonths(date: Date): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + 6);
    return result;
  }
}
