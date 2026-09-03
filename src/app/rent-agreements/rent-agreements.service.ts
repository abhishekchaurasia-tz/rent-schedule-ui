import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  ActivateRentAgreementRequest,
  ActivateRentAgreementResponse,
  AddAdditionalChargeRequest,
  AgreementTenantsResponse,
  ArchiveRentAgreementRequest,
  ArchiveRentAgreementResponse,
  CancelRentAgreementRequest,
  CancelRentAgreementResponse,
  CreateRentAgreementRequest,
  CreateRentAgreementResponse,
  ProposedInvoiceDetailResponse,
  RentAgreementAdditionalChargeResponse,
  RentAgreementDetailResponse,
  SaveAgreementTenantsRequest,
  SaveAgreementTenantsResponse,
  TerminateRentAgreementRequest,
  TerminateRentAgreementResponse,
  UpdateProposedInvoiceRequest,
  UpdateRentAgreementTermsRequest
} from './rent-agreement.models';

@Injectable({ providedIn: 'root' })
export class RentAgreementsService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/rent/agreements`;

  constructor(private readonly http: HttpClient) {}

  create(request: CreateRentAgreementRequest): Observable<CreateRentAgreementResponse> {
    return this.http.post<CreateRentAgreementResponse>(this.baseUrl, request);
  }

  /**
   * Loads a saved agreement with its schedule rows and additional charges embedded (decision D1).
   * The shape follows the agreed contract in
   * `docs/rent-schedule-requirements/rent-schedule-edit-api-scenarios.md` §6.
   */
  getById(agreementId: string): Observable<RentAgreementDetailResponse> {
    return this.http.get<RentAgreementDetailResponse>(`${this.baseUrl}/${agreementId}`);
  }

  /**
   * Saves an edit: the changed terms plus the **complete** set of schedule rows and additional
   * charges (decisions D8 / E1). Anything the user removed is absent from those collections, which
   * is how a deletion is expressed — so never send a partial list.
   */
  updateTerms(
    agreementId: string,
    request: UpdateRentAgreementTermsRequest
  ): Observable<RentAgreementDetailResponse> {
    return this.http.put<RentAgreementDetailResponse>(`${this.baseUrl}/${agreementId}/terms`, request);
  }

  /**
   * Step 2 of the lease wizard: saves the complete renter set and its two invoicing decisions in
   * one transaction. A whole-set replace, not a per-tenant operation — see
   * {@link SaveAgreementTenantsRequest}.
   */
  saveTenants(
    agreementId: string,
    request: SaveAgreementTenantsRequest
  ): Observable<SaveAgreementTenantsResponse> {
    return this.http.put<SaveAgreementTenantsResponse>(`${this.baseUrl}/${agreementId}/tenants`, request);
  }

  /**
   * Reads back what step 2 saved, so a re-opened tenants screen is pre-filled from the server rather
   * than from whatever the client happens to still hold.
   *
   * Resolves to `null` when the endpoint answers `204 No Content` — the lease is real but step 2 was
   * never saved, which is an ordinary state for a lease still in the wizard and **not** an error.
   * That is a different fact from a saved set with nobody in it, and the two must not be collapsed:
   * `null` means "start this screen blank", whereas an empty `tenants` array would mean "the owner
   * saved an empty roster". A `404` still surfaces as an error, because it means the lease itself is
   * unknown.
   *
   * Angular already hands an empty body through as `null`; the `map` is here so the type says so.
   */
  getTenants(agreementId: string): Observable<AgreementTenantsResponse | null> {
    return this.http
      .get<AgreementTenantsResponse | null>(`${this.baseUrl}/${agreementId}/tenants`)
      .pipe(map((saved) => saved ?? null));
  }

  /**
   * Corrects one proposed invoice on a lease's billing plan — its due date, its line set, or both.
   *
   * **This is how an invoice is corrected**, including one that has already been issued: the edit is
   * carried onto the invoice's event stream by appending a correction, committed in the same
   * transaction as the proposal write. `PUT /api/v1/invoices/{id}` was removed; there is no other path.
   *
   * **Both members of the body are optional and absence means "leave unchanged"** — and a *present*
   * `lines` is the **complete** new set, so an omitted live line is soft-deleted. Never send a partial
   * array.
   *
   * The two ids are the route's whole address and neither is typed by a person: both come off
   * `InvoicesService.getById`, whose response carries `rentAgreementId` and `proposedInvoiceId`.
   *
   * Failures worth rendering distinctly: `422` for a business rule — a payment recorded against the
   * proposal, a cancelled or superseded one, an issued **deposit**, a lease whose status forbids
   * editing, or a due-date rule — and `409` when a concurrent write to the same agreement won the race.
   */
  updateProposedInvoice(
    agreementId: string,
    proposedInvoiceId: string,
    request: UpdateProposedInvoiceRequest
  ): Observable<ProposedInvoiceDetailResponse> {
    return this.http.patch<ProposedInvoiceDetailResponse>(
      `${this.baseUrl}/${agreementId}/proposed-invoices/${proposedInvoiceId}`,
      request
    );
  }

  /**
   * Appends **one** additional fee to an already-saved lease, together with any brand-new catalog
   * entries its items need, in a single transaction.
   *
   * **Additive only.** This endpoint cannot edit or remove a charge — `PUT …/terms` remains the only
   * path that does — which is why the Add Additional Fee page offers no edit affordance on what it
   * has added.
   *
   * The body is the charge itself, not a wrapper around it: the backend reads the charge from the
   * JSON root. `tenantIds` rides along on it, and an empty array means every active tenant shares the
   * fee.
   *
   * The response is the persisted charge with its real ids — `201` when created, `200` when the
   * request replayed an `id` the lease already held. Both resolve here identically, because the body
   * is the same charge either way and this app never sends an `id` to replay with.
   */
  addAdditionalCharge(
    agreementId: string,
    request: AddAdditionalChargeRequest
  ): Observable<RentAgreementAdditionalChargeResponse> {
    return this.http.post<RentAgreementAdditionalChargeResponse>(
      `${this.baseUrl}/${agreementId}/additional-charges`,
      request
    );
  }

  /**
   * Opens the lease's billing gate and generates its first invoices, in one transaction.
   *
   * **Idempotent by contract** — a repeat answers `200` with `alreadyActive: true` and no side effects,
   * because in production the Lease service calls this synchronously and retries on timeout. The
   * failures worth rendering distinctly are `409` (the caller's `version` is below the stored one) and
   * `422` (the begin date has not arrived, or the lease's payer lanes cannot be billed — which is what
   * a lease with no tenants hits).
   */
  activate(
    agreementId: string,
    request: ActivateRentAgreementRequest
  ): Observable<ActivateRentAgreementResponse> {
    return this.http.post<ActivateRentAgreementResponse>(
      `${this.baseUrl}/${agreementId}/activate`,
      request
    );
  }

  /**
   * Ends the lease early: records the termination, withdraws the cycles scheduled after its effective
   * date, and rebuilds the lease's invoices — all in one transaction (backend spec v74 FR-094 – FR-102).
   *
   * **Money that has moved is never disturbed.** The backend's recompute removes an unissued invoice,
   * corrects an issued-unpaid one forward, and protects anything carrying a payment or already past
   * due — the same rule the legacy system applies.
   *
   * **Idempotent on the effective date** — the same date twice answers `200` with
   * `alreadyTerminated: true`; a *different* date is a genuine correction and re-cuts the schedule.
   * The failures worth rendering distinctly are `409` (a stale `version`, or the lease is already
   * archived) and `422` (the effective date precedes the lease's begin date).
   */
  terminate(
    agreementId: string,
    request: TerminateRentAgreementRequest
  ): Observable<TerminateRentAgreementResponse> {
    return this.http.post<TerminateRentAgreementResponse>(
      `${this.baseUrl}/${agreementId}/terminate`,
      request
    );
  }

  /**
   * Withdraws the lease as of today (backend spec v74 FR-103 – FR-105).
   *
   * The same operation as {@link terminate} with today as the cutoff, which is why the body carries no
   * date. Afterwards the lease is neither editable nor billable whatever its dates say, and
   * **there is no un-archive** (FR-107).
   *
   * **Idempotent** — a repeat answers `200` with `alreadyArchived: true` and keeps the original
   * instant. `409` is a stale `version`; `422` is a lease that was never activated, which has no
   * invoices to withdraw.
   */
  archive(
    agreementId: string,
    request: ArchiveRentAgreementRequest
  ): Observable<ArchiveRentAgreementResponse> {
    return this.http.post<ArchiveRentAgreementResponse>(
      `${this.baseUrl}/${agreementId}/archive`,
      request
    );
  }

  /**
   * Disposes of a draft that never became a lease, soft-deleting the agreement and everything beneath
   * it in one transaction (backend spec `01-rent-agreement.md` v77, FR-114 – FR-118).
   *
   * **Idempotent** — a repeat answers `200` with `alreadyCancelled: true`. `404` is an unknown
   * agreement, `409` a stale `version`, and `422` an agreement that has already been activated — that
   * case is a termination, not a cancellation.
   */
  cancel(
    agreementId: string,
    request: CancelRentAgreementRequest
  ): Observable<CancelRentAgreementResponse> {
    return this.http.post<CancelRentAgreementResponse>(
      `${this.baseUrl}/${agreementId}/cancel`,
      request
    );
  }
}
