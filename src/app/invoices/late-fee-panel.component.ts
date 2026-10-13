import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Subscription, concatMap, take, takeWhile, tap, timer } from 'rxjs';

import { ApplyLateFeesRequest, ApplyLateFeesResponse, LateFeeSummaryResponse } from './late-fee.models';

/** One line of the apply form. The amount is not a control: it is worked out (FR 8). */
interface LateFeeLineControls {
  lineKey: FormControl<string>;
  description: FormControl<string>;
  quantity: FormControl<number>;
  rate: FormControl<number>;
}
import { LateFeeService } from './late-fee.service';

/**
 * One invoice's late fee, in a side panel opened from the invoice list's ⋮ menu: the figures, the two
 * marks that stop further late fees, and the late fee lines.
 *
 * Specified in `docs/specs/rent-agreements/07-late-fee-ui.md` (FR 3 to FR 13), on Billing spec
 * `17-late-fee-consumer.md` v13.
 *
 * **Every figure is the backend's.** The panel shows what `GET …/late-fee` answers and works nothing out:
 * which part of the late fee is paid, and what a removal would take off, are the backend's rule (BR-11).
 *
 * **A change reaches the figures late.** The marks are the billing plan's and move as soon as a change
 * commits; the amounts and lines are the issued invoice's and move only once the reconcile has run. So after
 * a change the panel re-reads, a second apart and at most ten times, until the late fee reads what the change
 * leaves (FR 12).
 *
 * **The apply form is for testing** (backend D28): it sends a list exactly as the late fee event would. It
 * refuses what the backend refuses before anything is sent (FR 10), and still shows the backend's refusal.
 */
@Component({
  selector: 'app-late-fee-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './late-fee-panel.component.html',
  styleUrl: './late-fee-panel.component.scss'
})
export class LateFeePanelComponent implements OnInit, OnDestroy {
  /** How many times the panel re-reads after a change before it stops and offers Refresh (FR 12). */
  private static readonly MaxReReads = 10;

  /** How long it waits between two re-reads, in milliseconds. */
  private static readonly ReReadIntervalMs = 1000;

  /** The largest whole quantity the backend's column holds (backend BR-39). */
  private static readonly MaxQuantity = 9_999_999_999;

  /** The largest rate or amount the backend's columns hold (backend BR-39). */
  private static readonly MaxMoney = 999_999_999_999.99;

  /** A skip reason's code, in the words the panel shows (spec FR 11). */
  private static readonly SkipWords: Record<string, string> = {
    unknown_invoice: 'no such invoice for this owner',
    invoice_withdrawn: 'the invoice is voided or deleted',
    rent_agreement_not_found: 'its rent agreement was not found',
    rent_agreement_archived: 'its rent agreement is archived',
    proposal_ended: 'its billing plan entry has ended',
    deposit_invoice: 'a deposit invoice takes no late fee',
    late_fee_removed: 'late fees are stopped on this invoice',
    paid_in_full: 'the invoice is paid in full',
    older_calculation: 'a newer calculation was already applied'
  };
  /** The invoice whose late fee this is. */
  @Input({ required: true }) invoiceId!: string;

  /** The invoice's wire status, which decides whether the panel offers changes (FR 5). */
  @Input() invoiceStatus = '';

  /** The user closed the panel. */
  @Output() readonly closed = new EventEmitter<void>();

  /** The late fee changed, so the list behind the panel is stale. */
  @Output() readonly changed = new EventEmitter<void>();

  /** The last answer of `GET …/late-fee`, or `null` before it arrives or when it failed. */
  readonly summary = signal<LateFeeSummaryResponse | null>(null);

  readonly loading = signal(false);

  /** The last refusal, as "{status} — {detail}" (FR 13). */
  readonly error = signal<string | null>(null);

  /** Whether the removal's confirmation is showing (FR 6). */
  readonly confirmingRemoval = signal(false);

  /** Whether a removal is in flight. */
  readonly removing = signal(false);

  /** Whether the re-reads ran out before the invoice caught up with the change (FR 12). */
  readonly stale = signal(false);

  /** Whether the apply form is showing (FR 8). */
  readonly applying = signal(false);

  /** Whether the user has tried to send, after which the form's problems show (FR 10). */
  readonly sendAttempted = signal(false);

  /** Whether a list is in flight. */
  readonly sending = signal(false);

  /** What the last sent list came to, in words (FR 11). */
  readonly outcome = signal<string | null>(null);

  /** The apply form: a calculation time and the lines (FR 8, FR 9). */
  readonly applyForm: FormGroup<{ calculatedAtUtc: FormControl<string>; lines: FormArray<FormGroup<LateFeeLineControls>> }>;

  /** The re-reads after a change, cancelled when another starts or the panel closes. */
  private reReads: Subscription | null = null;

  constructor(
    private readonly lateFees: LateFeeService,
    private readonly fb: NonNullableFormBuilder
  ) {
    this.applyForm = this.fb.group({
      calculatedAtUtc: this.fb.control(new Date().toISOString()),
      lines: this.fb.array<FormGroup<LateFeeLineControls>>([])
    });
  }

  /** The apply form's lines. */
  get lines(): FormArray<FormGroup<LateFeeLineControls>> {
    return this.applyForm.controls.lines;
  }

  /** Reads the late fee as soon as the panel opens. */
  ngOnInit(): void {
    this.load();
  }

  /** Stops any re-reads: the panel is gone. */
  ngOnDestroy(): void {
    this.reReads?.unsubscribe();
  }

  /**
   * Whether the panel offers changes: not on a voided or deleted invoice, which the backend refuses to
   * change (FR 5), as the list hides Delete and Void there.
   */
  get canChange(): boolean {
    return this.invoiceStatus !== 'voided' && this.invoiceStatus !== 'deleted';
  }

  /** Shows the apply form, empty, with the calculation time set to now (FR 8, FR 9). */
  openApply(): void {
    this.lines.clear();
    this.applyForm.controls.calculatedAtUtc.setValue(new Date().toISOString());
    this.sendAttempted.set(false);
    this.outcome.set(null);
    this.error.set(null);
    this.applying.set(true);
  }

  /** Hides the apply form, sending nothing. */
  cancelApply(): void {
    this.applying.set(false);
  }

  /** Adds an empty line to the form. */
  addLine(): void {
    this.lines.push(
      this.fb.group({
        lineKey: this.fb.control(''),
        description: this.fb.control(''),
        quantity: this.fb.control(1),
        rate: this.fb.control(0)
      })
    );
  }

  /** Drops line `index` from the form. */
  removeLine(index: number): void {
    this.lines.removeAt(index);
  }

  /** Line `index`'s amount, worked out as quantity × rate and rounded to the cent (FR 8; backend BR-38). */
  amount(index: number): number {
    const { quantity, rate } = this.lines.at(index).getRawValue();

    return Math.round(Number(quantity) * Number(rate) * 100) / 100;
  }

  /**
   * Everything the backend would refuse in the form as it stands, in words, so nothing malformed is sent
   * (FR 9, FR 10; backend inbound contract, A10, BR-37 to BR-39). Empty when the list may be sent.
   */
  problems(): string[] {
    const found: string[] = [];
    const calculatedAt = this.applyForm.controls.calculatedAtUtc.value.trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(calculatedAt) || Number.isNaN(Date.parse(calculatedAt))) {
      found.push('The calculation time must be an ISO 8601 date and time, such as 2026-08-20T06:00:00Z.');
    }

    const max = LateFeePanelComponent.MaxMoney.toLocaleString('en-US', { minimumFractionDigits: 2 });
    this.lines.controls.forEach((line, index) => {
      const n = index + 1;
      const { lineKey, description, quantity, rate } = line.getRawValue();
      const key = lineKey.trim();
      if (key.length === 0) {
        found.push(`Line ${n} needs a key.`);
      } else if (key.length > 100) {
        found.push(`Line ${n}: the key may be at most 100 characters.`);
      }

      if (description.trim().length === 0) {
        found.push(`Line ${n} needs a description.`);
      } else if (description.length > 200) {
        found.push(`Line ${n}: the description may be at most 200 characters.`);
      }

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > LateFeePanelComponent.MaxQuantity) {
        found.push(`Line ${n}: the quantity must be a whole number from 1 to 9,999,999,999.`);
      }

      if (!(rate > 0)) {
        found.push(`Line ${n}: the rate must be greater than 0.`);
      } else if (Math.abs(Math.round(rate * 100) - rate * 100) > 1e-6) {
        found.push(`Line ${n}: the rate may have at most 2 decimals.`);
      } else if (rate > LateFeePanelComponent.MaxMoney) {
        found.push(`Line ${n}: the rate may be at most ${max}.`);
      } else if (this.amount(index) > LateFeePanelComponent.MaxMoney) {
        found.push(`Line ${n}: the amount is over ${max}.`);
      }
    });

    const keys = this.lines.controls.map((line) => line.getRawValue().lineKey.trim()).filter((key) => key.length > 0);
    if (new Set(keys).size !== keys.length) {
      found.push('Each key may appear once in a list.');
    }

    return found;
  }

  /**
   * Sends the list (FR 11), unless the form has a problem (FR 10). An applied list that changed a line tells
   * the list and re-reads until the late fee reads the list's total (FR 12).
   */
  send(): void {
    this.sendAttempted.set(true);
    this.outcome.set(null);
    this.error.set(null);
    if (this.problems().length > 0) {
      return;
    }

    const request: ApplyLateFeesRequest = {
      calculatedAtUtc: this.applyForm.controls.calculatedAtUtc.value.trim(),
      lines: this.lines.controls.map((line, index) => {
        const { lineKey, description, quantity, rate } = line.getRawValue();

        return { lineKey: lineKey.trim(), description, quantity, rate, amount: this.amount(index) };
      })
    };
    const total = request.lines.reduce((sum, line) => sum + line.amount, 0);

    this.sending.set(true);
    this.lateFees.apply(this.invoiceId, request).subscribe({
      next: (response) => {
        this.sending.set(false);
        this.outcome.set(LateFeePanelComponent.describeOutcome(response));
        if (response.outcome === 'applied' && response.linesChanged) {
          this.changed.emit();
          this.reReadUntil(total);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.sending.set(false);
        this.error.set(LateFeePanelComponent.describeError(err));
      }
    });
  }

  /** Shows the removal's confirmation. */
  askToRemove(): void {
    this.error.set(null);
    this.confirmingRemoval.set(true);
  }

  /** Hides the confirmation, sending nothing. */
  keepLateFee(): void {
    this.confirmingRemoval.set(false);
  }

  /**
   * Removes the late fee (FR 7): on `204` the list is told, and the panel re-reads until the late fee reads
   * the paid part it had before, which is all a removal keeps (backend BR-10, BR-11).
   */
  confirmRemoval(): void {
    const before = this.summary();
    this.confirmingRemoval.set(false);
    this.removing.set(true);
    this.error.set(null);
    this.lateFees.remove(this.invoiceId).subscribe({
      next: () => this.afterRemoval(before),
      complete: () => this.removing.set(false),
      error: (err: HttpErrorResponse) => {
        this.error.set(LateFeePanelComponent.describeError(err));
        this.removing.set(false);
      }
    });
  }

  /** Closes the panel. */
  close(): void {
    this.closed.emit();
  }

  /** Reads the invoice's late fee again, replacing what the panel shows. */
  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.stale.set(false);
    this.lateFees.get(this.invoiceId).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.summary.set(null);
        this.error.set(LateFeePanelComponent.describeError(err));
        this.loading.set(false);
      }
    });
  }

  /**
   * Re-reads after a change until the late fee reads `expected`, at most {@link MaxReReads} times, a second
   * apart; stops early once it does, and marks the panel stale when it never did (FR 12).
   */
  reReadUntil(expected: number): void {
    this.reReads?.unsubscribe();
    this.stale.set(false);
    this.reReads = timer(LateFeePanelComponent.ReReadIntervalMs, LateFeePanelComponent.ReReadIntervalMs)
      .pipe(
        take(LateFeePanelComponent.MaxReReads),
        concatMap(() => this.lateFees.get(this.invoiceId)),
        tap((summary) => this.summary.set(summary)),
        takeWhile((summary) => !LateFeePanelComponent.sameMoney(summary.lateFeeAmount, expected), true)
      )
      .subscribe({
        complete: () => {
          const last = this.summary();
          this.stale.set(last === null || !LateFeePanelComponent.sameMoney(last.lateFeeAmount, expected));
        },
        error: (err: HttpErrorResponse) => this.error.set(LateFeePanelComponent.describeError(err))
      });
  }

  /** What a sent list came to, in words (FR 11). */
  private static describeOutcome(response: ApplyLateFeesResponse): string {
    if (response.outcome === 'applied') {
      return response.linesChanged ? 'Applied: lines changed' : 'Applied: no line changed';
    }

    const reason = response.skipReason ?? '';

    return `Skipped: ${LateFeePanelComponent.SkipWords[reason] ?? reason}`;
  }

  /** Two amounts of money, compared to the cent. */
  private static sameMoney(left: number, right: number): boolean {
    return Math.round(left * 100) === Math.round(right * 100);
  }

  /**
   * After a `204`: the list is stale, and the late fee will read the paid part read before. A removal with
   * nothing unpaid leaves the amount as it was, so the panel reads once and does not wait.
   */
  private afterRemoval(before: LateFeeSummaryResponse | null): void {
    this.changed.emit();
    if (before === null || before.remainingLateFeeAmount === 0) {
      this.load();

      return;
    }

    this.reReadUntil(before.paidLateFeeAmount);
  }

  /**
   * A refusal as the panel shows it: its status, then the RFC 9457 `detail` verbatim, the way the invoice
   * list shows a row's refusal (spec `04` FR 25).
   */
  private static describeError(err: HttpErrorResponse): string {
    const detail = err.error?.detail;

    return typeof detail === 'string' && detail ? `${err.status} — ${detail}` : `${err.status} — ${err.statusText || 'Request failed'}`;
  }
}
