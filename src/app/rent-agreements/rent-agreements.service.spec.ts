import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { RentAgreementsService } from './rent-agreements.service';
import {
  AddAdditionalChargeRequest,
  CreateRentAgreementRequest,
  CreateRentAgreementResponse,
  RentAgreementAdditionalChargeResponse,
  UpdateProposedInvoiceRequest
} from './rent-agreement.models';

describe('RentAgreementsService', () => {
  let service: RentAgreementsService;
  let httpMock: HttpTestingController;

  const baseUrl = `${environment.apiBaseUrl}/api/v1/rent/agreements`;

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

  it('create() posts to /api/v1/rent/agreements with the given request body', () => {
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
          rent: 100,
          isManualChanged: false
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

  it('addAdditionalCharge() posts the charge at the BODY ROOT, tenantIds included', () => {
    const agreementId = '44444444-4444-4444-4444-444444444444';
    const request: AddAdditionalChargeRequest = {
      notes: 'Parking',
      alreadyPaid: 0,
      attachedWithRentalInvoice: false,
      isRecurring: false,
      dueDate: '2026-09-01',
      hasNoEndDate: false,
      tenantIds: ['66666666-6666-6666-6666-666666666666'],
      items: [
        {
          lineItemId: '77777777-7777-7777-7777-777777777777',
          itemType: 'Parking',
          description: 'Reserved bay',
          quantity: 1,
          rate: 50,
          amount: 50
        }
      ]
    };

    let actualResponse: RentAgreementAdditionalChargeResponse | undefined;
    service.addAdditionalCharge(agreementId, request).subscribe((response) => (actualResponse = response));

    const req = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    expect(req.request.method).toBe('POST');

    // The point of these three assertions: the charge is NOT nested under a `charge` member. The
    // backend reads it from the JSON root, and a wrapper would deserialize to a charge missing every
    // required field and come back a 400.
    expect(req.request.body).toEqual(request);
    expect(req.request.body.charge).toBeUndefined();
    expect(req.request.body.tenantIds).toEqual(['66666666-6666-6666-6666-666666666666']);

    const expectedResponse: RentAgreementAdditionalChargeResponse = {
      id: '88888888-8888-8888-8888-888888888888',
      category: 'Rent',
      notes: 'Parking',
      alreadyPaid: 0,
      attachedWithRentalInvoice: false,
      isRecurring: false,
      dueDate: '2026-09-01',
      hasNoEndDate: false,
      tenantIds: ['66666666-6666-6666-6666-666666666666'],
      items: [
        {
          id: '99999999-9999-9999-9999-999999999999',
          itemType: 'Parking',
          description: 'Reserved bay',
          quantity: 1,
          rate: 50,
          amount: 50
        }
      ],
      isApplied: false
    };

    req.flush(expectedResponse, { status: 201, statusText: 'Created' });

    expect(actualResponse).toEqual(expectedResponse);
  });

  it('updateProposedInvoice() PATCHes the agreement-scoped proposal route', () => {
    const agreementId = '11111111-1111-1111-1111-111111111111';
    const proposedInvoiceId = '22222222-2222-2222-2222-222222222222';
    const request: UpdateProposedInvoiceRequest = {
      dueDate: '2026-09-05',
      lines: [
        {
          lineId: '33333333-3333-3333-3333-333333333333',
          itemType: 'Rent',
          description: 'Rent — cycle 1',
          quantity: 1,
          rate: 1100
        }
      ]
    };

    service.updateProposedInvoice(agreementId, proposedInvoiceId, request).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/${agreementId}/proposed-invoices/${proposedInvoiceId}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(request);

    req.flush({});
  });
});
