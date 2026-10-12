import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import {
  ApplyDepositRequest,
  ApplyDepositResponse,
  DepositApplicationContextResponse
} from './deposit-application.models';
import { DepositApplicationService } from './deposit-application.service';

/** Covers the contract section of `10-deposit-application-ui.md` v1 — the three calls, and nothing more. */
describe('DepositApplicationService', () => {
  let service: DepositApplicationService;
  let httpMock: HttpTestingController;

  const invoiceId = '8f14e45f-ceea-467e-bd9f-000000000001';
  const allocationId = '99999999-8888-7777-6666-555555555555';
  const baseUrl = `${environment.apiBaseUrl}/api/v1/invoices/${invoiceId}`;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });

    service = TestBed.inject(DepositApplicationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('get() reads /invoices/{id}/deposit-application and returns the context as served', () => {
    let actual: DepositApplicationContextResponse | undefined;
    service.get(invoiceId).subscribe((context) => (actual = context));

    const request = httpMock.expectOne(`${baseUrl}/deposit-application`);
    expect(request.request.method).toBe('GET');

    const body = { invoiceId, invoiceNumber: 'INV-102026-000601', available: 100 } as DepositApplicationContextResponse;
    request.flush(body);

    expect(actual).toEqual(body);
  });

  it('apply() posts the request body unchanged to /invoices/{id}/deposit-applications', () => {
    const body: ApplyDepositRequest = {
      applicationId: '7a1e2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b',
      allocations: [{ invoiceId: '11111111-1111-1111-1111-111111111111', amount: 60 }],
      maintenanceItems: [{ description: 'Carpet cleaning', amount: 40 }]
    };
    const answer: ApplyDepositResponse = { applicationId: body.applicationId, allocations: [], isReplay: false };

    let actual: ApplyDepositResponse | undefined;
    service.apply(invoiceId, body).subscribe((response) => (actual = response));

    const request = httpMock.expectOne(`${baseUrl}/deposit-applications`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);

    request.flush(answer, { status: 201, statusText: 'Created' });

    expect(actual).toEqual(answer);
  });

  it('remove() deletes /invoices/{id}/deposit-applications/{allocationId}', () => {
    let done = false;
    service.remove(invoiceId, allocationId).subscribe(() => (done = true));

    const request = httpMock.expectOne(`${baseUrl}/deposit-applications/${allocationId}`);
    expect(request.request.method).toBe('DELETE');

    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(done).toBeTrue();
  });
});
