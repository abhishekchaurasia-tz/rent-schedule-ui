import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  CreateRentAgreementRequest,
  CreateRentAgreementResponse,
  RentAgreementDetailResponse,
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
}
