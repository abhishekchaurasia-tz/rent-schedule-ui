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

  it('getById() propagates a 404 to the caller rather than swallowing it', () => {
    let error: unknown;
    service.getById(invoiceId).subscribe({ error: (err) => (error = err) });

    httpMock.expectOne(`${baseUrl}/${invoiceId}`).flush(
      { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Invoice not found.' },
      { status: 404, statusText: 'Not Found' }
    );

    expect(error).toBeTruthy();
  });
});
