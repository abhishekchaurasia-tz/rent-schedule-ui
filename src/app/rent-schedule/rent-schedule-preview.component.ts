import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { debounceTime } from 'rxjs';

import { toIsoDate } from '../shared/date.util';
import { RentScheduleService } from './rent-schedule.service';
import {
  CandidateDateRequest,
  LeaseTermType,
  PreviewRentScheduleRequest,
  PreviewRentScheduleResponse,
  RentFrequency
} from './rent-schedule.models';
import { buildFrequencyConfig, ordinal } from './frequency-config.util';
import { FrequencyOption, frequenciesFor, isFrequencyAllowed } from './frequency-options.util';

@Component({
  selector: 'app-rent-schedule-preview',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDatepickerModule, MatFormFieldModule, MatInputModule],
  providers: [provideNativeDateAdapter()],
  templateUrl: './rent-schedule-preview.component.html',
  styleUrl: './rent-schedule-preview.component.scss'
})
export class RentSchedulePreviewComponent {
  /**
   * The frequencies this form may offer, narrowed by the lease term.
   *
   * Semi-Annual disappears for a month-to-month lease, because the backend refuses that pair — see
   * {@link frequenciesFor}. A getter rather than a field so it re-reads on every change detection,
   * which is what makes the option vanish the moment the term type flips.
   */
  get frequencies(): readonly FrequencyOption[] {
    return frequenciesFor(this.leaseTermType);
  }

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
  readonly result = signal<PreviewRentScheduleResponse | null>(null);
  readonly loading = signal(false);
  readonly requestError = signal<string | null>(null);

  readonly candidateDates = signal<string[]>([]);
  readonly candidateDatesLoading = signal(false);

  constructor(
    private readonly fb: FormBuilder,
    private readonly rentScheduleService: RentScheduleService
  ) {
    this.form = this.fb.group({
      // Native `Date`s, because the Material datepicker binds one. Converted to the wire's
      // "YYYY-MM-DD" by `toIsoDate` at request time — never by `Date#toISOString`, which shifts to UTC
      // and lands on the previous day for anyone west of Greenwich.
      startDate: [null as Date | null, Validators.required],
      endDate: [null as Date | null],
      leaseTermType: ['fixed' as LeaseTermType, Validators.required],
      rent: [100, [Validators.required, Validators.min(0.01)]],
      frequency: ['monthly' as RentFrequency, Validators.required],
      // A plain ISO string once picked from the candidate <select>, or a `Date` from the datepicker
      // shown when there are no candidates. `toIsoDate` passes a string through unchanged, so the two
      // shapes need no branch at the point of use.
      firstRentalDueDate: [null as Date | string | null, Validators.required],
      monthToMonthInvoiceCount: [12],
      nextLeaseStartDate: [null as Date | null],
      dueOnDay: [1],
      dueOnDays: this.fb.array([this.fb.control(1), this.fb.control(15)]),
      dayOfWeek: [1],
      cycle: this.fb.array([
        this.fb.group({ month: [1], day: [1] }),
        this.fb.group({ month: [7], day: [1] })
      ]),
      dueDates: this.fb.array([this.fb.control(null as Date | null)]),
      overrides: this.fb.array([])
    });

    this.form
      .get('startDate')!
      .valueChanges.pipe(takeUntilDestroyed())
      .subscribe((startDate: Date | null) => {
        if (startDate && this.form.get('leaseTermType')!.value === 'fixed') {
          this.form.get('endDate')!.setValue(RentSchedulePreviewComponent.addOneYear(startDate));
        }
      });

    // Switching to month-to-month while Semi-Annual is picked would leave the form holding a pair the
    // backend refuses, with the option no longer even visible to explain it. Fall back to Monthly —
    // the default — rather than clearing, so the form stays submittable.
    this.form
      .get('leaseTermType')!
      .valueChanges.pipe(takeUntilDestroyed())
      .subscribe((leaseTermType: LeaseTermType) => {
        if (!isFrequencyAllowed(this.frequency, leaseTermType)) {
          this.form.get('frequency')!.setValue('monthly');
        }
      });

    this.form.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
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

  get overrides(): FormArray {
    return this.form.get('overrides') as FormArray;
  }

  addDueDate(): void {
    this.dueDates.push(this.fb.control(null as Date | null));
  }

  removeDueDate(index: number): void {
    this.dueDates.removeAt(index);
  }

  addOverride(): void {
    this.overrides.push(
      this.fb.group({
        scheduledDate: [null as Date | null],
        dueDate: [null as Date | null],
        rent: [null]
      })
    );
  }

  removeOverride(index: number): void {
    this.overrides.removeAt(index);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.requestError.set(null);
    this.result.set(null);

    const request = this.buildRequest();

    this.rentScheduleService.preview(request).subscribe({
      next: (response) => {
        this.result.set(response);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.requestError.set(RentSchedulePreviewComponent.describeError(err));
        this.loading.set(false);
      }
    });
  }

  private buildRequest(): PreviewRentScheduleRequest {
    const value = this.form.value;

    return {
      startDate: toIsoDate(value.startDate)!,
      endDate: value.leaseTermType === 'fixed' ? toIsoDate(value.endDate) : null,
      leaseTermType: value.leaseTermType,
      rent: Number(value.rent),
      frequency: value.frequency,
      firstRentalDueDate: toIsoDate(value.firstRentalDueDate)!,
      frequencyConfig: buildFrequencyConfig(value),
      overrides:
        value.overrides
          ?.filter((o: any) => !!o.scheduledDate)
          .map((o: any) => ({
            scheduledDate: toIsoDate(o.scheduledDate)!,
            dueDate: toIsoDate(o.dueDate) ?? undefined,
            rent: o.rent !== null && o.rent !== '' ? Number(o.rent) : undefined
          })) ?? [],
      monthToMonthInvoiceCount:
        value.leaseTermType === 'month_to_month' ? Number(value.monthToMonthInvoiceCount) : null,
      nextLeaseStartDate:
        value.leaseTermType === 'month_to_month' ? toIsoDate(value.nextLeaseStartDate) : null
    };
  }

  private refreshCandidateDates(): void {
    const value = this.form.value;

    const canRequestOptions =
      value.frequency !== 'custom' &&
      !!value.startDate &&
      (value.leaseTermType === 'fixed'
        ? !!value.endDate
        : !!value.monthToMonthInvoiceCount);

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

        // Compared in ISO because the control may hold either shape — a `Date` picked from the
        // datepicker, or the plain string a candidate <option> carries.
        const currentSelection = toIsoDate(this.form.get('firstRentalDueDate')!.value);
        if (dates.length > 0 && (!currentSelection || !dates.includes(currentSelection))) {
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
   * Renders a user-facing message for a failed request. A 400 from the API carries an RFC 9457
   * Problem Details body whose `detail` names the business-validation problem (see
   * `PreviewRentScheduleQueryHandler`/`FirstRentalDueDateOptionsQueryHandler` on the backend,
   * which both map validation failures to 400 rather than embedding errors in a 200 response).
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
   * Adds one year to a "YYYY-MM-DD" date string, returning the same shape.
   */
  /**
   * The same day one year on.
   *
   * Works in local `Date`s end to end now that the pickers bind them — the previous version round-tripped
   * through `toISOString`, which is UTC and therefore lands a day early for anyone west of Greenwich.
   */
  private static addOneYear(start: Date): Date {
    return new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
  }
}
