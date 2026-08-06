import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { RentAgreementsService } from './rent-agreements.service';
import { CreateRentAgreementRequest, CreateRentAgreementResponse } from './rent-agreement.models';

describe('RentAgreementsService', () => {
  let service: RentAgreementsService;
  let httpMock: HttpTestingController;

  const baseUrl = `${environment.apiBaseUrl}/api/v1/rent-agreements`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });

    service = TestBed.inject(RentAgreementsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('create() posts to /api/v1/rent-agreements with the given request body', () => {
    const request: CreateRentAgreementRequest = {
      propertyUnitId: '11111111-1111-1111-1111-111111111111',
      propertyId: '22222222-2222-2222-2222-222222222222',
      propertyOwnerId: '33333333-3333-3333-3333-333333333333',
      startDate: '2026-08-01',
      endDate: '2027-08-01',
      fullRent: 100,
      frequency: 'monthly',
      frequencyConfig: { dueOnDay: 1 },
      firstRentalDueDate: '2026-08-01',
      deposit: null,
      depositDueDate: null,
      scheduleRows: [{ scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 100 }],
      additionalCharges: []
    };
    const expectedResponse: CreateRentAgreementResponse = {
      agreementId: '44444444-4444-4444-4444-444444444444',
      status: 'draft',
      depositCollected: false,
      scheduleRows: [
        {
          id: '55555555-5555-5555-5555-555555555555',
          scheduledDate: '2026-08-01',
          dueDate: '2026-08-01',
          rent: 100
        }
      ],
      additionalCharges: []
    };

    let actualResponse: CreateRentAgreementResponse | undefined;
    service.create(request).subscribe((response) => (actualResponse = response));

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);

    req.flush(expectedResponse);

    expect(actualResponse).toEqual(expectedResponse);
  });

  it('create() propagates an HTTP error response to the caller', () => {
    const request: CreateRentAgreementRequest = {
      propertyUnitId: '11111111-1111-1111-1111-111111111111',
      propertyId: '22222222-2222-2222-2222-222222222222',
      propertyOwnerId: '33333333-3333-3333-3333-333333333333',
      startDate: '2026-08-01',
      fullRent: 100,
      frequency: 'monthly',
      frequencyConfig: { dueOnDay: 1 },
      firstRentalDueDate: '2026-08-01',
      scheduleRows: []
    };

    let error: unknown;
    service.create(request).subscribe({
      error: (err) => (error = err)
    });

    const req = httpMock.expectOne(baseUrl);
    req.flush(
      {
        type: 'about:blank',
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'ScheduleRows must not be empty.'
      },
      { status: 422, statusText: 'Unprocessable Entity' }
    );

    expect(error).toBeTruthy();
  });
});
