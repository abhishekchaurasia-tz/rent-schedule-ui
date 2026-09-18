import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { provideNativeDateAdapter } from '@angular/material/core';
import { debounceTime } from 'rxjs';

import { environment } from '../../environments/environment';
import { RequestScopeService } from '../request-scope.service';
import { reloadOnScopeChange } from '../scope-change';
import { sendsScopeIds } from '../scope-headers.interceptor';
import { RentScheduleService } from '../rent-schedule/rent-schedule.service';
import { CandidateDateRequest, FrequencyConfig, LeaseTermType, RentFrequency } from '../rent-schedule/rent-schedule.models';
import { buildFrequencyConfig, ordinal } from '../rent-schedule/frequency-config.util';
import {
  FrequencyOption,
  frequenciesFor,
  isFrequencyAllowed
} from '../rent-schedule/frequency-options.util';
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
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule
  ],
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
   * The property owner the record on screen belongs to.
   *
   * **It is not what the catalog is fetched with, and has not been since v22.** That release moved the
   * catalog's owner scope onto the `PropertyOwnerUid` header, which `scopeHeadersInterceptor` attaches;
   * v26 then removed the `if (!this.propertyOwnerId) return;` that was still guarding the fetch. This
   * comment claimed the opposite of both — *"without this the catalog can't be fetched and the item
   * picker stays empty"* — which is the single most misleading sentence to leave next to an empty
   * picker, and it was read that way.
   *
   * What it is still used for is {@link ownerScopeMismatch}: comparing the record's owner against the
   * one the catalog was actually read for.
   */
  @Input() propertyOwnerId: string | null = null;

  /**
   * The lease's own start/end date and (when month-to-month) invoice count — passed down so this
   * panel's recurring Start Date/End Date can be presented as a candidate-date `<select>` (fed by
   * `POST /rent-schedule/first-rental-due-date-options`, the same API the lease-terms form uses for
   * its own "first rental due date" dropdown) rather than a free-form calendar, mirroring the
   * legacy `in-property-owner-app` `AdditionalFeeComponent`'s `dueDatesForStartDate`/
   * `dueDatesForEndDate` — those were themselves computed per-frequency from the lease's window
   * (`changeRentDueOn()`), not picked freely either. `leaseEndDate` null means month-to-month.
   */
  @Input() leaseStartDate: string | null = null;
  @Input() leaseEndDate: string | null = null;
  @Input() leaseMonthToMonthInvoiceCount: number | null = null;

  /**
   * When set, the panel opens pre-filled with this already-created charge instead of a blank form
   * — the host's "Edit" action on a row in its running additional-charges list. `create()` still
   * just emits the built request; the host (not this component) decides whether that's a new
   * append or a replace of the charge being edited.
   */
  @Input() initialCharge: AdditionalChargeCreationRequest | null = null;

  @Output() readonly created = new EventEmitter<AdditionalChargeCreationRequest>();
  @Output() readonly closed = new EventEmitter<void>();

  /**
   * The catalog entries fetched for this panel's scope (`DepositOnly` when `depositOnly`, otherwise
   * `AllExcludingCredit`) — populates the item picker `<select>`. Both scopes already guarantee
   * every entry shares the same deposit-shaped-or-not bucket, so there is no longer a per-item
   * rent/deposit target to pick or a "mixed category" case to guard against.
   */
  readonly lineItems = signal<LineItemResponse[]>([]);

  /**
   * Why the catalog could not be read, or `null` when it was read.
   *
   * **This exists because a failed read and an empty catalog used to be the same sentence.** The fetch
   * had no error branch, so `lineItems()` simply kept its initial `[]` and the panel said *"No catalog
   * items are available to pick from yet"* — whether the catalog was empty, the request was refused,
   * or the Billing service was not running at all. On the lease editor that is the **only** symptom a
   * stopped service produces: that screen reads nothing from the API before this panel is opened, so
   * there is no failed load anywhere else on it to give the game away.
   */
  readonly catalogError = signal<string | null>(null);

  /**
   * Whether the catalog read is in flight.
   *
   * Tracked for the same reason as the error above: the panel can be opened and a picker clicked while
   * the request is still out, and "not yet" is not "there are none".
   */
  readonly catalogLoading = signal(false);

  /** Index of the item row whose "Select Type" dropdown is currently open, or `null` if none. */
  readonly openItemPickerIndex = signal<number | null>(null);

  /**
   * Viewport coordinates for the open item picker, computed from the clicked button's
   * `getBoundingClientRect()`. Rendered as a `position: fixed` sibling of `.panel-body` rather than
   * a child of the item row — `.panel-body` scrolls (`overflow-y: auto`), and an ancestor's
   * `overflow` clips any descendant's paint (fixed position included), so a dropdown nested inside
   * it would get cut off once the panel is scrolled.
   */
  readonly itemPickerPosition = signal<{ top: number; left: number } | null>(null);

  /** Whether the open item picker is showing the "type a new item type" input instead of the catalog list. */
  readonly addingNewItemType = signal(false);
  readonly newItemTypeDraft = signal('');

  /**
   * Candidate due dates for the recurring Start Date `<select>`, fetched whenever frequency (or its
   * config) changes — see the `leaseStartDate` doc comment above. Only meaningful for
   * `frequency !== 'custom'`; the backend's candidate endpoint rejects Custom outright (it has no
   * computed-candidate concept), so Custom keeps the free-form date pickers instead.
   */
  readonly recurringDueDateCandidates = signal<string[]>([]);
  readonly recurringDueDateCandidatesLoading = signal(false);

  /**
   * The lease's term type, derived the same way this panel's candidate-date request derives it: a
   * lease with no end date is month-to-month.
   */
  get leaseTermType(): LeaseTermType {
    return this.leaseEndDate ? 'fixed' : 'month_to_month';
  }

  /**
   * The frequencies this panel may offer, narrowed by the lease it is authoring against.
   *
   * Semi-Annual disappears on a month-to-month lease. The charge's own cadence is resolved against
   * that lease's window by the same candidate-date endpoint the lease form uses, and that endpoint
   * refuses the pair outright — so offering it here would produce a `400` while the user was still
   * filling the form in, with nothing on screen to explain it. See {@link frequenciesFor}.
   */
  get frequencies(): readonly FrequencyOption[] {
    return frequenciesFor(this.leaseTermType);
  }

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

  /**
   * True when the record on screen belongs to a different property owner than the settings box —
   * v22 requirement 13b, decision D5.
   *
   * **Why this is shown rather than silently tolerated.** The catalog is fetched under the
   * `PropertyOwnerUid` header, which carries the settings-box value; this panel is editing a record
   * that names its own owner. When they disagree the backend answers for the box's owner and this
   * screen renders the result as though it had asked for the record's — the picker shows only the
   * shared system-defined entries, and a new fee name is filed under an owner nobody chose. Nothing
   * errors, which is exactly what makes it worth saying out loud.
   *
   * **Silent unless the box's owner is the one the catalog was read for (v26).** On any build but
   * `local`, and on `local` once a token is pasted, the three ids are not sent at all — so the box's
   * `PropertyOwnerUid` is not what the list was scoped by and comparing against it would report a
   * disagreement between two values that never met. Left ungated it fired on *every* dev and qa
   * record, against a GUID `crypto.randomUUID()` invented and nobody ever saw.
   *
   * **It becomes unreachable once the backend's D5 milestones ship**, because a cross-owner read is
   * then refused with a `404` and the record never loads at all. It is built for the window before
   * that, and falls silent on its own afterwards rather than needing removal.
   */
  protected get ownerScopeMismatch(): boolean {
    if (!sendsScopeIds(environment.name, this.scope.accessToken())) {
      return false;
    }

    return this.propertyOwnerId !== null && this.propertyOwnerId !== this.scope.propertyOwnerId();
  }

  constructor(
    private readonly fb: FormBuilder,
    private readonly lineItemsService: LineItemsService,
    private readonly rentScheduleService: RentScheduleService,
    protected readonly scope: RequestScopeService
  ) {
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
      // A plain ISO "YYYY-MM-DD" string once picked from the candidate <select> (frequency !==
      // 'custom'), or a native Date from the free-form picker when frequency === 'custom'.
      startDate: [null as Date | string | null],
      endDate: [null as Date | string | null],
      hasNoEndDate: [false],
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

    // Attached-to-rental-invoice charges ride the rental invoice's own due-date cadence, so the
    // independent Frequency picker (and its per-frequency config) is hidden — force it back to the
    // plain "monthly" candidate-date flow rather than leaving it on a stale frequency (e.g. Custom's
    // free-form pickers) picked before the toggle was flipped.
    this.form.get('attachedWithRentalInvoice')!.valueChanges.subscribe((attached: boolean) => {
      if (attached) {
        this.form.get('frequency')!.setValue('monthly');
      }
    });

    // Clears a stale End Date pick once it's no longer after the (possibly newly re-picked) Start
    // Date — mirrors the reference component's dueDatesForEndDate always being re-filtered to
    // "after the selected start date" whenever the start date selection changes.
    this.form.get('startDate')!.valueChanges.subscribe((startDate: Date | string | null) => {
      if (this.frequency === 'custom' || !startDate) {
        return;
      }
      const endDateControl = this.form.get('endDate')!;
      const endDate = endDateControl.value;
      if (endDate && !(endDate > startDate)) {
        endDateControl.setValue(null, { emitEvent: false });
      }
    });

    this.form.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      this.refreshRecurringDueDateCandidates();
    });

    // Requirement 15g. This panel is routinely open *before* the token is pasted -- an empty item list
    // is the thing that sends a tester to the box in the first place -- so the catalog is read again
    // when the scope changes. Only the catalog: the form beside it may be half filled in.
    reloadOnScopeChange(() => this.loadLineItems());
  }

  ngOnInit(): void {
    if (this.depositOnly) {
      this.form.get('attachedWithRentalInvoice')!.setValue(false);
      this.form.get('attachedWithRentalInvoice')!.disable();
    }
    if (this.initialCharge) {
      this.applyInitialCharge(this.initialCharge);
    }

    // After any prefill, not before: a saved charge may carry a frequency this lease can no longer
    // use — a Semi-Annual fee on a lease since reopened as month-to-month — and that value would
    // otherwise sit in a control whose option list no longer contains it, showing blank and failing on
    // save with a message about a field the user cannot see.
    if (!isFrequencyAllowed(this.frequency, this.leaseTermType)) {
      this.form.get('frequency')!.setValue('monthly');
    }

    this.loadLineItems();
    this.refreshRecurringDueDateCandidates();
  }

  /**
   * Prefills the form from an already-created charge (the host's "Edit" action). Converts each ISO
   * date string back to whatever shape the relevant field currently expects — a native `Date` for
   * the one-time `dueDate` and for Custom's own `startDate`/`endDate`/`dueDates` (those fields still
   * use the free-form `mat-datepicker`), a plain ISO string for `startDate`/`endDate` on every other
   * frequency (those are the candidate-date `<select>`s).
   */
  private applyInitialCharge(charge: AdditionalChargeCreationRequest): void {
    const frequency = charge.frequency ?? 'monthly';
    const parseDate = (iso: string | null | undefined): Date | null => (iso ? new Date(`${iso}T00:00:00`) : null);

    this.form.patchValue({
      notes: charge.notes ?? '',
      alreadyPaid: charge.alreadyPaid,
      attachedWithRentalInvoice: charge.attachedWithRentalInvoice,
      isRecurring: charge.isRecurring,
      dueDate: parseDate(charge.dueDate),
      frequency,
      startDate: charge.isRecurring ? (frequency === 'custom' ? parseDate(charge.startDate) : charge.startDate) : null,
      endDate:
        charge.isRecurring && !charge.hasNoEndDate
          ? frequency === 'custom'
            ? parseDate(charge.endDate)
            : charge.endDate
          : null,
      hasNoEndDate: charge.hasNoEndDate,
    });

    if (charge.isRecurring) {
      this.applyFrequencyConfig(frequency, charge.frequencyConfig);
    }

    this.items.clear();
    charge.items.forEach((item) => {
      const group = this.buildItemGroup();
      group.patchValue({
        lineItemId: item.lineItemId ?? '',
        newItemType: item.lineItemId ? '' : item.itemType,
        description: item.description,
        quantity: item.quantity,
        rate: item.rate,
        amount: item.amount
      });
      this.items.push(group);
    });
  }

  /** Reverses {@link buildFrequencyConfig}, resizing the relevant `FormArray` to fit. */
  private applyFrequencyConfig(frequency: RentFrequency, config: FrequencyConfig | null | undefined): void {
    if (!config) {
      return;
    }

    const resize = (array: FormArray, length: number, buildControl: () => AbstractControl) => {
      while (array.length < length) {
        array.push(buildControl());
      }
      while (array.length > length) {
        array.removeAt(array.length - 1);
      }
    };

    switch (frequency) {
      case 'monthly':
        this.form.get('dueOnDay')!.setValue(config.dueOnDay ?? 1);
        break;
      case 'bi_monthly': {
        const days = config.dueOnDays ?? [1, 15];
        resize(this.dueOnDays, days.length, () => this.fb.control(1));
        this.dueOnDays.setValue(days);
        break;
      }
      case 'weekly':
      case 'bi_weekly':
        this.form.get('dayOfWeek')!.setValue(config.dayOfWeek ?? 1);
        break;
      case 'semesterly': {
        const cycle = config.cycle ?? [
          { month: 1, day: 1 },
          { month: 7, day: 1 }
        ];
        resize(this.cycle, cycle.length, () => this.fb.group({ month: [1], day: [1] }));
        this.cycle.setValue(cycle);
        break;
      }
      case 'custom': {
        const dueDates = (config.dueDates ?? []).map((iso) => new Date(`${iso}T00:00:00`));
        resize(this.dueDates, Math.max(dueDates.length, 1), () => this.fb.control(null as Date | null));
        dueDates.forEach((date, index) => this.dueDates.at(index)?.setValue(date));
        break;
      }
      default:
        break;
    }
  }

  /**
   * Fetches the fee-name catalog this panel's pickers offer.
   *
   * **No longer gated on {@link propertyOwnerId} (v26).** That guard was left behind by v22, which
   * removed the owner from `GET /api/v1/line-items` and made the `PropertyOwnerUid` header — or, with
   * a token, the gateway's own reading of it — the only source. The argument went; the `return` that
   * depended on it stayed. The result was a panel that fetched nothing at all whenever the record on
   * screen named no owner, and showed *"No catalog items are available to pick from yet"* as though
   * the catalog were empty rather than never asked for.
   */
  private loadLineItems(): void {
    const scope: LineItemScope = this.depositOnly ? 'DepositOnly' : 'AllExcludingCredit';

    this.catalogError.set(null);
    this.catalogLoading.set(true);

    this.lineItemsService.list(scope).subscribe({
      next: (items) => {
        this.lineItems.set(items);
        this.catalogLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        // Emptied rather than left standing. A stale list under an error message invites picking an
        // entry that was read for a different owner, or from a service that is no longer answering.
        this.lineItems.set([]);
        this.catalogLoading.set(false);
        this.catalogError.set(AdditionalChargePanelComponent.describeCatalogError(err));
      }
    });
  }

  /**
   * Reads the catalog again after a failure.
   *
   * **Only the catalog.** The form beside it may be half filled in, and a service that was down while
   * someone was typing should not cost them what they typed — the same reasoning that makes
   * requirement 15g re-read the catalog alone when the scope changes.
   */
  retryCatalog(): void {
    this.loadLineItems();
  }

  /**
   * Turns a failed catalog read into something the reader can act on.
   *
   * **Three cases, because they send you to three different places.** `status === 0` is nothing
   * answering at the address at all — the service is not running, or not where `apiBaseUrl` says — and
   * it is the case that used to be indistinguishable from an empty catalog. An RFC 9457 `detail` is
   * repeated verbatim, which covers the other trap on the local build: a token pasted into Test scope
   * replaces the three ids the Billing API reads directly, and it answers *"The PropertyOwnerUid header
   * is required."* Anything else is reported as its status line.
   */
  private static describeCatalogError(err: HttpErrorResponse): string {
    if (err.status === 0) {
      return (
        `Nothing answered at ${environment.apiBaseUrl}. ` +
        `Check that the Billing service is running.`
      );
    }

    const problemDetail = err.error?.detail;
    return typeof problemDetail === 'string' && problemDetail
      ? problemDetail
      : `The request was refused: ${err.status} ${err.statusText}`;
  }

  /**
   * The End Date `<select>`'s option list — {@link recurringDueDateCandidates} filtered to dates
   * strictly after whichever Start Date is currently picked (mirrors the reference component always
   * recomputing `dueDatesForEndDate` relative to the chosen start).
   */
  endDateCandidates(): string[] {
    const startDate = this.form.get('startDate')!.value;
    return this.recurringDueDateCandidates().filter((date) => !startDate || date > startDate);
  }

  private refreshRecurringDueDateCandidates(): void {
    const value = this.form.value;
    const canRequest = !!value.isRecurring && value.frequency !== 'custom' && !!this.leaseStartDate;

    if (!canRequest) {
      this.recurringDueDateCandidates.set([]);
      this.recurringDueDateCandidatesLoading.set(false);
      return;
    }

    const leaseTermType: LeaseTermType = this.leaseEndDate ? 'fixed' : 'month_to_month';

    const request: CandidateDateRequest = {
      startDate: this.leaseStartDate!,
      endDate: leaseTermType === 'fixed' ? this.leaseEndDate : null,
      leaseTermType,
      frequency: value.frequency,
      frequencyConfig: buildFrequencyConfig(value),
      monthToMonthInvoiceCount: leaseTermType === 'month_to_month' ? this.leaseMonthToMonthInvoiceCount : null,
      nextLeaseStartDate: null
    };

    this.recurringDueDateCandidatesLoading.set(true);

    this.rentScheduleService.firstRentalDueDateOptions(request).subscribe({
      next: (response) => {
        this.recurringDueDateCandidates.set(response.dates);
        this.recurringDueDateCandidatesLoading.set(false);

        const currentStart = this.form.get('startDate')!.value;
        if (response.dates.length > 0 && currentStart && !response.dates.includes(currentStart)) {
          this.form.get('startDate')!.setValue(null, { emitEvent: false });
        }
      },
      error: () => {
        this.recurringDueDateCandidates.set([]);
        this.recurringDueDateCandidatesLoading.set(false);
      }
    });
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

  /** The current selection's display text for row `index`'s "Select Type" button. */
  itemDisplayLabel(index: number): string {
    const group = this.items.at(index);
    const lineItemId = group.get('lineItemId')!.value;
    const newItemType = group.get('newItemType')!.value;

    if (lineItemId) {
      return this.findLineItem(lineItemId)?.name ?? 'Select Type';
    }
    if (newItemType) {
      return newItemType;
    }
    return 'Select Type';
  }

  toggleItemPicker(index: number, event: MouseEvent): void {
    if (this.openItemPickerIndex() === index) {
      this.closeItemPicker();
      return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.itemPickerPosition.set({ top: rect.bottom, left: rect.left });
    this.openItemPickerIndex.set(index);
    this.addingNewItemType.set(false);
    this.newItemTypeDraft.set('');
  }

  closeItemPicker(): void {
    this.openItemPickerIndex.set(null);
    this.itemPickerPosition.set(null);
    this.addingNewItemType.set(false);
    this.newItemTypeDraft.set('');
  }

  /**
   * Not reachable from the deposit-only panel's template (its trigger button is hidden there), but
   * guarded here too — a non-system property owner can never create a new deposit-category catalog
   * entry (backend `DepositItemMustBeSystemDefined`), so this panel only ever offers picking from
   * the already-fetched (system-defined) deposit catalog.
   */
  startAddingNewItemType(): void {
    if (this.depositOnly) {
      return;
    }
    this.addingNewItemType.set(true);
  }

  /**
   * Files the typed name on row `index` as a brand-new item type.
   *
   * **Free text is correct here**, unlike on the invoice-correction screen: this panel's endpoint
   * get-or-creates a catalog entry server-side from `itemType`/`description` whenever `lineItemId` is
   * absent, so the row needs nothing but the name. The correction endpoint instead parses `itemType`
   * into a fixed enum, which is why *that* screen has to resolve a catalog entry up front. The two
   * flows differ because the two endpoints do.
   */
  confirmNewItemType(index: number): void {
    const name = this.newItemTypeDraft().trim();
    if (!name) {
      return;
    }
    this.items.at(index).patchValue({ lineItemId: '', newItemType: name });
    this.defaultDescriptionTo(index, name);
    this.closeItemPicker();
  }

  selectExistingItem(index: number, lineItemId: string): void {
    this.items.at(index).patchValue({ lineItemId, newItemType: '' });
    this.defaultDescriptionTo(index, this.findLineItem(lineItemId)?.name ?? '');
    this.closeItemPicker();
  }

  /**
   * Seeds row `index`'s description from the item just picked — but **only when it is still empty**.
   *
   * Picking an item is nearly always followed by typing that same word into the description, so filling
   * it in saves the common keystroke. Filling it in *unconditionally* would be a data loss on the other
   * path: re-opening a saved charge to correct its item type would silently overwrite whatever the
   * property owner had actually written there, and the description is the line the tenant reads on the
   * invoice.
   *
   * "Still empty" is the whole rule, and it settles both cases without having to know which one it is
   * in — a fresh row has nothing to lose, and an edited row that already says something keeps saying it.
   */
  private defaultDescriptionTo(index: number, name: string): void {
    if (!name) {
      return;
    }

    const description = this.items.at(index).get('description')!;
    if (!String(description.value ?? '').trim()) {
      description.setValue(name);
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
    const ridesRentalInvoice = this.depositOnly ? false : !!value.attachedWithRentalInvoice;

    const request: AdditionalChargeCreationRequest = {
      notes: value.notes || null,
      alreadyPaid: Number(value.alreadyPaid),
      attachedWithRentalInvoice: ridesRentalInvoice,
      isRecurring,
      dueDate: isRecurring ? null : toIsoDate(value.dueDate),

      // FR-088: only a recurring charge that RIDES the rental invoice carries a cadence of its own. A
      // standalone recurring charge bills once per rent cycle, so sending a frequency would be a second,
      // contradictory cadence — and the server rejects it with 422.
      frequency: isRecurring && ridesRentalInvoice ? value.frequency : null,
      frequencyConfig: isRecurring && ridesRentalInvoice ? buildFrequencyConfig(value) : null,
      startDate: isRecurring ? toIsoDate(value.startDate) : null,
      endDate: isRecurring && !value.hasNoEndDate ? toIsoDate(value.endDate) : null,
      hasNoEndDate: isRecurring ? !!value.hasNoEndDate : false,
      items: value.items.map((item: any) => {
        // A row is either an existing catalog pick (lineItemId set) or a brand-new item type typed
        // inline (lineItemId omitted) — the backend get-or-creates a catalog entry server-side from
        // `itemType`/`description` whenever `lineItemId` is null (spec 02-invoicing.md v6).
        const lineItemId = item.lineItemId || null;
        const itemType = lineItemId
          ? this.findLineItem(lineItemId)?.itemType ?? ''
          : String(item.newItemType || '').trim();

        return {
          lineItemId,
          itemType,
          description: item.description,
          quantity: Number(item.quantity),
          rate: Number(item.rate),
          amount: Number(item.quantity) * Number(item.rate)
        };
      })
    };

    this.created.emit(request);
  }

  private buildItemGroup(): FormGroup {
    return this.fb.group(
      {
        lineItemId: [''],
        newItemType: [''],
        description: ['', Validators.required],
        quantity: [1, [Validators.required, Validators.min(0.01)]],
        rate: [0, [Validators.required, Validators.min(0.01)]],
        amount: [{ value: 0, disabled: true }]
      },
      { validators: AdditionalChargePanelComponent.requireItemSelection }
    );
  }

  /** A row must either pick an existing catalog item or have a new item type name typed in. */
  private static requireItemSelection(group: AbstractControl): ValidationErrors | null {
    const lineItemId = group.get('lineItemId')?.value;
    const newItemType = String(group.get('newItemType')?.value ?? '').trim();
    return lineItemId || newItemType ? null : { itemRequired: true };
  }
}
