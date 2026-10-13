import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApplyLateFeesRequest, ApplyLateFeesResponse, LateFeeSummaryResponse } from './late-fee.models';

/**
 * An invoice's late fee: read it, apply a list as the late fee event does, and remove it.
 *
 * Specified in `docs/specs/rent-agreements/07-late-fee-ui.md`, on Billing spec `17-late-fee-consumer.md`
 * v13. **Which owner is not asked here**: the scope travels as headers, attached by
 * `scopeHeadersInterceptor`, so a call names only the invoice.
 */
@Injectable({ providedIn: 'root' })
export class LateFeeService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/invoices`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Reads one invoice's late fee. Answers for any invoice the owner can see, voided and deleted included;
   * an invoice with no late fee reads zeros. `404 invoice.not_found` for an unknown or another owner's invoice.
   */
  get(invoiceId: string): Observable<LateFeeSummaryResponse> {
    return this.http.get<LateFeeSummaryResponse>(this.url(invoiceId));
  }

  /**
   * Applies a late fee list exactly as the late fee event does, recorded as the system (backend D28–D30).
   * `200` for an applied **and** a skipped list; `400 late_fee.invalid_event` for one the rules refuse;
   * `409` when another change won the race.
   */
  apply(invoiceId: string, request: ApplyLateFeesRequest): Observable<ApplyLateFeesResponse> {
    return this.http.put<ApplyLateFeesResponse>(this.url(invoiceId), request);
  }

  /**
   * Removes the unpaid part of the late fee, keeps the paid part, and stops further late fees. `204`, also
   * on a repeat; `404`; `409`; `422 late_fee.invoice_withdrawn` or `422 late_fee.only_late_fees_remain`.
   */
  remove(invoiceId: string): Observable<void> {
    return this.http.delete<void>(this.url(invoiceId));
  }

  /** The late fee route of one invoice. */
  private url(invoiceId: string): string {
    return `${this.baseUrl}/${invoiceId}/late-fee`;
  }
}
