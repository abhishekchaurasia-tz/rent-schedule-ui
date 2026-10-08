import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { reloadOnScopeChange } from '../scope-change';
import {
  CreateDepositRefundRequest,
  DepositRefundResponse,
  DepositReturnMethod,
  FundsReturnedRowResponse,
  FundsReturnedStatus
} from './deposit-refund.models';
import { DepositRefundService } from './deposit-refund.service';
import { DepositRefundProblem, describeProblem, tenantDisplayName } from './deposit-refund.util';
import { ReturnDepositPanelComponent } from './return-deposit-panel.component';

/** Matches a canonical 8-4-4-4-12 UUID, case-insensitive — the same check the other id screens use. */
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The one refusal that may have queued the return anyway (backend BR-23, BR-26). */
const SUBMISSION_UNCONFIRMED = 'deposit_refund.submission_unconfirmed';

/** A page-level outcome: what just happened, and anything the owner should do about it. */
export interface DepositRefundNotice {
  kind: 'success' | 'warn';
  title: string;
  body: string | null;
}

/** A row action awaiting its confirmation. */
export interface PendingRowAction {
  refundId: string;
  action: 'cancel' | 'remove';
}

/**
 * The **Deposit Refund** page: one deposit invoice's refund view, the *Refund Deposit* action, the
 * *Funds Returned* block and its row actions.
 *
 * Specified in `docs/specs/rent-agreements/09-deposit-refund-ui.md`; the client half of backend
 * `15-deposit-refund.md` v2.
 *
 * **Every figure and every gate is the server's.** Whether the deposit may be refunded, what was paid,
 * returned and is still held, and whether a return may be cancelled or removed are all derived by Billing
 * on each request from a live Finance read. This page renders them; the only arithmetic on screen is the
 * panel's running totals, which the server checks again before anything moves.
 *
 * **Every write is followed by a re-read rather than a local patch.** A return is *queued* (`202`), not
 * made; a cancel or remove changes what Finance reports. In each case the view the server computes next
 * is the only honest one, and patching rows locally would have to re-derive the rules it applies.
 */
@Component({
  selector: 'app-deposit-refund',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ReturnDepositPanelComponent],
  templateUrl: './deposit-refund.component.html',
  styleUrl: './deposit-refund.component.scss'
})
export class DepositRefundComponent implements OnInit {
  /** How each row status reads — the owner app's words (backend BR-08). */
  private static readonly StatusLabels: Record<FundsReturnedStatus, string> = {
    initiated: 'Initiated',
    processing: 'Processing',
    refunded: 'Refunded',
    issued: 'Issued'
  };

  /** How each instrument reads. */
  private static readonly MethodLabels: Record<DepositReturnMethod, string> = {
    unknown: 'Unknown',
    credit_card: 'Credit Card',
    check: 'Check',
    ach: 'ACH',
    cash: 'Cash',
    money_order: 'Money Order',
    innago_paper_check: 'Innago Paper Check',
    livble: 'Livble'
  };

  /** The owner app's tooltip on a fully refunded deposit (FR 4), and the server's `already_fully_refunded`. */
  readonly fullyRefundedTooltip = 'Deposit has already been refunded.';

  readonly invoiceIdInput = new FormControl('', { nonNullable: true });
  readonly idError = signal<string | null>(null);

  readonly loading = signal(false);
  readonly loadError = signal<DepositRefundProblem | null>(null);

  /** The refund view on screen, or `null` before a load and after a failed one. */
  readonly view = signal<DepositRefundResponse | null>(null);

  readonly panelOpen = signal(false);
  readonly submitting = signal(false);

  /** A refused return, shown above the still-open panel so the entries can be corrected (FR 13). */
  readonly submitError = signal<DepositRefundProblem | null>(null);

  /** What the last return, cancel or remove did. */
  readonly notice = signal<DepositRefundNotice | null>(null);

  /** A refused cancel or remove. A page banner, not a menu line: a re-read can take the row away. */
  readonly actionError = signal<{ title: string; problem: DepositRefundProblem } | null>(null);

  /** The return whose ⋮ menu is open — one at a time, as on the Invoices list. */
  readonly openRowMenuRefundId = signal<string | null>(null);

  /**
   * Where the open menu sits, from the clicked button's bounding rect. Rendered as a sibling of the
   * scrolling table for the Invoices list's reason: an ancestor's `overflow` clips a descendant's paint,
   * `position: fixed` included.
   */
  readonly rowMenuPosition = signal<{ top: number; left: number } | null>(null);

  readonly pendingRowAction = signal<PendingRowAction | null>(null);

  /** The return whose cancel or remove is in flight, guarding a double confirmation. */
  readonly workingRefundId = signal<string | null>(null);

  /** The invoice last asked for — what a refresh re-reads, even after a failed first load. */
  private requestedInvoiceId: string | null = null;

  constructor(
    private readonly depositRefunds: DepositRefundService,
    private readonly route: ActivatedRoute
  ) {
    // Requirement 15g (spec 01) and FR 19. A view on screen was read as whoever the scope said at the
    // time. Re-reading it is safe even with the panel open: the panel builds its rows once and keeps
    // what was typed, while the figures it checks against become the new scope's.
    reloadOnScopeChange(() => this.refresh());
  }

  /**
   * Loads the invoice named by `?invoiceId=` — how the Invoices list's row menu opens this page. Put
   * through the same GUID check as a typed id: a hand-edited URL is exactly as untrusted as typing.
   */
  ngOnInit(): void {
    const invoiceId = this.route.snapshot.queryParamMap.get('invoiceId');
    if (invoiceId) {
      this.invoiceIdInput.setValue(invoiceId);
      this.load();
    }
  }

  /** Loads the typed invoice's refund view, clearing everything the previous one put on screen. */
  load(): void {
    const id = this.invoiceIdInput.value.trim();

    if (!id) {
      this.idError.set('Enter an invoice id.');
      return;
    }

    if (!GUID_PATTERN.test(id)) {
      this.idError.set('That is not a valid id. It should look like 8f14e45f-ceea-467e-bd9f-000000000001.');
      return;
    }

    this.idError.set(null);
    this.view.set(null);
    this.notice.set(null);
    this.actionError.set(null);
    this.closePanel();
    this.closeRowMenu();

    this.requestedInvoiceId = id;
    this.fetch(id);
  }

  /** Re-reads the current invoice's view, keeping the outcome banners that explain why. */
  refresh(): void {
    if (this.requestedInvoiceId) {
      this.fetch(this.requestedInvoiceId);
    }
  }

  // ---- the action (FR 4, 5) ----------------------------------------------------------------------

  /** *Refund Deposit* is shown on a deposit invoice that is fully paid — refunded or not (FR 4). */
  get showsRefundAction(): boolean {
    const view = this.view();
    return !!view && view.isDepositInvoice && view.isFullyPaid;
  }

  get refundActionDisabled(): boolean {
    return !!this.view()?.isDepositFullyRefunded;
  }

  /** Opens *Return Deposit* — only when the server says the deposit can be refunded (BR-03). */
  openPanel(): void {
    if (!this.view()?.canRefundDeposit) {
      return;
    }

    this.submitError.set(null);
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.panelOpen.set(false);
    this.submitError.set(null);
  }

  /**
   * Sends the panel's request — once (FR 11). The panel stays open until the server answers, because a
   * `422` is routine and closing would throw away what was typed.
   *
   * **`submission_unconfirmed` is the one failure that closes it** (FR 14). Finance may have queued the
   * return before the answer was lost, so the owner is shown *Funds Returned* afresh with the server's
   * warning, rather than left one click from queueing the same return twice.
   */
  onReturnSubmitted(request: CreateDepositRefundRequest): void {
    const view = this.view();
    if (!view || this.submitting()) {
      return;
    }

    this.submitError.set(null);
    this.notice.set(null);
    this.actionError.set(null);
    this.submitting.set(true);

    this.depositRefunds.create(view.invoiceId, request).subscribe({
      next: () => {
        this.submitting.set(false);
        this.panelOpen.set(false);
        this.notice.set({
          kind: 'success',
          title:
            request.mode === 'offline'
              ? 'Offline deposit return has been recorded successfully.'
              : 'Online deposit return has been recorded successfully.',
          body:
            'Accepted means queued at Finance, not yet refunded: the return is listed under Funds Returned ' +
            'once Finance has processed it, which can take a moment. The view below has been re-read.'
        });
        this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const problem = describeProblem(err);

        if (problem.code === SUBMISSION_UNCONFIRMED) {
          this.panelOpen.set(false);
          this.notice.set({
            kind: 'warn',
            title: 'The deposit return may or may not have been recorded.',
            body: problem.message
          });
          this.refresh();
          return;
        }

        this.submitError.set(problem);
      }
    });
  }

  // ---- Funds Returned (FR 15, 18) ----------------------------------------------------------------

  statusLabel(status: FundsReturnedStatus): string {
    return DepositRefundComponent.StatusLabels[status] ?? status;
  }

  methodLabel(method: DepositReturnMethod): string {
    return DepositRefundComponent.MethodLabels[method] ?? method;
  }

  /** The number for a check or money order; *N/A* for cash, which has none; *—* for anything online. */
  checkNumberLabel(row: FundsReturnedRowResponse): string {
    return row.checkNumber ?? (row.method === 'cash' ? 'N/A' : '—');
  }

  /** The server's payer name, else the tenant row's, else the app's stand-in for that tenant (FR 18). */
  payerLabel(row: FundsReturnedRowResponse): string {
    const tenant = this.view()?.tenants.find((candidate) => candidate.tenantId === row.tenantId);
    return tenantDisplayName(row.tenantId, row.payerName ?? tenant?.name);
  }

  /**
   * The date as the server wrote it. Not `DatePipe`, which converts to the browser's zone and can move a
   * return across midnight; the full value is on hover.
   */
  datePart(value: string | null): string {
    return value ? value.slice(0, 10) : '—';
  }

  hasRowActions(row: FundsReturnedRowResponse): boolean {
    return row.canCancel || row.canRemove;
  }

  // ---- row actions (FR 16) -----------------------------------------------------------------------

  /** The row the open menu belongs to, or `null` once a re-read has taken it away. */
  menuRow(): FundsReturnedRowResponse | null {
    const id = this.openRowMenuRefundId();
    return id ? (this.view()?.fundsReturned.find((row) => row.refundId === id) ?? null) : null;
  }

  toggleRowMenu(row: FundsReturnedRowResponse, event: MouseEvent): void {
    if (this.openRowMenuRefundId() === row.refundId) {
      this.closeRowMenu();
      return;
    }

    // Offset by the menu's confirm-step width so its right edge lines up with the button's.
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.rowMenuPosition.set({ top: rect.bottom, left: rect.right - 240 });
    this.openRowMenuRefundId.set(row.refundId);
    this.pendingRowAction.set(null);
  }

  closeRowMenu(): void {
    this.openRowMenuRefundId.set(null);
    this.rowMenuPosition.set(null);
    this.pendingRowAction.set(null);
  }

  /** Swaps the menu to the confirmation for one action. Nothing is called yet. */
  beginRowAction(row: FundsReturnedRowResponse, action: 'cancel' | 'remove'): void {
    this.actionError.set(null);
    this.pendingRowAction.set({ refundId: row.refundId, action });
  }

  /** Abandons the confirmation and closes the menu without calling anything. */
  cancelRowAction(): void {
    this.closeRowMenu();
  }

  /**
   * Runs the confirmed cancel or remove, then re-reads the view.
   *
   * A failure is reported as a page banner. On `submission_unconfirmed` the view is re-read as well:
   * Finance may have removed the return before the answer was lost, and *Funds Returned* is where the
   * owner checks.
   */
  confirmRowAction(row: FundsReturnedRowResponse): void {
    const view = this.view();
    const pending = this.pendingRowAction();
    if (!view || !pending || pending.refundId !== row.refundId || this.workingRefundId()) {
      return;
    }

    this.workingRefundId.set(row.refundId);
    this.actionError.set(null);
    this.notice.set(null);

    const request =
      pending.action === 'cancel'
        ? this.depositRefunds.cancel(view.invoiceId, row.refundId)
        : this.depositRefunds.remove(view.invoiceId, row.refundId);

    request.subscribe({
      next: () => {
        this.workingRefundId.set(null);
        this.closeRowMenu();
        this.notice.set({
          kind: 'success',
          title: pending.action === 'cancel' ? 'The online return was cancelled.' : 'The offline return was removed.',
          body: null
        });
        this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        this.workingRefundId.set(null);
        this.closeRowMenu();
        const problem = describeProblem(err);
        this.actionError.set({
          title: pending.action === 'cancel' ? 'The return was not cancelled.' : 'The return was not removed.',
          problem
        });

        if (problem.code === SUBMISSION_UNCONFIRMED) {
          this.refresh();
        }
      }
    });
  }

  /**
   * Reads the view. A failure clears it rather than leaving the previous figures up: a stale view beside
   * an error reads as current, and every figure here sets what may be refunded (FR 2).
   */
  private fetch(invoiceId: string): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.depositRefunds.get(invoiceId).subscribe({
      next: (view) => {
        this.view.set(view);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.view.set(null);
        this.panelOpen.set(false);
        this.loadError.set(describeProblem(err));
      }
    });
  }
}
