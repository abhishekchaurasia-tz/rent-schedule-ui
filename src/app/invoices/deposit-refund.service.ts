import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  CreateDepositRefundRequest,
  DepositRefundResponse,
  DepositRefundSubmittedResponse
} from './deposit-refund.models';

/**
 * The four deposit refund calls — backend spec `15-deposit-refund.md` v2.
 *
 * **Billing fronts every one of them and Finance does the work** (backend D1): Billing checks the
 * rules on a fresh Finance read, then forwards the request once. So nothing here retries, and nothing
 * here decides — each method is one request, and its answer, success or refusal, goes straight back to
 * the screen that asked.
 *
 * A separate service rather than more methods on `InvoicesService`, because the resource is a
 * different one: that service reads the invoice projection, this one reads and writes the deposit's
 * refunds, which Billing does not store at all.
 */
@Injectable({ providedIn: 'root' })
export class DepositRefundService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/invoices`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Reads one invoice's refund view: the flags, the totals, one row per paying tenant and one per live
   * return. `404 invoice.not_found` for a missing or foreign invoice; `502
   * deposit_refund.payment_service_unavailable` when Finance cannot be read — never empty figures.
   */
  get(invoiceId: string): Observable<DepositRefundResponse> {
    return this.http.get<DepositRefundResponse>(`${this.baseUrl}/${invoiceId}/deposit-refund`);
  }

  /**
   * Returns a deposit, offline or online. `202 Accepted` means **queued** at Finance, not refunded.
   *
   * **Sent once.** `502 deposit_refund.submission_unconfirmed` means the return may or may not have been
   * queued, so a caller must not re-send it on its own (backend BR-23).
   */
  create(invoiceId: string, request: CreateDepositRefundRequest): Observable<DepositRefundSubmittedResponse> {
    return this.http.post<DepositRefundSubmittedResponse>(`${this.baseUrl}/${invoiceId}/deposit-refunds`, request);
  }

  /** Cancels an online return still inside Finance's window. `204`, or `422 deposit_refund.cannot_cancel`. */
  cancel(invoiceId: string, refundId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${invoiceId}/deposit-refunds/${refundId}/cancel`, null);
  }

  /** Removes a return recorded offline. `204`, or `422 deposit_refund.cannot_remove`. */
  remove(invoiceId: string, refundId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${invoiceId}/deposit-refunds/${refundId}`);
  }
}
