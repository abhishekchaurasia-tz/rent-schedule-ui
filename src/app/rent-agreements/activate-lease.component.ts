import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import { RentAgreementsService } from './rent-agreements.service';
import { ActivateRentAgreementResponse } from './rent-agreement.models';

/**
 * The **Activate lease** action: opens the lease's billing gate and generates its first invoices.
 *
 * **Why a component rather than a method on each page.** The action is reachable from two places — the
 * tenants screen, where the wizard ends, and the Open/Edit Lease screen, where a saved lease is managed
 * (confirmed by the user 2026-08-26). Those two would otherwise each need the same status gate, the same
 * idempotency handling and the same three-way error rendering, and would drift the first time one of
 * them was touched. Here there is one of each, and a page adds the action with a single tag.
 *
 * **This component does not gate on the lease's status, and the reason it originally could not has
 * since been fixed.** It used to explain at length that `status` "stays `InProcess` on an activated
 * lease, verified against a running service on 2026-08-26" — which was true: the detail response read
 * that field from a stored column nothing ever wrote, so it answered `InProcess` for every lease
 * however long it had been active. **Backend v73 dropped the column and computes the field**, so
 * `status` now reports `Active`, `Expiring`, `Expired`, `Terminating`, `Terminated` and `Archived`
 * correctly — and `LeaseLifecycleComponent` next door does gate on it.
 *
 * This component's behaviour is nonetheless unchanged, and safely so: the button is offered until the
 * server has answered, and the answer states the truth. That works because the endpoint is idempotent
 * by contract — pressing it on an already-active lease raises nothing and returns
 * `alreadyActive: true` — so the worst case is a redundant call, not a wrong outcome.
 *
 * **Worth doing, not done here:** now that `status` can be trusted, this control could hide itself for
 * any lease past `InProcess`, and the three lifecycle actions could share one component. Recorded as
 * out of scope in UI spec `05-lease-lifecycle-ui.md`.
 *
 * **What the API can answer, and what each answer means here:**
 *
 * | Response | Meaning | Rendered as |
 * |---|---|---|
 * | `200`, `alreadyActive: false` | genuinely activated, `invoicesGenerated` raised | success, with the count |
 * | `200`, `alreadyActive: true` | a repeat; nothing changed | success, stated as a repeat — **not** an error |
 * | `409` | the `version` sent is below the stored one | error |
 * | `422` | begin date has not arrived, or the payer lanes cannot be billed | error |
 * | `404` | no such agreement | error |
 *
 * The `422` is the one a demo hits most: a lease whose start date is still in the future cannot be
 * activated, and neither can one with no tenants saved, since the payer lanes are derived from them.
 * That is why the failure text is rendered verbatim from the Problem Details `detail` rather than
 * flattened into "activation failed".
 */
@Component({
  selector: 'app-activate-lease',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './activate-lease.component.html',
  styleUrl: './activate-lease.component.scss'
})
export class ActivateLeaseComponent {
  /** The lease to activate. */
  @Input({ required: true }) agreementId!: string;

  /**
   * Raised after a successful call — including a repeat — so the host can re-read the agreement and
   * show its new status without the user reloading.
   */
  @Output() readonly activated = new EventEmitter<ActivateRentAgreementResponse>();

  readonly activating = signal(false);
  readonly activateError = signal<string | null>(null);
  readonly activateResult = signal<ActivateRentAgreementResponse | null>(null);

  /**
   * Whether the button is still on offer.
   *
   * Hidden only once the server has confirmed the lease is active — either this click activated it, or
   * it answered `alreadyActive`. A **failure leaves the button up**, because the most common failure is
   * the `422` for a begin date that has not arrived yet, and that becomes activatable simply by waiting.
   */
  readonly canActivate = computed(() => this.activateResult() === null);

  constructor(private readonly rentAgreementsService: RentAgreementsService) {}

  activate(): void {
    if (!this.agreementId || this.activating()) {
      return;
    }

    this.activating.set(true);
    this.activateError.set(null);
    this.activateResult.set(null);

    this.rentAgreementsService
      .activate(this.agreementId, {
        // The agreement's own id doubles as the lease id — this app has no Lease service to mint one,
        // and pairing them keeps the demo's two sides obviously the same lease.
        leaseId: this.agreementId,
        // The ordering fence. Nothing here issues versions, so a first activation sends 1; a repeat at
        // the same version is idempotent rather than a 409, which is exactly the contract's promise.
        version: 1,
        activatedAt: new Date().toISOString()
      })
      .subscribe({
        next: (response) => {
          this.activateResult.set(response);
          this.activating.set(false);
          this.activated.emit(response);
        },
        error: (err: HttpErrorResponse) => {
          this.activateError.set(ActivateLeaseComponent.describeError(err));
          this.activating.set(false);
        }
      });
  }

  /** Mirrors the error rendering the other rent-agreement screens use. */
  private static describeError(err: HttpErrorResponse): string {
    const problemDetail = err.error?.detail;
    return typeof problemDetail === 'string' && problemDetail
      ? problemDetail
      : `Request failed: ${err.status} ${err.statusText}`;
  }
}
