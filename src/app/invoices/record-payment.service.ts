import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { DepositRefundProblem, describeProblem } from './deposit-refund.util';
import {
  OfflinePaymentContextResponse,
  OfflinePaymentPreviewResponse,
  OfflinePaymentSubmittedResponse,
  PreviewOfflinePaymentRequest,
  RecordOfflinePaymentRequest
} from './record-payment.models';

/** The one refusal that may have queued the payment anyway (backend BR-37). */
export const SUBMISSION_UNCONFIRMED = 'record_payment.submission_unconfirmed';

/**
 * The sentence shown for each refusal code (spec `11-record-payment-ui.md` FR 16, 17).
 *
 * Codes absent here — `validation_failed`, `exceeds_payable`, `rejected_by_payment_service` — are shown with
 * the server's own `detail`, because it is the specific part: the field, the maximum, or Finance's reason.
 */
export const RecordPaymentMessages: Readonly<Record<string, string>> = {
  'invoice.not_found': 'This invoice was not found. It may have been deleted, or it belongs to another owner.',
  'record_payment.not_payable':
    'A payment cannot be recorded on this invoice: it is voided, deleted, or not on a rent agreement.',
  'record_payment.nothing_to_pay': 'Nothing is left to pay on this invoice.',
  'record_payment.tenant_not_on_invoice': 'The selected tenant is not on this invoice.',
  'record_payment.payment_service_unavailable':
    'What has been paid could not be read from the payment service. Try again in a moment.',
  'Request.Malformed': 'The request could not be read. Check each amount and date, then try again.',
  [SUBMISSION_UNCONFIRMED]:
    "The payment service did not confirm this payment. It may still have been queued — check the invoice's " +
    'payments before you submit again. Submitting again from this panel reuses the same submission, so the ' +
    'payment is not recorded twice.'
};

/**
 * A Record Payment refusal as the panel shows it: a readable sentence for the codes the panel knows, the
 * server's `detail` for the rest, and the code itself, as the Deposit Refund page shows it.
 */
export function describeRecordPaymentProblem(err: HttpErrorResponse): DepositRefundProblem {
  const problem = describeProblem(err);
  const known = problem.code ? RecordPaymentMessages[problem.code] : undefined;

  return known ? { message: known, code: problem.code } : problem;
}

/**
 * The three Record Payment calls — Billing spec `18-record-payment.md` v2.
 *
 * **Billing checks, Finance records** (backend D1): Billing validates on a fresh Finance read and hands
 * the payment to Finance once. So nothing here retries — each method is one request whose answer goes
 * straight back to the panel. Which owner is not asked here: the scope travels as headers, attached by
 * `scopeHeadersInterceptor`.
 */
@Injectable({ providedIn: 'root' })
export class RecordPaymentService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/invoices`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Reads what the panel opens with: the invoice's figures, its tenants with their suggested amounts, and
   * the methods. `404 invoice.not_found`; `422 record_payment.not_payable` or `nothing_to_pay`; `502
   * record_payment.payment_service_unavailable`.
   */
  getContext(invoiceId: string): Observable<OfflinePaymentContextResponse> {
    return this.http.get<OfflinePaymentContextResponse>(`${this.baseUrl}/${invoiceId}/offline-payment`);
  }

  /**
   * Previews how the lines divide across the agreement's open invoices. `200` also when they exceed the
   * maximum (`exceedsPayable`); never writes anything (BR-41).
   */
  preview(invoiceId: string, request: PreviewOfflinePaymentRequest): Observable<OfflinePaymentPreviewResponse> {
    return this.http.post<OfflinePaymentPreviewResponse>(`${this.baseUrl}/${invoiceId}/offline-payments/preview`, request);
  }

  /**
   * Records the payment. `202 Accepted` means **queued** at Finance.
   *
   * **Sent once.** `502 record_payment.submission_unconfirmed` means it may or may not have been queued; a
   * person may press again, with the same `submissionId`, and it is recorded once (BR-39).
   */
  submit(invoiceId: string, request: RecordOfflinePaymentRequest): Observable<OfflinePaymentSubmittedResponse> {
    return this.http.post<OfflinePaymentSubmittedResponse>(`${this.baseUrl}/${invoiceId}/offline-payments`, request);
  }
}
