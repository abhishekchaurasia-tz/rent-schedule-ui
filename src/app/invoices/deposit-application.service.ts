import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  ApplyDepositRequest,
  ApplyDepositResponse,
  DepositApplicationContextResponse
} from './deposit-application.models';

/**
 * The three deposit application calls — backend spec `16-deposit-application.md` v1.
 *
 * Billing owns this money end to end: the allocations live in its write model, so unlike the refund
 * calls nothing here is forwarded to Finance (Finance is only read, for what was returned). Each method
 * is one request whose answer goes straight back to the screen that asked; nothing here retries.
 */
@Injectable({ providedIn: 'root' })
export class DepositApplicationService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/invoices`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Reads the panel's context: what the deposit still holds, the lease's open invoices with their
   * balances, and the live *Funds Applied* rows. `404 invoice.not_found` for a missing or foreign
   * invoice; `502 deposit_application.payment_service_unavailable` when Finance cannot be read.
   */
  get(invoiceId: string): Observable<DepositApplicationContextResponse> {
    return this.http.get<DepositApplicationContextResponse>(`${this.baseUrl}/${invoiceId}/deposit-application`);
  }

  /**
   * Applies the deposit. `201` for a new submission, `200` when `applicationId` was already recorded —
   * the original result, nothing written twice (backend BR-13).
   */
  apply(invoiceId: string, request: ApplyDepositRequest): Observable<ApplyDepositResponse> {
    return this.http.post<ApplyDepositResponse>(`${this.baseUrl}/${invoiceId}/deposit-applications`, request);
  }

  /**
   * Removes one applied amount. `204`; `409 maintenance_invoice_pending` while its maintenance invoice is
   * being raised; `422 maintenance_invoice_paid` once money is on it.
   */
  remove(invoiceId: string, allocationId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${invoiceId}/deposit-applications/${allocationId}`);
  }
}
