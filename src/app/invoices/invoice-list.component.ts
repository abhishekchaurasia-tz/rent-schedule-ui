import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, signal } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';

import { toIsoDate } from '../shared/date.util';
import { placeholderTenantIdentity } from '../shared/tenant-identity.util';
import { AdditionalChargePanelComponent } from '../rent-agreements/additional-charge-panel.component';
import { RentAgreementsService } from '../rent-agreements/rent-agreements.service';
import {
  AdditionalChargeCreationRequest,
  RentAgreementDetailResponse
} from '../rent-agreements/rent-agreement.models';
import {
  InvoiceSearchQuery,
  InvoiceStatus,
  InvoiceSummaryResponse,
  PagedResult
} from './invoice.models';
import { InvoicesService } from './invoices.service';

/** Matches a canonical 8-4-4-4-12 UUID, case-insensitive — the same check the other id screens use. */
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How each wire status is labelled and coloured. */
interface StatusPresentation {
  label: string;
  className: string;
}

/**
 * Which step of the "add invoice" side panel is showing.
 *
 * `null` means the panel is closed. The two steps are sequential rather than one form because the fee
 * panel cannot be rendered until the lease is loaded: it needs the lease's `propertyOwnerId` to fetch
 * the item catalog, and its start/end dates to resolve recurring candidate dates.
 */
export type AddInvoiceStep = 'agreement' | 'fee' | null;

/**
 * The **Invoices** list: one property owner's invoices, filtered and paged.
 *
 * Specified in `docs/specs/rent-agreements/04-invoice-list-ui.md`.
 *
 * **No new endpoint was needed.** `GET /api/v1/invoices` has carried every filter this screen offers,
 * plus a `PagedResult` envelope, since backend spec `02-invoicing.md` v28. What it lacked were two
 * *columns* — when an invoice was paid and who it is shared by — which v37 added as derived fields
 * (`paidOn`, `tenantIds`).
 *
 * **Two columns of the design are deliberately absent, and their absence is the honest answer.**
 * *Processing* names an in-flight-payment state this service has no concept of, so a column for it
 * could only ever read `$0.00` — a number that looks measured and is not. *Property* and *unit* names
 * are not held by this bounded context at all: those are opaque external references, so the ids are
 * shown instead. Per-column sorting is absent for a third reason — the endpoint's order is fixed at
 * `dueDate` then `invoiceNumber` precisely so offset pagination stays stable, and controls that did
 * nothing would be worse than none.
 */
@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    AdditionalChargePanelComponent
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './invoice-list.component.html',
  styleUrl: './invoice-list.component.scss'
})
export class InvoiceListComponent {
  /** The wire tokens, with the words the design puts on screen. */
  private static readonly StatusPresentations: Record<InvoiceStatus, StatusPresentation> = {
    // "Fully Paid" rather than the wire's own word: it is what the design shows, and it is what a
    // property manager calls it.
    received: { label: 'Fully Paid', className: 'paid' },
    overdue: { label: 'Overdue', className: 'overdue' },
    partial_paid: { label: 'Partially Paid', className: 'partial' },
    not_received: { label: 'Not Received', className: 'pending' },
    voided: { label: 'Voided', className: 'muted' },
    deleted: { label: 'Deleted', className: 'muted' }
  };

  /** The statuses offered as filter chips, in the order they read on screen. */
  readonly statusOptions: InvoiceStatus[] = [
    'not_received',
    'partial_paid',
    'received',
    'overdue',
    'voided',
    'deleted'
  ];

  readonly idError = signal<string | null>(null);
  readonly loading = signal(false);
  readonly searchError = signal<string | null>(null);

  /** The page currently on screen, or `null` before the first search. */
  readonly result = signal<PagedResult<InvoiceSummaryResponse> | null>(null);

  /** Stamped on each successful response — drives the design's "last refreshed at …" line. */
  readonly lastRefreshedAt = signal<Date | null>(null);

  /** The selected status filters. Empty means "every status", which is the endpoint's own default. */
  readonly selectedStatuses = signal<ReadonlySet<InvoiceStatus>>(new Set<InvoiceStatus>());

  /** Which step of the "add invoice" side panel is showing, or `null` when it is closed. */
  readonly addInvoiceStep = signal<AddInvoiceStep>(null);

  /** The lease id typed into the panel's first step. Deliberately not taken from the listed rows. */
  readonly addInvoiceAgreementId = new FormControl('', { nonNullable: true });

  readonly addInvoiceIdError = signal<string | null>(null);
  readonly loadingAgreement = signal(false);

  /** The lease the fee panel is authoring against, once its first step has loaded one. */
  readonly chargeAgreement = signal<RentAgreementDetailResponse | null>(null);

  readonly submittingCharge = signal(false);
  readonly chargeError = signal<string | null>(null);

  /** What the last successful add did, for the confirmation line above the refreshed list. */
  readonly chargeSuccess = signal<string | null>(null);

  /** The 1-based page to request next. Reset to 1 by any filter change. */
  private page = 1;

  readonly filters: FormGroup;

  /** `true` once a search has returned, so the empty state can tell "none matched" from "not yet run". */
  readonly hasSearched = computed(() => this.result() !== null);

  constructor(
    private readonly fb: FormBuilder,
    private readonly invoices: InvoicesService,
    private readonly agreements: RentAgreementsService
  ) {
    this.filters = this.fb.group({
      propertyOwnerId: [''],
      invoiceNumber: [''],
      // Native `Date`s for the Material datepickers; `toIsoDate` converts them to the wire's
      // "YYYY-MM-DD" in LOCAL time at query-build time.
      dueDateFrom: [null as Date | null],
      dueDateTo: [null as Date | null],
      outstandingOnly: [false],
      includeDeleted: [false],
      pageSize: [50]
    });
  }

  /** The rows on screen, or an empty array before the first search. */
  get rows(): InvoiceSummaryResponse[] {
    return this.result()?.items ?? [];
  }

  isStatusSelected(status: InvoiceStatus): boolean {
    return this.selectedStatuses().has(status);
  }

  /** Toggles one status chip. Any filter change restarts at page 1 (FR 9). */
  toggleStatus(status: InvoiceStatus): void {
    this.selectedStatuses.update((selected) => {
      const next = new Set(selected);
      if (!next.delete(status)) {
        next.add(status);
      }
      return next;
    });
    this.page = 1;
  }

  /**
   * Marks the filters as changed.
   *
   * Bound to every filter control's `change`, because page 4 of the previous result set says nothing
   * about the new one — leaving the page number alone would routinely land the user on an empty page
   * and read as "no invoices matched".
   */
  onFilterChanged(): void {
    this.page = 1;
  }

  /** Runs the search from page 1. */
  search(): void {
    this.page = 1;
    this.runSearch();
  }

  /** Re-runs the current search unchanged — the design's "Refresh Now". */
  refresh(): void {
    this.runSearch();
  }

  /** Moves to `page`, ignoring a move outside the range the server reported. */
  goToPage(page: number): void {
    const result = this.result();
    if (!result || page < 1 || (result.totalPages > 0 && page > result.totalPages)) {
      return;
    }
    this.page = page;
    this.runSearch();
  }

  get currentPage(): number {
    return this.result()?.pageNumber ?? this.page;
  }

  private runSearch(): void {
    const ownerId = String(this.filters.get('propertyOwnerId')!.value ?? '').trim();

    if (!ownerId) {
      this.idError.set('Enter a property owner id — the list is always scoped to one owner.');
      return;
    }

    if (!GUID_PATTERN.test(ownerId)) {
      this.idError.set('That is not a valid id. It should look like 8f14e45f-ceea-467e-bd9f-000000000001.');
      return;
    }

    this.idError.set(null);
    this.searchError.set(null);
    this.loading.set(true);

    this.invoices.search(this.buildQuery(ownerId)).subscribe({
      next: (page) => {
        this.result.set(page);
        this.page = page.pageNumber;
        this.lastRefreshedAt.set(new Date());
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.searchError.set(InvoiceListComponent.describeError(err));
      }
    });
  }

  /**
   * Projects the filter form onto the criteria object.
   *
   * Blank members are left `undefined` rather than sent empty — the service drops those, and an empty
   * `invoiceNumber` on the wire would be an exact-match filter for the empty string.
   */
  private buildQuery(propertyOwnerId: string): InvoiceSearchQuery {
    const value = this.filters.value;
    const blankToUndefined = (raw: unknown): string | undefined => {
      const text = String(raw ?? '').trim();
      return text === '' ? undefined : text;
    };

    return {
      propertyOwnerId,
      page: this.page,
      pageSize: Number(value.pageSize) || 50,
      invoiceNumber: blankToUndefined(value.invoiceNumber),
      dueDateFrom: toIsoDate(value.dueDateFrom) ?? undefined,
      dueDateTo: toIsoDate(value.dueDateTo) ?? undefined,
      outstandingOnly: !!value.outstandingOnly,
      includeDeleted: !!value.includeDeleted,
      status: [...this.selectedStatuses()]
    };
  }

  // ---- the "add invoice" side panel -----------------------------------------------------------

  /**
   * Opens the panel at its first step.
   *
   * **Available whether or not a search has been run**, because adding does not depend on the list:
   * the lease is named in the panel, not picked from the rows. The list is the thing that gets
   * refreshed afterwards, not the thing that supplies the id.
   */
  openAddInvoice(): void {
    this.addInvoiceAgreementId.setValue('');
    this.addInvoiceIdError.set(null);
    this.chargeError.set(null);
    this.chargeSuccess.set(null);
    this.chargeAgreement.set(null);
    this.addInvoiceStep.set('agreement');
  }

  closeAddInvoice(): void {
    this.addInvoiceStep.set(null);
    this.chargeAgreement.set(null);
    this.loadingAgreement.set(false);
  }

  /**
   * Loads the lease named in step one and moves to the fee form.
   *
   * The load is not a validation nicety — the fee panel is unusable without it. It needs the lease's
   * `propertyOwnerId` to fetch the item catalog and its start/end dates to resolve the candidate dates
   * a recurring fee is picked from, so there is nothing to render until this returns.
   */
  loadAgreementForCharge(): void {
    const agreementId = this.addInvoiceAgreementId.value.trim();

    if (!agreementId) {
      this.addInvoiceIdError.set('Enter a rent agreement id.');
      return;
    }

    if (!GUID_PATTERN.test(agreementId)) {
      this.addInvoiceIdError.set(
        'That is not a valid id. It should look like 8f14e45f-ceea-467e-bd9f-000000000001.'
      );
      return;
    }

    this.addInvoiceIdError.set(null);
    this.chargeError.set(null);
    this.loadingAgreement.set(true);

    this.agreements.getById(agreementId).subscribe({
      next: (agreement) => {
        this.chargeAgreement.set(agreement);
        this.loadingAgreement.set(false);
        this.addInvoiceStep.set('fee');
      },
      error: (err: HttpErrorResponse) => {
        this.loadingAgreement.set(false);
        this.addInvoiceIdError.set(InvoiceListComponent.describeError(err));
      }
    });
  }

  /** The owner whose catalog the fee panel fetches. */
  get chargePropertyOwnerId(): string | null {
    return this.chargeAgreement()?.propertyOwnerId ?? null;
  }

  get chargeLeaseStartDate(): string | null {
    return this.chargeAgreement()?.startDate ?? null;
  }

  get chargeLeaseEndDate(): string | null {
    return this.chargeAgreement()?.endDate ?? null;
  }

  /**
   * How many cycles a month-to-month lease was generated for — what the fee panel's candidate-date
   * endpoint needs in place of an end date. `null` for a fixed-term lease, where the end date answers.
   */
  get chargeMonthToMonthInvoiceCount(): number | null {
    const agreement = this.chargeAgreement();
    if (!agreement || agreement.endDate) {
      return null;
    }
    return agreement.scheduleRows.length || null;
  }

  /**
   * Commits the authored fee, then refreshes the list underneath.
   *
   * **The refresh is the point of doing this here rather than on its own page.** On an activated lease
   * a standalone, non-recurring fee raises an invoice of its own in the same transaction — so the list
   * behind the panel is stale the moment this returns, and a manager who had to remember to re-search
   * would reasonably conclude nothing had happened.
   *
   * **The panel stays open until the server answers.** A `422` here is routine — the deposit/rent
   * mixing rule, the recurring-field matrix, a lease that is not active — and closing on emit would
   * throw away everything just typed. Re-entrant submissions are dropped rather than queued, because
   * the panel emits no idempotency key and a second POST would create a second charge.
   */
  onChargeCreated(charge: AdditionalChargeCreationRequest): void {
    const agreement = this.chargeAgreement();
    if (!agreement || this.submittingCharge()) {
      return;
    }

    this.chargeError.set(null);
    this.submittingCharge.set(true);

    this.agreements.addAdditionalCharge(agreement.agreementId, charge).subscribe({
      next: (created) => {
        this.submittingCharge.set(false);
        this.closeAddInvoice();
        this.chargeSuccess.set(
          `Added a ${created.category.toLowerCase()} fee of ` +
            `${created.items.reduce((sum, item) => sum + item.amount, 0).toFixed(2)} to lease ` +
            `${agreement.agreementId}.`
        );

        // Only when a search has already run: refreshing before one would fire a request with no
        // owner scope, which the endpoint rejects.
        if (this.result()) {
          this.refresh();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.submittingCharge.set(false);
        this.chargeError.set(InvoiceListComponent.describeError(err));
      }
    });
  }

  /** How a status reads on screen. Unknown tokens pass through rather than blanking the cell. */
  statusPresentation(status: InvoiceStatus): StatusPresentation {
    return InvoiceListComponent.StatusPresentations[status] ?? { label: status, className: 'muted' };
  }

  /**
   * Who an invoice is shared by.
   *
   * Reads `tenantIds` first and falls back to the single `tenantId` lane, because that lane is `null`
   * on exactly the group invoices with several payers — using it alone would answer the question
   * backwards. The names are the stable stand-ins the ADD TENANTS and Add Additional Fee screens
   * derive from the same ids, so one tenant reads as one person across the app.
   */
  payerLabel(invoice: InvoiceSummaryResponse): string {
    const ids = invoice.tenantIds?.length ? invoice.tenantIds : invoice.tenantId ? [invoice.tenantId] : [];

    if (ids.length === 0) {
      return '—';
    }

    return ids
      .map((tenantId) => {
        const identity = placeholderTenantIdentity(tenantId);
        return `${identity.firstName} ${identity.lastName}`;
      })
      .join(', ');
  }

  /**
   * A short, readable stand-in for an external reference.
   *
   * **Not a name.** This service holds no property or unit names — they are opaque references owned by
   * another context — so the row shows the leading characters of the id with the whole value on hover.
   * Inventing names here, unlike the tenant stand-ins, would put fabricated text beside real money with
   * nothing to mark it as invented.
   */
  shortReference(id: string | null | undefined): string {
    return id ? id.slice(0, 8) : '—';
  }

  /** Whether a row still owes money — what drives the alert colouring, per the design. */
  isOutstanding(invoice: InvoiceSummaryResponse): boolean {
    return invoice.balance > 0;
  }

  private static describeError(err: HttpErrorResponse): string {
    const problemDetail = err.error?.detail;
    return typeof problemDetail === 'string' && problemDetail
      ? problemDetail
      : `Request failed: ${err.status} ${err.statusText}`;
  }
}
