import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { InvoiceDetailResponse } from './invoice.models';

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
}
