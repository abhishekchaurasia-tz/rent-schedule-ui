import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { InvoiceDetailResponse } from './invoice.models';
import { InvoicesService } from './invoices.service';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let httpMock: HttpTestingController;

  const baseUrl = `${environment.apiBaseUrl}/api/v1/invoices`;
  const invoiceId = '8f14e45f-ceea-467e-bd9f-000000000001';

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });

    service = TestBed.inject(InvoicesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getById() reads /api/v1/invoices/{id} and returns the projected invoice', () => {
    let actual: InvoiceDetailResponse | undefined;
    service.getById(invoiceId).subscribe((invoice) => (actual = invoice));

    const request = httpMock.expectOne(`${baseUrl}/${invoiceId}`);
    expect(request.request.method).toBe('GET');

    const body = {
      invoiceId,
      invoiceNumber: 'INV-092026-000042',
      rentAgreementId: '11111111-1111-1111-1111-111111111111',
      // The field this whole screen depends on — added by backend spec 02-invoicing.md v36.
      proposedInvoiceId: '22222222-2222-2222-2222-222222222222',
      lines: []
    } as unknown as InvoiceDetailResponse;

    request.flush(body);

    expect(actual).toEqual(body);
    expect(actual?.proposedInvoiceId).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('search() sends the owner scope and omits every absent filter', () => {
    service.search({ propertyOwnerId: '55555555-5555-5555-5555-555555555555' }).subscribe();

    const request = httpMock.expectOne((r) => r.url === baseUrl);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('propertyOwnerId')).toBe('55555555-5555-5555-5555-555555555555');

    // An empty `invoiceNumber` on the wire is an exact-match filter for the empty string, not the
    // absence of a filter — so a blank must not be sent at all.
    expect(request.request.params.has('invoiceNumber')).toBeFalse();
    expect(request.request.params.has('page')).toBeFalse();
    expect(request.request.params.has('outstandingOnly')).toBeFalse();

    request.flush({ items: [], totalCount: 0, pageNumber: 1, pageSize: 50, totalPages: 0, hasNextPage: false, hasPreviousPage: false });
  });

  it('search() repeats `status` once per value rather than overwriting it', () => {
    service
      .search({
        propertyOwnerId: '55555555-5555-5555-5555-555555555555',
        status: ['overdue', 'partial_paid'],
        page: 2,
        pageSize: 25,
        invoiceNumber: '  INV-082026-000002  ',
        outstandingOnly: true,
        includeDeleted: true
      })
      .subscribe();

    const request = httpMock.expectOne((r) => r.url === baseUrl);
    expect(request.request.params.getAll('status')).toEqual(['overdue', 'partial_paid']);
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('25');
    expect(request.request.params.get('invoiceNumber')).toBe('INV-082026-000002');
    expect(request.request.params.get('outstandingOnly')).toBe('true');
    expect(request.request.params.get('includeDeleted')).toBe('true');

    request.flush({ items: [], totalCount: 0, pageNumber: 2, pageSize: 25, totalPages: 0, hasNextPage: false, hasPreviousPage: true });
  });

  it('getById() propagates a 404 to the caller rather than swallowing it', () => {
    let error: unknown;
    service.getById(invoiceId).subscribe({ error: (err) => (error = err) });

    httpMock.expectOne(`${baseUrl}/${invoiceId}`).flush(
      { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Invoice not found.' },
      { status: 404, statusText: 'Not Found' }
    );

    expect(error).toBeTruthy();
  });

  it('delete() sends DELETE /api/v1/invoices/{id} and resolves on 204', () => {
    let completed = false;
    service.delete(invoiceId).subscribe({ complete: () => (completed = true) });

    const request = httpMock.expectOne(`${baseUrl}/${invoiceId}`);
    expect(request.request.method).toBe('DELETE');

    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(completed).toBeTrue();
  });

  it('delete() propagates a 422 (invoice.has_received_payment) to the caller', () => {
    let error: unknown;
    service.delete(invoiceId).subscribe({ error: (err) => (error = err) });

    httpMock.expectOne(`${baseUrl}/${invoiceId}`).flush(
      {
        type: 'about:blank',
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'A payment has been applied to this invoice; it cannot be deleted.'
      },
      { status: 422, statusText: 'Unprocessable Entity' }
    );

    expect(error).toBeTruthy();
  });

  it('void() sends POST /api/v1/invoices/{id}/void with no body and resolves on 204', () => {
    let completed = false;
    service.void(invoiceId).subscribe({ complete: () => (completed = true) });

    const request = httpMock.expectOne(`${baseUrl}/${invoiceId}/void`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();

    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(completed).toBeTrue();
  });

  it('void() propagates a 404 (invoice.not_found) to the caller', () => {
    let error: unknown;
    service.void(invoiceId).subscribe({ error: (err) => (error = err) });

    httpMock.expectOne(`${baseUrl}/${invoiceId}/void`).flush(
      { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Invoice not found.' },
      { status: 404, statusText: 'Not Found' }
    );

    expect(error).toBeTruthy();
  });
});
