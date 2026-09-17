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
 * One renter's share of the fee, as the split table renders it.
 *
 * `amount` is the money; `sharePercent` is the same quantity expressed against the fee total. The two
 * are always consistent with one another and never both authoritative — {@link divideEvenly} fills
 * both from the fee total and the row count.
 *
 * `carriesLeftoverCent` is what the row's Odd/Even badge reads. It marks the rows a leftover cent was
 * handed to, which is the only thing separating them from the rest, and is worth saying on screen
 * because an owner comparing two rows of a three-way split will otherwise wonder which one is wrong.
 */
export interface TenantShareRow {
  tenantId: string;
  name: string;
  amount: number;
  sharePercent: number;
  carriesLeftoverCent: boolean;
}

/**
 * Splits `total` across `count` rows **in money**, to the cent (requirement 17).
 *
 * **The money is divided, not the percentage.** `$300` across three renters is `100.00` three times.
 * Dividing `100 / 3 = 33.33%` and multiplying it back would have produced `99.99 / 99.99 / 100.02` —
 * a different fee from the one the owner authored, on a screen that claims to be dividing theirs.
 *
 * **Leftover cents go one each to the first rows, never stacked onto one.** `$100` across six leaves
 * four cents, so four rows carry `16.67` and two carry `16.66`. Handing all four to the first row
 * would over-bill that renter by three cents — and would still divide `$300` across three correctly,
 * which is why the six-renter case has a test of its own.
 *
 * Computed in integer cents throughout, because `0.01 * 3` is not `0.03` in binary floating point and
 * a split that has to total the fee *exactly* cannot be assembled out of values that do not add up.
 *
 * @param total The amount to divide, in whole currency units.
 * @param count How many rows to divide it across.
 * @returns One amount per row, in the order given, summing to `total` exactly. Empty when `count < 1`.
 */
export function divideEvenly(total: number, count: number): number[] {
  if (count < 1) {
    return [];
  }

  const totalCents = Math.round(total * 100);

  // Signed totals are reachable from requirement 18: typed rows can exceed the fee, leaving the
  // untouched rows a negative remainder to share. Dividing the magnitude keeps the rule symmetric —
  // the first rows still carry the extra cent — rather than inverting it below zero.
  const sign = totalCents < 0 ? -1 : 1;
  const magnitude = Math.abs(totalCents);
  const base = Math.floor(magnitude / count);
  const leftover = magnitude - base * count;

  return Array.from(
    { length: count },
    (_unused, index) => (sign * (base + (index < leftover ? 1 : 0))) / 100
  );
}

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
 * **What only this page can do:** say *who pays*. `tenantIds` has existed on the wire since the
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

  /**
   * Who the next fee is charged to. **Empty is a meaningful state, not an unfinished one:** it is
   * sent as `tenantIds: []`, which the backend reads as "every active tenant shares this fee".
   */
  readonly selectedTenantIds = signal<ReadonlySet<string>>(new Set<string>());

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

  /** How many tenants are ticked — drives the "shared by all" wording next to the list. */
  readonly selectedCount = computed(() => this.selectedTenantIds().size);

  /**
   * The fee authored in the panel but **not yet committed** — this page's staging area.
   *
   * **Why the panel's Create no longer posts.** The split divides the fee's *money*, so it cannot be
   * filled in before the fee total exists, and that total is only known once the fee is authored. The
   * panel is a drawer over a click-to-close dimmer, so nothing behind it can be typed into while it is
   * open. Create therefore stages the fee and closes the drawer; the split fills in against the staged
   * total, and this page's own Save is what commits it (requirements 17-19).
   *
   * The idempotency key is minted **here**, at staging, rather than at submit: a save the owner repeats
   * after correcting the split is the same fee, and requirement 16's replay only holds if the second
   * attempt carries the same key.
   */
  readonly pendingCharge = signal<AdditionalChargeCreationRequest | null>(null);

  /**
   * The staged fee's total, summed from its item amounts — the figure the split has to add up to.
   *
   * **`alreadyPaid` is deliberately not subtracted.** It records what the renter has already handed
   * over, not a reduction in what the fee *is*, and the server validates the shares against the
   * charge's own total. Netting it off here would refuse a save the server would have accepted.
   */
  readonly feeTotal = computed(() =>
    (this.pendingCharge()?.items ?? []).reduce((sum, item) => sum + Number(item.amount || 0), 0)
  );

  /**
   * The ticked renters in **roster order** — which is the order the leftover cents are handed out in.
   *
   * Derived by filtering `tenants()` rather than by reading the selection set, because a `Set` iterates
   * in insertion order: the order the owner happened to click in. Requirement 17 says *"the first
   * renters in the listed order"*, and the listed order is the one on screen.
   */
  private readonly selectedTenantsInOrder = computed(() =>
    this.tenants().filter((tenant) => this.selectedTenantIds().has(tenant.tenantId))
  );

  /**
   * The per-renter split of the staged fee, divided evenly (requirement 17).
   *
   * **Empty in two distinct cases, and both are complete states rather than unfinished ones:** nobody
   * ticked, which means every active renter shares the fee, and no staged fee to divide, which is
   * simply "not yet". Neither is an error, and neither shows a message.
   */
  readonly tenantShares = computed<TenantShareRow[]>(() => {
    const rows = this.selectedTenantsInOrder();
    const total = this.feeTotal();

    if (rows.length === 0 || total <= 0) {
      return [];
    }

    const amounts = divideEvenly(total, rows.length);
    const smallest = Math.min(...amounts);

    return rows.map((tenant, index) => ({
      tenantId: tenant.tenantId,
      name: this.tenantName(tenant.tenantId),
      amount: amounts[index],
      sharePercent: Math.round((amounts[index] / total) * 10000) / 100,
      carriesLeftoverCent: amounts[index] !== smallest
    }));
  });

  /** Whether the fee is being shared by everybody — the state an empty selection encodes. */
  readonly isSharedByEveryone = computed(() => this.selectedTenantIds().size === 0);

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

  isTenantSelected(tenantId: string): boolean {
    return this.selectedTenantIds().has(tenantId);
  }

  toggleTenant(tenantId: string): void {
    this.selectedTenantIds.update((selected) => {
      const next = new Set(selected);
      if (!next.delete(tenantId)) {
        next.add(tenantId);
      }
      return next;
    });
  }

  selectAllTenants(): void {
    this.selectedTenantIds.set(new Set(this.tenants().map((tenant) => tenant.tenantId)));
  }

  clearTenantSelection(): void {
    this.selectedTenantIds.set(new Set<string>());
  }

  /**
   * Switches between the two things a fee can be: shared by the whole lease, or split per renter.
   *
   * These are the two ends of the same selection rather than a mode of their own — an empty selection
   * *is* "shared by everyone", which is the server's own encoding (requirement 5). Choosing "split per
   * renter" from a standing empty selection therefore has to tick somebody, and ticking everybody is
   * the only choice that changes nothing about who owes the fee while making the split editable.
   */
  setSplitMode(mode: 'shared' | 'split'): void {
    if (mode === 'shared') {
      this.clearTenantSelection();
      return;
    }
    if (this.selectedTenantIds().size === 0) {
      this.selectAllTenants();
    }
  }

  /** The stand-in person for a tenant id — the same one the ADD TENANTS screen shows. */
  tenantName(tenantId: string): string {
    const identity = placeholderTenantIdentity(tenantId);
    return `${identity.firstName} ${identity.lastName}`;
  }

  /**
   * The stand-in person's initials, for the split row's avatar.
   *
   * Initials rather than a photograph, and not for want of styling: there is no tenant-profile service
   * wired up, so the name itself is derived from the id. A circle with two letters in it says "a person
   * this screen only knows by id"; a stock portrait would claim to know who they are.
   */
  tenantInitials(tenantId: string): string {
    const identity = placeholderTenantIdentity(tenantId);
    return `${identity.firstName.charAt(0)}${identity.lastName.charAt(0)}`.toUpperCase();
  }

  openPanel(): void {
    this.submitError.set(null);
    this.showPanel.set(true);
  }

  closePanel(): void {
    this.showPanel.set(false);
  }

  /**
   * Takes the authored fee off the panel and **stages** it, without sending anything.
   *
   * The split cannot be typed while the panel is open — it is a drawer over a click-to-close dimmer —
   * and it cannot be filled in before the fee total exists. So Create hands the fee over, the drawer
   * closes, the split appears beneath it, and {@link saveFee} is what commits (requirements 17-19).
   *
   * **Re-staging replaces rather than appends.** Re-opening the drawer on a staged fee (the Edit
   * action) prefills it with that same fee, so what comes back is a correction of it, not a second one.
   * The `id` survives that round trip, which is what keeps requirement 16's replay honest: the same
   * fee saved twice carries the same idempotency key however many times its split was corrected.
   */
  onChargeCreated(charge: AdditionalChargeCreationRequest): void {
    if (!this.agreement() || this.submitting()) {
      return;
    }

    this.submitError.set(null);
    this.pendingCharge.set({ ...charge, id: charge.id ?? this.pendingCharge()?.id ?? crypto.randomUUID() });
    this.showPanel.set(false);
  }

  /** Re-opens the drawer on the staged fee, so a mistake in the *fee* is corrected rather than retyped. */
  editPendingFee(): void {
    this.submitError.set(null);
    this.showPanel.set(true);
  }

  /**
   * Throws the staged fee away. Nothing has been sent, so there is nothing to undo on the server — and
   * for the same reason this is the only "delete" this page will ever offer (requirement 12).
   */
  discardPendingFee(): void {
    this.pendingCharge.set(null);
    this.submitError.set(null);
    this.showPanel.set(false);
  }

  /**
   * Commits the staged fee: its own fields at the body root, the ticked tenants alongside them.
   *
   * **The staged fee survives a failure.** A `422` here is routine — the deposit/rent mixing rule, the
   * recurring-field matrix, a lease that is not active — and clearing the staging area would throw away
   * everything the owner just authored in order to hit one. Edit re-opens the drawer on it.
   *
   * **Re-entrant submissions are dropped rather than queued**, and the staged `id` is what makes the
   * retry below safe. This remark used to end *"the panel emits no `id`, so the endpoint's idempotency
   * key is unavailable and a second POST would create a second charge, not replay the first"* — which
   * was precisely the gap. The key is minted at staging, so the request carries its own.
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
  saveFee(): void {
    const agreement = this.agreement();
    const charge = this.pendingCharge();
    if (!agreement || !charge || this.submitting()) {
      return;
    }

    const request: AddAdditionalChargeRequest = {
      ...charge,
      tenantIds: [...this.selectedTenantIds()]
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
          this.pendingCharge.set(null);
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

  /** Who an added charge landed on — the server's echoed `tenantIds`, never re-derived locally. */
  chargePayerLabel(charge: RentAgreementAdditionalChargeResponse): string {
    const tenantIds = charge.tenantIds ?? [];
    if (tenantIds.length === 0) {
      return 'All active tenants';
    }
    return tenantIds.map((tenantId) => this.tenantName(tenantId)).join(', ');
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
    this.selectedTenantIds.set(new Set<string>());
    this.pendingCharge.set(null);
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
