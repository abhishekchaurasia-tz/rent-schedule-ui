import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { RentScheduleService } from './rent-schedule.service';
import {
  CandidateDateRequest,
  CandidateDateResponse,
  PreviewRentScheduleRequest,
  PreviewRentScheduleResponse
} from './rent-schedule.models';

describe('RentScheduleService', () => {
  let service: RentScheduleService;
  let httpMock: HttpTestingController;

  const baseUrl = `${environment.apiBaseUrl}/api/v1/rent-schedule`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });

    service = TestBed.inject(RentScheduleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('preview() posts to /api/v1/rent-schedule/preview with the given request body', () => {
    const request: PreviewRentScheduleRequest = {
      startDate: '2026-08-01',
      endDate: '2027-08-01',
      leaseTermType: 'fixed',
      rent: 100,
      frequency: 'monthly',
      firstRentalDueDate: '2026-08-01',
      frequencyConfig: { dueOnDay: 1 },
      overrides: [],
      monthToMonthInvoiceCount: null,
      nextLeaseStartDate: null
    };
    const expectedResponse: PreviewRentScheduleResponse = {
      rows: [{ scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 100 }],
      totalInvoices: 1,
      totalAmount: 100
    };

    let actualResponse: PreviewRentScheduleResponse | undefined;
    service.preview(request).subscribe((response) => (actualResponse = response));

    const req = httpMock.expectOne(`${baseUrl}/preview`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);

    req.flush(expectedResponse);

    expect(actualResponse).toEqual(expectedResponse);
  });

  it('preview() propagates an HTTP error response to the caller', () => {
    const request: PreviewRentScheduleRequest = {
      startDate: '',
      leaseTermType: 'fixed',
      rent: 0,
      frequency: 'monthly',
      firstRentalDueDate: '',
      frequencyConfig: { dueOnDay: 1 },
      overrides: [],
      monthToMonthInvoiceCount: null,
      nextLeaseStartDate: null
    };

    let error: unknown;
    service.preview(request).subscribe({
      error: (err) => (error = err)
    });

    const req = httpMock.expectOne(`${baseUrl}/preview`);
    req.flush(
      { type: 'about:blank', title: 'Bad Request', status: 400, detail: 'StartDate is required.' },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(error).toBeTruthy();
  });

  it('firstRentalDueDateOptions() posts to /api/v1/rent-schedule/first-rental-due-date-options with the given request body', () => {
    const request: CandidateDateRequest = {
      startDate: '2026-08-01',
      endDate: '2027-08-01',
      leaseTermType: 'fixed',
      frequency: 'monthly',
      frequencyConfig: { dueOnDay: 1 },
      monthToMonthInvoiceCount: null,
      nextLeaseStartDate: null
    };
    const expectedResponse: CandidateDateResponse = {
      dates: ['2026-08-01', '2026-09-01']
    };

    let actualResponse: CandidateDateResponse | undefined;
    service.firstRentalDueDateOptions(request).subscribe((response) => (actualResponse = response));

    const req = httpMock.expectOne(`${baseUrl}/first-rental-due-date-options`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);

    req.flush(expectedResponse);

    expect(actualResponse).toEqual(expectedResponse);
  });
});
