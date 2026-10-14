import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Observable, catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';

import { toIsoDate } from '../shared/date.util';
import { DepositRefundProblem, isMoney, roundMoney, tenantDisplayName } from './deposit-refund.util';
import { InvoicesService } from './invoices.service';
import {
  OfflinePaymentAllocationResponse,
  OfflinePaymentContextResponse,
  OfflinePaymentLineRequest,
  OfflinePaymentMethod,
  OfflinePaymentPreviewResponse,
  OfflinePaymentSubmittedResponse,
  PreviewOfflinePaymentRequest
} from './record-payment.models';
import { RecordPaymentService, SUBMISSION_UNCONFIRMED, describeRecordPaymentProblem } from './record-payment.service';

/** The backend's limit on a check or money-order number (backend D6). */
export const MAX_CHECK_NUMBER = 24;

/** How long the panel waits after the last change before it previews (spec FR 10). */
export const PREVIEW_DEBOUNCE_MS = 350;

/** The field messages — the owner app's words, plus the two rules Billing added (spec FR 9). */
export const RecordPaymentFieldMessages = {
  required: 'Required',
  amountPositive: 'Should be greater than $0.00',
  amountDecimals: 'Only number allowed with 2 decimal places.',
  futureDate: 'The Submission Date cannot be in the future.',
  numberTooLong: `At most ${MAX_CHECK_NUMBER} characters.`
} as const;

/** The owner app's confirmation, word for word (spec FR 13). */
export const RecordPaymentConfirmation =
  'Please review the payment information before submitting (particularly the Amount field). ' +
  'If all the information is correct, confirm your submission.';

/** One payment line. The tenant is line 1's on every line, and disabled after the first (spec FR 7). */
interface PaymentLineControls {
  tenantId: FormControl<string>;
  method: FormControl<OfflinePaymentMethod | ''>;
  checkNumber: FormControl<string>;
  paidOn: FormControl<Date | null>;
  amount: FormControl<number | null>;
}

type PaymentLineField = keyof PaymentLineControls;

/** A refused submission, and whether it is the one that may have been queued anyway (spec FR 16, 17). */
export interface RecordPaymentSubmitError {
  problem: DepositRefundProblem;
  unconfirmed: boolean;
}

/** What a debounced preview came to. */
type PreviewOutcome = { preview: OfflinePaymentPreviewResponse } | { error: DepositRefundProblem } | null;

/**
 * The **Record Payment** side panel — spec `11-record-payment-ui.md`, on Billing spec `18-record-payment.md`
 * v2, laid out as the owner app's *RECORD PAYMENT* panel.
 *
 * **It talks to Billing itself**, as the late fee panel does: the preview is a running conversation
 * between the lines typed here and the server's allocation, so the host only opens it, and hears back once
 * a payment was accepted.
 *
 * **Every figure is the server's.** The panel checks the fields (BR-33) and nothing else; what the invoice
 * still takes, where an excess goes and the most the tenant can pay all come from the preview.
 *
 * **One `submissionId` per opening.** It is minted when the panel is created and sent with every press, so
 * a press after a lost answer is the same submission and Finance records it once (backend D9, BR-39).
 */
@Component({
  selector: 'app-record-payment-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDatepickerModule, MatFormFieldModule, MatInputModule],
  providers: [provideNativeDateAdapter()],
  templateUrl: './record-payment-panel.component.html',
  styleUrl: './record-payment-panel.component.scss'
})
export class RecordPaymentPanelComponent implements OnInit {
  /** How each method reads — the owner app's words. */
  private static readonly MethodLabels: Record<OfflinePaymentMethod, string> = {
    cash: 'Cash',
    check: 'Check',
    money_order: 'Money Order'
  };

  /** The invoice the payment is recorded on. */
  @Input({ required: true }) invoiceId!: string;

  /** The payment was accepted (`202`): queued at Finance, so the list behind the panel is stale. */
  @Output() readonly recorded = new EventEmitter<OfflinePaymentSubmittedResponse>();

  /** The user closed the panel. */
  @Output() readonly closed = new EventEmitter<void>();

  readonly confirmation = RecordPaymentConfirmation;
  readonly maxCheckNumber = MAX_CHECK_NUMBER;

  /** The latest day the datepicker offers: today, in the browser's calendar (backend D5). */
  readonly today: Date;

  /** The idempotency key for this opening of the panel (spec FR 14). */
  readonly submissionId: string;

  readonly loading = signal(false);
  readonly loadError = signal<DepositRefundProblem | null>(null);

  /** The context, or `null` before it arrives and after a failed read. */
  readonly context = signal<OfflinePaymentContextResponse | null>(null);

  /** The invoice's first line description, or `null` while unknown (spec FR 2). */
  readonly subject = signal<string | null>(null);

  /** The last preview, or `null` when the lines are incomplete. */
  readonly preview = signal<OfflinePaymentPreviewResponse | null>(null);

  /** True from a change until its preview answers, so *Submit* waits for it (spec FR 12). */
  readonly previewPending = signal(false);

  readonly previewError = signal<DepositRefundProblem | null>(null);

  /** Set by the first *Submit* press; from then on each field shows its problem (spec FR 9). */
  readonly attempted = signal(false);

  /** Whether the review confirmation is showing (spec FR 13). */
  readonly confirming = signal(false);

  readonly submitting = signal(false);
  readonly submitError = signal<RecordPaymentSubmitError | null>(null);

  readonly lines: FormArray<FormGroup<PaymentLineControls>>;

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly payments: RecordPaymentService,
    private readonly invoices: InvoicesService,
    private readonly fb: NonNullableFormBuilder
  ) {
    const now = new Date();
    this.today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    this.submissionId = crypto.randomUUID();
    this.lines = this.fb.array<FormGroup<PaymentLineControls>>([]);

    this.lines.valueChanges
      .pipe(
        map(() => this.previewRequest()),
        tap((request) => {
          this.previewPending.set(request !== null);
          if (request === null) {
            this.preview.set(null);
            this.previewError.set(null);
          }
        }),
        debounceTime(PREVIEW_DEBOUNCE_MS),
        switchMap((request) => this.runPreview(request)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((outcome) => this.applyPreview(outcome));
  }

  /** Reads the context and, beside it, the subject (spec FR 1, FR 2). */
  ngOnInit(): void {
    this.loading.set(true);

    this.payments.getContext(this.invoiceId).subscribe({
      next: (context) => {
        this.context.set(context);
        this.loading.set(false);
        this.startLines(context);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(describeRecordPaymentProblem(err));
      }
    });

    this.invoices.getById(this.invoiceId).subscribe({
      next: (invoice) => this.subject.set(invoice.lines?.[0]?.description || null),
      error: () => this.subject.set(null)
    });
  }

  // ---- what the template reads -----------------------------------------------------------------

  /** Line 1's tenant, or `''` before one is chosen. */
  get tenantId(): string {
    return this.lines.length > 0 ? this.lines.at(0).controls.tenantId.value : '';
  }

  /** Whether the total is more than the tenant's invoices can take (spec FR 11). */
  get exceeds(): boolean {
    return !!this.preview()?.exceedsPayable;
  }

  /** Whether the blue box shows (spec FR 10). */
  get showsExcess(): boolean {
    const preview = this.preview();
    return !!preview && !preview.exceedsPayable && preview.excess > 0;
  }

  /** The invoices the excess goes to — every allocation but this invoice's own (spec FR 10). */
  get excessRows(): OfflinePaymentAllocationResponse[] {
    const own = this.context()?.invoiceId ?? this.invoiceId;
    return (this.preview()?.allocations ?? []).filter((allocation) => allocation.invoiceId !== own);
  }

  /** *+ Add Additional Payment* is enabled while the last line has a method and an amount (spec FR 7). */
  get canAddPayment(): boolean {
    if (this.lines.length === 0 || this.exceeds || this.submitting()) {
      return false;
    }

    const last = this.lines.at(this.lines.length - 1).getRawValue();
    return last.method !== '' && last.amount !== null && Number(last.amount) > 0;
  }

  /** *Submit* waits for the context, a pending preview and a submission in flight (spec FR 11, 12). */
  get canSubmit(): boolean {
    return !!this.context() && !this.previewPending() && !this.exceeds && !this.submitting();
  }

  tenantName(tenantId: string): string {
    const tenant = this.context()?.tenants.find((candidate) => candidate.tenantId === tenantId);
    return tenantDisplayName(tenantId, tenant?.name);
  }

  methodLabel(method: OfflinePaymentMethod): string {
    return RecordPaymentPanelComponent.MethodLabels[method] ?? method;
  }

  /** The label of line `index`'s number, or `null` when its method takes none (spec FR 5). */
  numberLabel(index: number): string | null {
    const method = this.lines.at(index).controls.method.value;
    if (method === 'check') {
      return 'Check Number';
    }

    return method === 'money_order' ? 'Money Order Number' : null;
  }

  /** The problem with one field, shown only after the first *Submit* press (spec FR 9). */
  errorFor(index: number, field: PaymentLineField): string | null {
    return this.attempted() ? (this.lineProblems(index)[field] ?? null) : null;
  }

  // ---- lines -----------------------------------------------------------------------------------

  /** Adds a line locked to line 1's tenant, carrying its date (spec FR 7). */
  addPayment(): void {
    if (!this.canAddPayment) {
      return;
    }

    const first = this.lines.at(0).getRawValue();
    this.lines.push(this.line(first.tenantId, first.paidOn, true));
  }

  /** Drops a line after the first (spec FR 8). */
  removePayment(index: number): void {
    if (index > 0 && index < this.lines.length) {
      this.lines.removeAt(index);
    }
  }

  close(): void {
    this.closed.emit();
  }

  // ---- submission ------------------------------------------------------------------------------

  /** Checks the fields and, when they pass, asks the owner to confirm (spec FR 9, FR 13). */
  submit(): void {
    if (!this.canSubmit) {
      return;
    }

    this.attempted.set(true);
    if (this.hasProblems()) {
      return;
    }

    this.confirming.set(true);
  }

  /** *No* — back to the panel, nothing sent. */
  cancelConfirm(): void {
    this.confirming.set(false);
  }

  /** *Yes* — posts the payment once, with this opening's `submissionId` (spec FR 14 – FR 17). */
  confirm(): void {
    if (this.submitting() || this.hasProblems()) {
      return;
    }

    this.confirming.set(false);
    this.submitting.set(true);
    this.submitError.set(null);

    this.payments
      .submit(this.invoiceId, { submissionId: this.submissionId, ...this.request() })
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          this.recorded.emit(response);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          const problem = describeRecordPaymentProblem(err);
          this.submitError.set({ problem, unconfirmed: problem.code === SUBMISSION_UNCONFIRMED });
        }
      });
  }

  // ---- internals -------------------------------------------------------------------------------

  /** One line, starting with the panel; an invoice with one tenant starts with that tenant (spec FR 3). */
  private startLines(context: OfflinePaymentContextResponse): void {
    const first = this.line('', this.today, false);
    first.controls.tenantId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((tenantId) => this.onTenantChanged(tenantId));
    this.lines.push(first);

    if (context.tenants.length === 1) {
      first.controls.tenantId.setValue(context.tenants[0].tenantId);
    }
  }

  /** A new tenant on line 1: back to one line, with that tenant's suggested amount (spec FR 3). */
  private onTenantChanged(tenantId: string): void {
    while (this.lines.length > 1) {
      this.lines.removeAt(this.lines.length - 1, { emitEvent: false });
    }

    const suggested = this.context()?.tenants.find((tenant) => tenant.tenantId === tenantId)?.suggestedAmount ?? 0;
    this.preview.set(null);
    this.lines.at(0).controls.amount.setValue(suggested > 0 ? suggested : null);
  }

  private line(tenantId: string, paidOn: Date | null, locked: boolean): FormGroup<PaymentLineControls> {
    const group = this.fb.group({
      tenantId: this.fb.control({ value: tenantId, disabled: locked }),
      method: this.fb.control<OfflinePaymentMethod | ''>(''),
      checkNumber: this.fb.control(''),
      paidOn: this.fb.control<Date | null>(paidOn),
      amount: this.fb.control<number | null>(null)
    });

    // Cash has no number: switching to it clears one typed for a check (spec FR 5).
    group.controls.method.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((method) => {
      if (method === 'cash' && group.controls.checkNumber.value) {
        group.controls.checkNumber.setValue('');
      }
    });

    return group;
  }

  /** Every field rule of backend BR-33 for line `index`, in the owner app's words (spec FR 9). */
  private lineProblems(index: number): Partial<Record<PaymentLineField, string>> {
    const messages = RecordPaymentFieldMessages;
    const raw = this.lines.at(index).getRawValue();
    const problems: Partial<Record<PaymentLineField, string>> = {};

    if (!raw.tenantId) {
      problems.tenantId = messages.required;
    }

    if (!raw.method) {
      problems.method = messages.required;
    } else if (raw.method !== 'cash' && raw.checkNumber.trim().length > MAX_CHECK_NUMBER) {
      problems.checkNumber = messages.numberTooLong;
    }

    const paidOn = toIsoDate(raw.paidOn);
    if (!paidOn) {
      problems.paidOn = messages.required;
    } else if (paidOn > toIsoDate(this.today)!) {
      problems.paidOn = messages.futureDate;
    }

    const amount = raw.amount === null || (raw.amount as unknown) === '' ? null : Number(raw.amount);
    if (amount === null) {
      problems.amount = messages.required;
    } else if (!Number.isFinite(amount) || amount <= 0) {
      problems.amount = messages.amountPositive;
    } else if (!isMoney(amount)) {
      problems.amount = messages.amountDecimals;
    }

    return problems;
  }

  private hasProblems(): boolean {
    return this.lines.length === 0 || this.lines.controls.some((_, index) => Object.keys(this.lineProblems(index)).length > 0);
  }

  /** The tenant and the lines as the wire takes them, in the order shown (spec FR 14). */
  private request(): PreviewOfflinePaymentRequest {
    return {
      tenantId: this.tenantId,
      payments: this.lines.controls.map((control) => {
        const raw = control.getRawValue();
        const number = raw.checkNumber.trim();
        const line: OfflinePaymentLineRequest = {
          method: raw.method as OfflinePaymentMethod,
          amount: roundMoney(Number(raw.amount)),
          paidOn: toIsoDate(raw.paidOn)!
        };

        return raw.method !== 'cash' && number ? { ...line, checkNumber: number } : line;
      })
    };
  }

  /** The preview request, or `null` while any field has a problem — the server would only answer `400`. */
  private previewRequest(): PreviewOfflinePaymentRequest | null {
    return this.context() && !this.hasProblems() ? this.request() : null;
  }

  private runPreview(request: PreviewOfflinePaymentRequest | null): Observable<PreviewOutcome> {
    if (request === null) {
      return of(null);
    }

    return this.payments.preview(this.invoiceId, request).pipe(
      map((preview): PreviewOutcome => ({ preview })),
      catchError((err: HttpErrorResponse) => of<PreviewOutcome>({ error: describeRecordPaymentProblem(err) }))
    );
  }

  private applyPreview(outcome: PreviewOutcome): void {
    this.previewPending.set(false);

    if (outcome === null) {
      this.preview.set(null);
      this.previewError.set(null);
    } else if ('preview' in outcome) {
      this.preview.set(outcome.preview);
      this.previewError.set(null);
    } else {
      this.preview.set(null);
      this.previewError.set(outcome.error);
    }
  }
}
