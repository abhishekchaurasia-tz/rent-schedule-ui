import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  InvoiceDetailResponse,
  InvoiceSearchQuery,
  InvoiceSummaryResponse,
  PagedResult
} from './invoice.models';

/**
 * Reads over the invoice projection.
 *
 * Deliberately read-only. Invoices are not created here — every invoice comes into existence through
 * the unified pipeline behind `POST /rent/agreements/{id}/additional-charges` — and they are not
 * edited here either: a correction is applied to the *proposal* behind the invoice, through
 * `RentAgreementsService.updateProposedInvoice`. That split is the backend's, and mirroring it keeps
 * each client named after the resource it actually addresses.
 */
@Injectable({ providedIn: 'root' })
export class InvoicesService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/invoices`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Reads one invoice by id, with its lines, payments, applied credits and tenant shares embedded.
   *
   * A **deleted** invoice still comes back, carrying `deletedAt` and `status: "Deleted"` — asking for
   * a specific invoice is an explicit request, unlike a list, so the backend does not hide it. A
   * `404` means no stream carries that id.
   */
  getById(invoiceId: string): Observable<InvoiceDetailResponse> {
    return this.http.get<InvoiceDetailResponse>(`${this.baseUrl}/${invoiceId}`);
  }

  /**
   * One filtered, ordered page of a property owner's invoices.
   *
   * **The ordering is the server's and is not selectable**: `dueDate` then `invoiceNumber`. Invoice
   * numbers are unique, so that pair is a *total* order — the only kind that makes offset pagination
   * stable, since a tied ordering can repeat a row on one page and skip it on another.
   *
   * Deleted invoices are excluded unless `includeDeleted` is set; voided ones are always returned and
   * reported as `voided`.
   */
  search(query: InvoiceSearchQuery): Observable<PagedResult<InvoiceSummaryResponse>> {
    return this.http.get<PagedResult<InvoiceSummaryResponse>>(this.baseUrl, {
      params: InvoicesService.toParams(query)
    });
  }

  /**
   * Deletes one invoice, cascading the removal back through the billing plan to the lease's schedule.
   * Returns `204` on success, `404` — `invoice.not_found` — when no invoice has that id, or `422` —
   * `invoice.has_received_payment` — when a payment has ever applied to it.
   *
   * **Soft-deleted, not erased.** The invoice stays readable via `getById`, carrying `deletedAt` and
   * `status: "deleted"`, and is excluded from {@link search} results unless `includeDeleted` is set.
   *
   * **Idempotent.** A repeat of a delete that already succeeded answers `204` again rather than
   * `404` — a retried request is the ordinary case, not an error.
   */
  delete(invoiceId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${invoiceId}`);
  }

  /**
   * Voids one invoice — the same removal as {@link delete}, with the invoice left visible. Returns
   * `204` on success, `404` — `invoice.not_found`, or `422` — `invoice.has_received_payment` — under
   * the same conditions as {@link delete}.
   *
   * **The only difference from delete is what {@link search} does with the result**: a voided invoice
   * is always returned and reports `status: "voided"`, where a deleted one is hidden unless asked for.
   * Idempotent for the same reason `delete` is.
   */
  void(invoiceId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${invoiceId}/void`, null);
  }

  /**
   * Projects the criteria onto query parameters, **omitting every member that is absent or blank**.
   *
   * The omission is load-bearing, not tidiness: `invoiceNumber=""` is an exact-match filter for the
   * empty string, which matches nothing, rather than the absence of a filter. The booleans are sent
   * only when `true` for the same reason — `outstandingOnly=false` is the default the endpoint already
   * applies, and sending it adds a parameter that says nothing.
   */
  private static toParams(query: InvoiceSearchQuery): HttpParams {
    let params = new HttpParams().set('propertyOwnerId', query.propertyOwnerId);

    const setIfPresent = (name: string, value: string | number | undefined | null) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        params = params.set(name, String(value));
      }
    };

    setIfPresent('page', query.page);
    setIfPresent('pageSize', query.pageSize);
    setIfPresent('invoiceNumber', query.invoiceNumber?.trim());
    setIfPresent('invoiceType', query.invoiceType);
    setIfPresent('dueDateFrom', query.dueDateFrom);
    setIfPresent('dueDateTo', query.dueDateTo);
    setIfPresent('generatedOnFrom', query.generatedOnFrom);
    setIfPresent('generatedOnTo', query.generatedOnTo);
    setIfPresent('propertyId', query.propertyId);
    setIfPresent('propertyUnitId', query.propertyUnitId);
    setIfPresent('tenantId', query.tenantId);
    setIfPresent('rentAgreementId', query.rentAgreementId);

    if (query.outstandingOnly) {
      params = params.set('outstandingOnly', 'true');
    }
    if (query.includeDeleted) {
      params = params.set('includeDeleted', 'true');
    }

    // `append`, not `set`: the endpoint unions repeated `status` parameters, and `set` would keep only
    // the last one — quietly narrowing a two-status filter to one.
    for (const status of query.status ?? []) {
      params = params.append('status', status);
    }

    return params;
  }
}
