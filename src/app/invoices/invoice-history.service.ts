import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { InvoiceHistoryCard, InvoiceHistoryQuery } from './invoice-history.models';
import { PagedResult } from './invoice.models';

/**
 * Reads one invoice's activity timeline (backend spec `12-invoice-history.md` v4).
 *
 * Specified in `docs/specs/rent-agreements/08-invoice-activity-timeline-ui.md`.
 *
 * **This service renders nothing and decides nothing, deliberately.** The endpoint returns *finished*
 * plain-English sentences rather than a template id and a bag of values (backend **D2**), so that one
 * wording serves the owner portal, the tenant portal and any future export, and so that the money,
 * date and time-zone formatting stays in the one place that knows the invoice's time zone. What falls
 * to this side is a discipline rather than work: every figure that arrives is already final, and the
 * job here is to not improve any of it.
 *
 * **Separate from `InvoicesService` because it reads a different resource.** That service is a set of
 * typed reads over the invoice *projection* — the invoice's current face. This one reads the invoice's
 * *past*, folded out of `mt_events` per request through a different handler, with a paging window of
 * its own. The projection and the stream can never disagree precisely because the history is derived
 * rather than stored (backend **BR-01**), which is also why there is nothing here to cache, invalidate
 * or version.
 */
@Injectable({ providedIn: 'root' })
export class InvoiceHistoryService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/invoices`;

  constructor(private readonly http: HttpClient) {}

  /**
   * One page of an invoice's timeline, **newest first**.
   *
   * **The order is the server's.** Cards arrive sorted by `streamVersion` descending (**BR-15**) and
   * entries by `sequence` within a card (**BR-11**); this method hands the page back untouched, and a
   * caller that re-sorts — by `occurredAt`, most temptingly — would shuffle the pairs of events that
   * were appended in one transaction and therefore share an instant.
   *
   * **The scope is not asked for here.** The organization, the property owner and the acting user ride
   * the headers `scopeHeadersInterceptor` attaches centrally, or the bearer on the dev and qa builds.
   * This endpoint reads none of them — the invoice id is the whole address.
   *
   * **An empty page is not a missing invoice.** `200` with `items: []` means nothing has happened to
   * this invoice yet: a raise renders no card (**BR-04**), so a freshly raised invoice has an empty
   * timeline by design (**BR-33**). `404` — `invoice.not_found` — is reserved for an id with no stream
   * at all (**BR-27**), and a **deleted or voided** invoice still answers in full, ending with the card
   * that records its removal.
   *
   * A failure propagates as an ordinary `HttpErrorResponse` carrying an RFC 9457 body, so the existing
   * `detail` reading every JSON screen uses applies unchanged — unlike the download
   * (`InvoiceDocumentService`), whose `responseType: 'blob'` delivers its errors as blobs too.
   *
   * @param invoiceId The invoice whose history is wanted.
   * @param query The paging window. Omit it to take the endpoint's page 1 of 50.
   */
  getHistory(
    invoiceId: string,
    query: InvoiceHistoryQuery = {}
  ): Observable<PagedResult<InvoiceHistoryCard>> {
    return this.http.get<PagedResult<InvoiceHistoryCard>>(`${this.baseUrl}/${invoiceId}/history`, {
      params: InvoiceHistoryService.toParams(query)
    });
  }

  /**
   * Projects the window onto query parameters, **omitting either member that is absent**.
   *
   * The omission is load-bearing rather than tidiness, the same way it is in
   * `InvoicesService.toParams`: `pageSize=` is not the absence of a page size, it is an invalid one,
   * and the endpoint answers `400` to it. Omitted entirely, both fall back to the server's defaults —
   * page `1`, size `50` — which for a typical invoice is the whole history, so the ordinary call sends
   * a bare URL.
   */
  private static toParams(query: InvoiceHistoryQuery): HttpParams {
    let params = new HttpParams();

    if (query.page !== undefined && query.page !== null) {
      params = params.set('page', String(query.page));
    }
    if (query.pageSize !== undefined && query.pageSize !== null) {
      params = params.set('pageSize', String(query.pageSize));
    }

    return params;
  }
}
