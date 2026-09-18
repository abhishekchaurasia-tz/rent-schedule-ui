import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, retry, throwError, timer } from 'rxjs';

import { placeholderTenantIdentity } from '../shared/tenant-identity.util';
import { AdditionalChargePanelComponent } from './additional-charge-panel.component';
import { RentAgreementsService } from './rent-agreements.service';
import {
  AdditionalChargeCreationRequest,
  AddAdditionalChargeRequest,
  AgreementTenantShareResponse,
  RentAgreementAdditionalChargeResponse,
  RentAgreementDetailResponse,
  UnbilledLineResponse
} from './rent-agreement.models';

/** Matches a canonical 8-4-4-4-12 UUID, case-insensitive — same shape check as the Open Lease screen. */
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * How long to wait before replaying a submission the server answered `409`.
 *
 * Short enough that the user reads it as the save taking a moment, long enough that the writer which
 * won the race has committed. It is a constant rather than a setting because a knob here would be a
 * knob nobody ever turns — and the retry is bounded to one attempt anyway.
 */
const CONFLICT_RETRY_DELAY_MS = 400;

/**
 * The **Add Additional Fee** page: appends one fee to an already-saved lease, charged to a chosen
 * subset of that lease's tenants, via `POST /rent/agreements/{id}/additional-charges`.
 *
 * Three stages in one screen, each gated on the one before it — paste a lease id, pick who pays,
 * author the fee — specified in `docs/specs/rent-agreements/02-add-additional-charge-ui.md`.
 *
 * **Why this is a separate page and not a button on the lease screen.** The lease screen collects
 * charges into the lease's own create/edit body, which is a whole-set replace and can therefore edit
 * and delete them. This endpoint is *additive only* and commits immediately — on an active lease it
 * may raise the fee's invoice in the same transaction. Those are different operations with different
 * consequences, and mixing them into one screen would make it ambiguous which one a click performed.
 *
 * **Who pays is authored in the fee panel, not here.** This page owned a tenant picker and a split
 * editor until the Invoices page needed the same one; both now live in
 * {@link AdditionalChargePanelComponent}, which shows them to any host that hands it a roster and to
 * no host that does not — which is how the lease create/edit screens still show no renter control at
 * all (spec `02` requirement 22). What this page still does is load the lease and its roster, and
 * hand both to the panel.
 *
 * **What only this page and the Invoices page can do:** say *who pays*. `tenantIds` has existed on the wire since the
 * backend's FR-058, but no screen has ever sent it, so every fee raised from this UI so far has been
 * shared by every tenant. Here an empty selection still means exactly that — it is the backend's own
 * encoding of "shared" — but a non-empty one finally charges a subset.
 *
 * The fee itself is authored by {@link AdditionalChargePanelComponent}, used **unchanged**. The
 * tenant selection lives here rather than in the panel because the lease screen hosts the same panel
 * and has nothing to fill such an input with; keeping it out leaves that screen untouched.
 */
@Component({
  selector: 'app-add-additional-charge',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, AdditionalChargePanelComponent],
  templateUrl: './add-additional-charge.component.html',
  styleUrl: './add-additional-charge.component.scss'
})
export class AddAdditionalChargeComponent {
  /** The pasted lease id. Shape-checked here; whether it exists is decided by the load. */
  readonly agreementIdInput = new FormControl('', { nonNullable: true });

  /** A malformed or empty id, reported without ever calling the API. */
  readonly idError = signal<string | null>(null);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  /** The loaded lease — the page's own "are we past stage one" flag, and the panel's data source. */
  readonly agreement = signal<RentAgreementDetailResponse | null>(null);

  /** The lease's **active** tenants and their recorded shares. Empty when step 2 was never saved. */
  readonly tenants = signal<AgreementTenantShareResponse[]>([]);

  /**
   * Whether step 2 was ever saved for this lease — `false` when the tenants endpoint answered `204`.
   *
   * Deliberately not inferred from `tenants().length`. "Nobody has been added yet" and "the roster is
   * saved and empty" are different facts, and only the first one warrants sending the user to the
   * ADD TENANTS screen.
   */
  readonly hasSavedTenants = signal(true);

  /** Whether the lease bills its tenants on one shared invoice — shown as context, never sent. */
  readonly isGroupInvoice = signal(false);

  readonly showPanel = signal(false);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

  /** The charges this page has committed, newest first, with their server ids. */
  readonly addedCharges = signal<RentAgreementAdditionalChargeResponse[]>([]);

  /**
   * The lines each committed charge could bill nowhere, keyed by that charge's id.
   *
   * **Keyed by charge rather than held as one "latest save" list** because the disclosure outlives the
   * save that produced it: this page adds fees one after another, and a second fee that bills fine
   * says nothing about the first, which the owner still has to act on.
   *
   * Not an error signal — `submitError` means the save failed; this means it succeeded and part of
   * what was recorded cannot reach an invoice.
   */
  readonly unbilledByCharge = signal<Record<string, UnbilledLineResponse[]>>({});

  constructor(private readonly service: RentAgreementsService) {}

  /** The owner whose line-item catalog the fee panel fetches. */
  get propertyOwnerId(): string | null {
    return this.agreement()?.propertyOwnerId ?? null;
  }

  /** The lease window the fee panel resolves its recurring start/end candidate dates against. */
  get leaseStartDate(): string | null {
    return this.agreement()?.startDate ?? null;
  }

  get leaseEndDate(): string | null {
    return this.agreement()?.endDate ?? null;
  }

  /**
   * How many cycles a month-to-month lease was generated for — what the panel's candidate-date
   * endpoint needs in place of an end date.
   *
   * The detail response carries no such field, so it is read off the generated schedule, which is
   * exactly what that count means. `null` for a fixed-term lease, where the end date answers instead.
   */
  get leaseMonthToMonthInvoiceCount(): number | null {
    const agreement = this.agreement();
    if (!agreement || agreement.endDate) {
      return null;
    }
    return agreement.scheduleRows.length || null;
  }

  /**
   * Loads the lease and its tenants **concurrently**, so the screen flips to "loaded" once rather
   * than filling in over two visible steps.
   */
  load(): void {
    const id = this.agreementIdInput.value.trim();

    if (!id) {
      this.idError.set('Enter a rent agreement id.');
      return;
    }

    if (!GUID_PATTERN.test(id)) {
      this.idError.set('That is not a valid id. It should look like 8f14e45f-ceea-467e-bd9f-000000000001.');
      return;
    }

    this.idError.set(null);
    this.loadError.set(null);
    this.resetLoadedState();
    this.loading.set(true);

    forkJoin({
      agreement: this.service.getById(id),
      tenants: this.service.getTenants(id)
    }).subscribe({
      next: ({ agreement, tenants }) => {
        this.agreement.set(agreement);
        this.hasSavedTenants.set(tenants !== null);
        this.tenants.set(tenants?.tenants ?? []);
        this.isGroupInvoice.set(tenants?.isGroupInvoice ?? false);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(AddAdditionalChargeComponent.describeError(err));
      }
    });
  }

  /** The stand-in person for a tenant id — the same one the ADD TENANTS screen shows. */
  tenantName(tenantId: string): string {
    const identity = placeholderTenantIdentity(tenantId);
    return `${identity.firstName} ${identity.lastName}`;
  }

  openPanel(): void {
    this.submitError.set(null);
    this.showPanel.set(true);
  }

  closePanel(): void {
    this.showPanel.set(false);
  }

  /**
   * Commits the fee the panel authored: its own fields at the body root, the split among them.
   *
   * **The panel is closed only once the server has answered.** A `422` here is routine — the
   * deposit/rent mixing rule, the recurring-field matrix, a lease that is not active — and closing on
   * emit would throw away everything the owner just typed in order to hit one.
   *
   * **Who pays is already on the charge.** It used to be this page's business: it owned a tenant
   * picker and a split editor, and merged the result in here. Both moved into the panel when the
   * Invoices page needed the same editor and the lease editor still needed none — the panel shows it
   * to whichever host hands it a roster. So this method no longer knows how a fee is divided, only
   * that it is.
   *
   * **Re-entrant submissions are dropped rather than queued**, and the `id` below is what makes the
   * retry safe. This remark used to end *"the panel emits no `id`, so the endpoint's idempotency key is
   * unavailable and a second POST would create a second charge, not replay the first"* — which was
   * precisely the gap. The key is minted here, so the request carries its own.
   *
   * **Why a `409` is retried at all.** A concurrent write to the same lease answers `409`, and nothing
   * about the submission is wrong — another writer simply won the race. It was measured on 2026-09-10
   * by submitting a fee immediately after activation, while that activation's own post-commit issuing
   * pass was still in flight. Without the key a retry risked a second charge, so the only honest thing
   * the screen could do was show the user an error they could answer only by clicking again. With the
   * key it cannot: the endpoint replays the submission and answers `200` when the first attempt did in
   * fact commit.
   *
   * **Once, and only for `409`.** A second conflict means something other than a lost race, and a
   * retry loop on a write turns one slow request into several. Every other status — the routine `422`s
   * especially — still reaches the user unchanged.
   */
  onChargeCreated(charge: AdditionalChargeCreationRequest): void {
    const agreement = this.agreement();
    if (!agreement || this.submitting()) {
      return;
    }

    const request: AddAdditionalChargeRequest = {
      ...charge,
      id: charge.id ?? crypto.randomUUID()
    };

    this.submitError.set(null);
    this.submitting.set(true);

    this.service
      .addAdditionalCharge(agreement.agreementId, request)
      .pipe(
        retry({
          count: 1,
          delay: (error: HttpErrorResponse) =>
            error.status === 409
              ? timer(CONFLICT_RETRY_DELAY_MS)
              : throwError(() => error)
        })
      )
      .subscribe({
        next: (created) => {
          this.addedCharges.update((charges) => [created, ...charges]);

          // Recorded only when there is something to say, so the map holds disclosures rather than an
          // entry per charge — and the charge that produced it is already in the list above, which is
          // where the banner renders.
          const unbilled = created.unbilledLines ?? [];
          if (unbilled.length > 0) {
            this.unbilledByCharge.update((byCharge) => ({ ...byCharge, [created.id]: unbilled }));
          }

          this.submitting.set(false);
          this.showPanel.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.submitError.set(AddAdditionalChargeComponent.describeError(err));
        }
      });
  }

  /**
   * What the named charge could bill nowhere — empty for every ordinary save.
   *
   * @param chargeId The committed charge's server id.
   * @returns The unbilled lines the server disclosed for it, or an empty array.
   */
  unbilledFor(chargeId: string): UnbilledLineResponse[] {
    return this.unbilledByCharge()[chargeId] ?? [];
  }

  /** An added charge's total, summed from its persisted item amounts. */
  chargeTotal(charge: RentAgreementAdditionalChargeResponse): number {
    return charge.items.reduce((sum, item) => sum + item.amount, 0);
  }

  /**
   * Who an added charge landed on — read from the fee's **saved split** (requirement 21).
   *
   * It used to read an echoed `tenantIds` array. The server stops sending that field, and on the day
   * that shipped this label would simply have emptied: no error, no failing test, just a screen that
   * had stopped answering the question it exists to answer.
   *
   * **No rows means every active renter**, which is the meaning the empty array carried. The split is
   * still never re-derived here — it is what the server saved, read back.
   *
   * @param charge The saved charge.
   * @returns The renters it bills, or the shared-by-all phrase.
   */
  chargePayerLabel(charge: RentAgreementAdditionalChargeResponse): string {
    const shares = charge.tenantShares ?? [];
    if (shares.length === 0) {
      return 'All active tenants';
    }
    return shares.map((share) => this.tenantName(share.tenantId)).join(', ');
  }

  /** How an added charge is billed, in one phrase, for the committed-charges list. */
  chargeCadenceLabel(charge: RentAgreementAdditionalChargeResponse): string {
    if (!charge.isRecurring) {
      return charge.dueDate ? `One-time, due ${charge.dueDate}` : 'One-time';
    }
    const from = charge.startDate ? ` from ${charge.startDate}` : '';
    const until = charge.hasNoEndDate ? ', open-ended' : charge.endDate ? ` until ${charge.endDate}` : '';
    return `Recurring${from}${until}`;
  }

  /**
   * Clears everything a previous load put on screen.
   *
   * The committed-charges list goes too: it is scoped to the lease it was built against, and leaving
   * it up while a different lease loads would attribute those charges to the wrong lease.
   */
  private resetLoadedState(): void {
    this.agreement.set(null);
    this.tenants.set([]);
    this.hasSavedTenants.set(true);
    this.isGroupInvoice.set(false);
    this.addedCharges.set([]);
    this.submitError.set(null);
    this.showPanel.set(false);
  }

  /** Mirrors the other rent-agreement screens' error rendering — RFC 9457 `detail` when there is one. */
  private static describeError(err: HttpErrorResponse): string {
    const problemDetail = err.error?.detail;
    return typeof problemDetail === 'string' && problemDetail
      ? problemDetail
      : `Request failed: ${err.status} ${err.statusText}`;
  }
}
