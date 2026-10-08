import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import {
  CreateDepositRefundRequest,
  DepositRefundResponse,
  DepositRefundSubmittedResponse
} from './deposit-refund.models';
import { DepositRefundService } from './deposit-refund.service';

/** Covers the contract section of `09-deposit-refund-ui.md` v1 — the four calls, and nothing more. */
describe('DepositRefundService', () => {
  let service: DepositRefundService;
  let httpMock: HttpTestingController;

  const invoiceId = '8f14e45f-ceea-467e-bd9f-000000000001';
  const refundId = '99999999-8888-7777-6666-555555555555';
  const baseUrl = `${environment.apiBaseUrl}/api/v1/invoices/${invoiceId}`;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });

    service = TestBed.inject(DepositRefundService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('get() reads /invoices/{id}/deposit-refund and returns the view as served', () => {
    let actual: DepositRefundResponse | undefined;
    service.get(invoiceId).subscribe((view) => (actual = view));

    const request = httpMock.expectOne(`${baseUrl}/deposit-refund`);
    expect(request.request.method).toBe('GET');

    const body = { invoiceId, invoiceNumber: 'INV-102026-000501', isDepositInvoice: true } as DepositRefundResponse;
    request.flush(body);

    expect(actual).toEqual(body);
  });

  it('create() posts the request body unchanged to /invoices/{id}/deposit-refunds', () => {
    const body: CreateDepositRefundRequest = {
      mode: 'offline',
      returns: [{ tenantId: '11111111-1111-1111-1111-111111111111', method: 'check', checkNumber: '1042', amount: 9, interest: 0 }]
    };

    let actual: DepositRefundSubmittedResponse | undefined;
    service.create(invoiceId, body).subscribe((submitted) => (actual = submitted));

    const request = httpMock.expectOne(`${baseUrl}/deposit-refunds`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);

    request.flush({ invoiceId, status: 'accepted' }, { status: 202, statusText: 'Accepted' });

    expect(actual).toEqual({ invoiceId, status: 'accepted' });
  });

  it('cancel() posts to …/deposit-refunds/{refundId}/cancel with no body and resolves on 204', () => {
    let completed = false;
    service.cancel(invoiceId, refundId).subscribe({ complete: () => (completed = true) });

    const request = httpMock.expectOne(`${baseUrl}/deposit-refunds/${refundId}/cancel`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();

    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(completed).toBeTrue();
  });

  it('remove() sends DELETE …/deposit-refunds/{refundId} and resolves on 204', () => {
    let completed = false;
    service.remove(invoiceId, refundId).subscribe({ complete: () => (completed = true) });

    const request = httpMock.expectOne(`${baseUrl}/deposit-refunds/${refundId}`);
    expect(request.request.method).toBe('DELETE');

    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(completed).toBeTrue();
  });

  it('propagates a 422 to the caller with its problem body intact', () => {
    let error: { status: number; error: { errorCode: string } } | undefined;
    service
      .create(invoiceId, { mode: 'offline', returns: [] })
      .subscribe({ error: (err) => (error = err) });

    httpMock.expectOne(`${baseUrl}/deposit-refunds`).flush(
      {
        type: 'https://datatracker.ietf.org/doc/html/rfc9457',
        title: 'Business Rule Violation',
        status: 422,
        detail: 'Amount to return should be less than remaining amount.',
        errorCode: 'deposit_refund.exceeds_remaining_deposit'
      },
      { status: 422, statusText: 'Unprocessable Entity' }
    );

    expect(error?.status).toBe(422);
    expect(error?.error.errorCode).toBe('deposit_refund.exceeds_remaining_deposit');
  });
});
