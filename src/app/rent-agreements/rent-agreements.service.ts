import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  ActivateRentAgreementRequest,
  ActivateRentAgreementResponse,
  AddAdditionalChargeRequest,
  AgreementTenantsResponse,
  CreateRentAgreementRequest,
  CreateRentAgreementResponse,
  RentAgreementAdditionalChargeResponse,
  RentAgreementDetailResponse,
  SaveAgreementTenantsRequest,
  SaveAgreementTenantsResponse,
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
}
