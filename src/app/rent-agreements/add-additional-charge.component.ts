import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { placeholderTenantIdentity } from '../shared/tenant-identity.util';
import { AdditionalChargePanelComponent } from './additional-charge-panel.component';
import { RentAgreementsService } from './rent-agreements.service';
import {
  AdditionalChargeCreationRequest,
  AddAdditionalChargeRequest,
  AgreementTenantShareResponse,
  RentAgreementAdditionalChargeResponse,
  RentAgreementDetailResponse
} from './rent-agreement.models';

/** Matches a canonical 8-4-4-4-12 UUID, case-insensitive — same shape check as the Open Lease screen. */
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  /** How many tenants are ticked — drives the "shared by all" wording next to the list. */
  readonly selectedCount = computed(() => this.selectedTenantIds().size);

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
   * Commits the authored fee: the panel's charge at the body root, the ticked tenants alongside it.
   *
   * **The panel is closed only once the server has answered.** A `422` here is routine — the
   * deposit/rent mixing rule, the recurring-field matrix, a lease that is not active — and closing on
   * emit would throw away everything the user just typed to hit one.
   *
   * **Re-entrant submissions are dropped rather than queued.** The panel emits no `id`, so the
   * endpoint's idempotency key is unavailable and a second POST would create a second charge, not
   * replay the first.
   */
  onChargeCreated(charge: AdditionalChargeCreationRequest): void {
    const agreement = this.agreement();
    if (!agreement || this.submitting()) {
      return;
    }

    const request: AddAdditionalChargeRequest = {
      ...charge,
      tenantIds: [...this.selectedTenantIds()]
    };

    this.submitError.set(null);
    this.submitting.set(true);

    this.service.addAdditionalCharge(agreement.agreementId, request).subscribe({
      next: (created) => {
        this.addedCharges.update((charges) => [created, ...charges]);
        this.submitting.set(false);
        this.showPanel.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.submitError.set(AddAdditionalChargeComponent.describeError(err));
      }
    });
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
