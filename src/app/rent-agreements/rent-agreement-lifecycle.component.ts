import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Output, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  ArchiveRentAgreementResponse,
  TerminateRentAgreementResponse
} from './rent-agreement.models';
import { RentAgreementsService } from './rent-agreements.service';

/** Which action the user is confirming, or `null` when neither. */
type PendingAction = 'terminate' | 'archive' | null;

/**
 * The **end** of a lease: **Terminate** it on a chosen date, or **Archive** it as of today
 * (backend spec `01-rent-agreement.md` v74, FR-094 – FR-107).
 *
 * **Why one component for two actions.** On the backend they are one operation with a different
 * cutoff — terminate cuts at a stated date, archive cuts at today — and they share everything this
 * component actually contains: the confirmation step, the version, the idempotent-repeat rendering and
 * the error handling. Two components would duplicate all of that to vary one request body.
 *
 * **Why this one gates on `status` when its sibling does not.** `ActivateLeaseComponent` was written
 * when the detail response's `status` answered `InProcess` for every lease however long it had been
 * active — it was read from a stored column nothing ever wrote. Backend v73 dropped that column and
 * computes the field, so it can now be trusted, and this component offers only the actions the lease's
 * status permits. That matters: a button that reliably answers `422` is worse than no button.
 *
 * **What it deliberately does not do.** It never decides what happens to the money. The backend's
 * recompute removes the withdrawn cycles' unissued invoices, corrects issued-unpaid ones forward, and
 * protects anything carrying a payment or already past due. Every count and status this component
 * shows comes from the response; a figure computed here would look authoritative and be wrong.
 *
 * **What each status offers:**
 *
 * | Reported status | Terminate | Archive |
 * |---|---|---|
 * | `InProcess` | — | — (nothing to withdraw; the backend refuses with `422`) |
 * | `Future`, `Active`, `Expiring` | yes | yes |
 * | `Terminating`, `Terminated` | — (already recorded) | yes |
 * | `Expired` | — | yes |
 * | `Archived` | — | — (terminal; there is no un-archive) |
 */
@Component({
  selector: 'app-rent-agreement-lifecycle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rent-agreement-lifecycle.component.html',
  styleUrl: './rent-agreement-lifecycle.component.scss'
})
export class RentAgreementLifecycleComponent {
  /** The lease to act on. */
  readonly agreementId = input.required<string>();

  /**
   * The lease's currently reported status, straight from `RentAgreementDetailResponse.status`. The
   * host re-passes it after reloading, so the offered actions follow the lease.
   *
   * **A signal input, not a plain `@Input`, and that is load-bearing.** `canTerminate` and friends are
   * `computed()`, and a `computed` tracks *signals* — handed a plain field it evaluates once and
   * caches forever. Written that way first, the gating was correct on the first render and then never
   * updated: after terminating, the host reloaded and re-passed `Terminating`, and the Terminate
   * button was still on offer. Caught by running the app, not by the tests, because the specs set the
   * input once and never changed it.
   */
  readonly status = input.required<string>();

  /**
   * Raised after any successful call — **including a repeat** — so the host re-reads the lease. The
   * status chip, the offered actions and the schedule then all come from one server read and cannot
   * disagree with each other.
   */
  @Output() readonly changed = new EventEmitter<void>();

  /** Which action is being confirmed, if any. */
  readonly pendingAction = signal<PendingAction>(null);

  /** The termination's effective date, `YYYY-MM-DD`, defaulting to today. */
  readonly effectiveDate = signal(RentAgreementLifecycleComponent.today());

  readonly working = signal(false);

  readonly terminateResult = signal<TerminateRentAgreementResponse | null>(null);

  readonly archiveResult = signal<ArchiveRentAgreementResponse | null>(null);

  readonly error = signal<string | null>(null);

  /**
   * A lease can be ended only while its billing gate is open and it has not already ended. `InProcess`
   * is excluded because an unactivated draft has nothing to withdraw.
   */
  readonly canTerminate = computed(() =>
    ['Future', 'Active', 'Expiring'].includes(this.status())
  );

  /**
   * Archive is offered wherever a lease exists to withdraw — including one already terminated or
   * expired, since `Archived` outranks both. Only a draft and an already-archived lease are excluded.
   */
  readonly canArchive = computed(() => this.status() !== 'InProcess' && this.status() !== 'Archived');

  /** `true` once this lease is closed for good. */
  readonly isArchived = computed(() => this.status() === 'Archived');

  /**
   * `true` for an unactivated draft. The component renders **nothing** in that case: ending a lease is
   * not an action that exists yet for one with nothing to withdraw, and the Activate control beside
   * this one is the whole story at that point.
   */
  readonly isDraft = computed(() => this.status() === 'InProcess');

  /**
   * `true` once a termination is recorded — the state where Terminate is gone and Archive is the only
   * action left. Worth naming, because a row that has silently lost a button needs to say why.
   */
  readonly isEnding = computed(() => ['Terminating', 'Terminated'].includes(this.status()));

  constructor(private readonly rentAgreementsService: RentAgreementsService) {}

  /** Opens the confirmation for one of the two actions, clearing any previous outcome. */
  confirm(action: Exclude<PendingAction, null>): void {
    this.pendingAction.set(action);
    this.error.set(null);
    this.terminateResult.set(null);
    this.archiveResult.set(null);
  }

  /** Abandons the confirmation without calling anything. */
  cancel(): void {
    this.pendingAction.set(null);
  }

  /** Ends the lease on the picked date. */
  terminate(): void {
    if (this.working()) {
      return;
    }

    this.working.set(true);
    this.error.set(null);

    this.rentAgreementsService
      .terminate(this.agreementId(), {
        effectiveDate: this.effectiveDate(),
        terminatedAt: new Date().toISOString(),
        // The ordering fence. The backend rejects only a version BELOW the stored one, and nothing
        // here issues versions, so 1 passes after an activation that also sent 1 — the same constant
        // ActivateLeaseComponent sends, for the same reason.
        version: 1
      })
      .subscribe({
        next: (response) => this.settle(() => this.terminateResult.set(response)),
        error: (err: HttpErrorResponse) => this.fail(err)
      });
  }

  /** Withdraws the lease as of today. */
  archive(): void {
    if (this.working()) {
      return;
    }

    this.working.set(true);
    this.error.set(null);

    this.rentAgreementsService
      .archive(this.agreementId(), {
        archivedAt: new Date().toISOString(),
        version: 1
      })
      .subscribe({
        next: (response) => this.settle(() => this.archiveResult.set(response)),
        error: (err: HttpErrorResponse) => this.fail(err)
      });
  }

  /** Today as `YYYY-MM-DD`, the effective date's default and the earliest sensible pick. */
  private static today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Mirrors the error rendering the other rent-agreement screens use. */
  private static describeError(err: HttpErrorResponse): string {
    const problemDetail = err.error?.detail;
    return typeof problemDetail === 'string' && problemDetail
      ? problemDetail
      : `Request failed: ${err.status} ${err.statusText}`;
  }

  /**
   * Records the outcome, closes the confirmation, and tells the host to reload. Emitted on a repeat
   * too: the lease's stored state is what the screen should show either way.
   */
  private settle(record: () => void): void {
    record();
    this.working.set(false);
    this.pendingAction.set(null);
    this.changed.emit();
  }

  /** Leaves the confirmation open on failure, so the user can correct the date and retry. */
  private fail(err: HttpErrorResponse): void {
    this.error.set(RentAgreementLifecycleComponent.describeError(err));
    this.working.set(false);
  }
}
