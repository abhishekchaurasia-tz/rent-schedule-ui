import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { ApplyLateFeesRequest, ApplyLateFeesResponse, LateFeeSummaryResponse } from './late-fee.models';
import { LateFeeService } from './late-fee.service';

// Spec `07-late-fee-ui.md` v1 — API Endpoints & Server Operations; DoD 14 for the optional fields.
describe('LateFeeService', () => {
  let service: LateFeeService;
  let httpMock: HttpTestingController;

  const invoiceId = '8f14e45f-ceea-467e-bd9f-000000000001';
  const url = `${environment.apiBaseUrl}/api/v1/invoices/${invoiceId}/late-fee`;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });

    service = TestBed.inject(LateFeeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('get() reads the invoice late fee route and returns the summary', () => {
    let actual: LateFeeSummaryResponse | undefined;
    service.get(invoiceId).subscribe((summary) => (actual = summary));

    const request = httpMock.expectOne(url);
    expect(request.request.method).toBe('GET');

    const body: LateFeeSummaryResponse = {
      invoiceId,
      dueDate: '2026-08-01',
      invoiceType: 'Rent',
      invoiceAmount: 1050,
      paidAmount: 1020,
      lateFeeAmount: 50,
      paidLateFeeAmount: 20,
      remainingLateFeeAmount: 30,
      isLateFeeRemoved: false,
      isLateFeeEdited: false,
      lines: [{ lineId: '9a1b2c3d-0000-4000-8000-000000000001', description: 'Late fee', quantity: 1, rate: 50, amount: 50 }]
    };
    request.flush(body);

    expect(actual).toEqual(body);
  });

  it('apply() puts the list, without an invoice id or owner in the body, and returns the outcome', () => {
    const list: ApplyLateFeesRequest = {
      calculatedAtUtc: '2026-08-20T06:00:00.000Z',
      lines: [{ lineKey: 'flat', description: 'Late fee', quantity: 2, rate: 25, amount: 50 }]
    };
    let actual: ApplyLateFeesResponse | undefined;
    service.apply(invoiceId, list).subscribe((outcome) => (actual = outcome));

    const request = httpMock.expectOne(url);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(list);
    expect(Object.keys(request.request.body)).toEqual(['calculatedAtUtc', 'lines']);

    request.flush({ outcome: 'skipped', skipReason: 'older_calculation', linesChanged: false });

    expect(actual).toEqual({ outcome: 'skipped', skipReason: 'older_calculation', linesChanged: false });
  });

  it('remove() deletes the invoice late fee, not the invoice', () => {
    let completed = false;
    service.remove(invoiceId).subscribe({ complete: () => (completed = true) });

    const request = httpMock.expectOne(url);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(completed).toBeTrue();
  });

  it('names no owner in any URL: the scope travels as headers', () => {
    service.get(invoiceId).subscribe();
    service.remove(invoiceId).subscribe();

    const requests = httpMock.match(url);
    expect(requests.length).toBe(2);
    requests.forEach((request) => {
      expect(request.request.params.keys()).toEqual([]);
      request.flush(null);
    });
  });
});
