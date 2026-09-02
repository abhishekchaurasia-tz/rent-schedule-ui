import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, computed, input, signal } from '@angular/core';
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
 * **It gates on the lease's status, which it could not always do.** This component used to carry a
 * long comment explaining why: `status` "stays `InProcess` on an activated lease, verified against a
 * running service on 2026-08-26". That was true — the detail response read the field from a stored
 * column nothing ever wrote, so it answered `InProcess` for every lease however long it had been
 * active, and no screen could trust it. **Backend v73 dropped the column and computes the field.**
 *
 * So the button now appears only for a draft (see {@link status}), and the three lease-level actions
 * are offered one at a time: **Activate** for a draft, then **Terminate** and **Archive** for a live
 * lease. Before, a screen had to show all three at once with two of them certain to be refused.
 *
 * Idempotency is still the safety net rather than the mechanism: the endpoint answers
 * `alreadyActive: true` rather than conflicting, so even a stale gate costs a redundant call and not a
 * wrong outcome. And the gate stays open on a **failure** — the commonest is the `422` for a begin
 * date that has not arrived, which becomes activatable simply by waiting.
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
   * The lease's reported status, when the host knows it.
   *
   * **Optional, and `null` means "unknown — offer anyway".** A host that has not loaded the lease yet
   * cannot gate on anything, and refusing to show the button then would hide the action on the very
   * screen that needs it. Once a status is passed, the button appears only for `InProcess`: every
   * other status means the gate is already open, and activating again would be a call the user has no
   * reason to make.
   *
   * A signal input because {@link canActivate} is a `computed` — a `computed` handed a plain `@Input`
   * evaluates once and caches, which is a defect this component's sibling shipped and had to fix.
   */
  readonly status = input<string | null>(null);

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
   * Two things hide it: the server confirming the lease is active — either this click activated it, or
   * it answered `alreadyActive` — or a passed {@link status} that is past `InProcess`. A **failure
   * leaves the button up**, because the most common failure is the `422` for a begin date that has not
   * arrived yet, and that becomes activatable simply by waiting.
   */
  readonly canActivate = computed(() => {
    const status = this.status();

    return this.activateResult() === null && (status === null || status === 'InProcess');
  });

  /**
   * Whether the lease is over, so the status chip is styled as closed rather than as live.
   *
   * The chip is green, which reads as "all well" — right for `Active` and wrong for a lease that has
   * ended. An archived lease showed a green `ARCHIVED` chip until this existed.
   */
  readonly isClosed = computed(() =>
    ['Expired', 'Terminated', 'Archived'].includes(this.status() ?? '')
  );

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
