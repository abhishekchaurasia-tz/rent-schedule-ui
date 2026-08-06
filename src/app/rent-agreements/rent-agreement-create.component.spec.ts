import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { RentAgreementCreateComponent } from './rent-agreement-create.component';
import { AdditionalChargeCreationRequest, CreateRentAgreementResponse } from './rent-agreement.models';
import { CandidateDateResponse, PreviewRentScheduleResponse } from '../rent-schedule/rent-schedule.models';

describe('RentAgreementCreateComponent', () => {
  let fixture: ComponentFixture<RentAgreementCreateComponent>;
  let component: RentAgreementCreateComponent;
  let httpMock: HttpTestingController;

  const optionsUrl = 'http://localhost:5169/api/v1/rent-schedule/first-rental-due-date-options';
  const previewUrl = 'http://localhost:5169/api/v1/rent-schedule/preview';
  const createUrl = 'http://localhost:5169/api/v1/rent-agreements';

  const fillValidForm = () => {
    component.form.patchValue({
      propertyUnitId: '11111111-1111-1111-1111-111111111111',
      propertyId: '22222222-2222-2222-2222-222222222222',
      propertyOwnerId: '33333333-3333-3333-3333-333333333333',
      startDate: '2026-08-01',
      endDate: '2027-08-01',
      leaseTermType: 'fixed',
      rent: 100,
      frequency: 'monthly',
      dueOnDay: 1,
      firstRentalDueDate: '2026-08-01'
    });
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RentAgreementCreateComponent, HttpClientTestingModule]
    });

    fixture = TestBed.createComponent(RentAgreementCreateComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not generate a preview and marks all fields touched when the form is invalid', () => {
    fixture.detectChanges();

    component.generatePreview();

    httpMock.expectNone(previewUrl);
    expect(component.form.get('startDate')!.touched).toBeTrue();
  });

  it('generates a preview and does not attempt to save until the user clicks Save', fakeAsync(() => {
    fixture.detectChanges();
    fillValidForm();
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);

    component.generatePreview();

    const response: PreviewRentScheduleResponse = {
      rows: [{ scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 100 }],
      totalInvoices: 1,
      totalAmount: 100
    };
    httpMock.expectOne(previewUrl).flush(response);

    expect(component.previewResult()).toEqual(response);
    httpMock.expectNone(createUrl);
  }));

  it('saves the previewed rows as a new rent agreement on Save', fakeAsync(() => {
    fixture.detectChanges();
    fillValidForm();
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);

    component.generatePreview();
    const previewResponse: PreviewRentScheduleResponse = {
      rows: [{ scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 100 }],
      totalInvoices: 1,
      totalAmount: 100
    };
    httpMock.expectOne(previewUrl).flush(previewResponse);

    component.save();

    expect(component.saving()).toBeTrue();

    const req = httpMock.expectOne(createUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.propertyUnitId).toBe('11111111-1111-1111-1111-111111111111');
    expect(req.request.body.scheduleRows).toEqual(previewResponse.rows);

    const createResponse: CreateRentAgreementResponse = {
      agreementId: '44444444-4444-4444-4444-444444444444',
      status: 'draft',
      depositCollected: false,
      scheduleRows: [],
      additionalCharges: []
    };
    req.flush(createResponse);

    expect(component.saving()).toBeFalse();
    expect(component.saveResult()).toEqual(createResponse);
  }));

  it('does not save without a generated preview first', () => {
    fixture.detectChanges();

    component.save();

    httpMock.expectNone(createUrl);
    expect(component.saveResult()).toBeNull();
  });

  it('rejects a deposit without a matching deposit due date before calling the API', fakeAsync(() => {
    fixture.detectChanges();
    fillValidForm();
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);

    component.generatePreview();
    httpMock.expectOne(previewUrl).flush({
      rows: [{ scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 100 }],
      totalInvoices: 1,
      totalAmount: 100
    } as PreviewRentScheduleResponse);

    component.form.patchValue({ deposit: 500 });
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);

    component.save();

    httpMock.expectNone(createUrl);
    expect(component.saveError()).toContain('Deposit');
  }));

  it('surfaces the Problem Details detail message when save fails with a business validation error', fakeAsync(() => {
    fixture.detectChanges();
    fillValidForm();
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);

    component.generatePreview();
    httpMock.expectOne(previewUrl).flush({
      rows: [{ scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 100 }],
      totalInvoices: 1,
      totalAmount: 100
    } as PreviewRentScheduleResponse);

    component.save();

    httpMock.expectOne(createUrl).flush(
      {
        type: 'about:blank',
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'FullRent must be greater than or equal to 0.'
      },
      { status: 422, statusText: 'Unprocessable Entity' }
    );

    expect(component.saving()).toBeFalse();
    expect(component.saveResult()).toBeNull();
    expect(component.saveError()).toBe('FullRent must be greater than or equal to 0.');
  }));

  it('opens the additional-charge panel and appends the created charge to the running list', () => {
    fixture.detectChanges();

    expect(component.showAdditionalChargePanel()).toBeFalse();
    component.openAdditionalChargePanel();
    expect(component.showAdditionalChargePanel()).toBeTrue();

    const charge: AdditionalChargeCreationRequest = {
      notes: 'Pet deposit',
      alreadyPaid: 0,
      attachedWithRentalInvoice: true,
      isRecurring: false,
      dueDate: '2026-08-15',
      hasNoEndDate: false,
      isGrouped: false,
      isSharedByAll: true,
      items: [{ itemType: 'Pet Fee', description: 'One-time pet fee', quantity: 1, rate: 50, amount: 50 }]
    };

    component.onAdditionalChargeCreated([{ charge, target: 'Rent' }]);

    expect(component.showAdditionalChargePanel()).toBeFalse();
    expect(component.additionalCharges()).toEqual([charge]);
    expect(component.additionalChargeTotal(charge)).toBe(50);
  });

  it('removes an additional charge from the running list', () => {
    fixture.detectChanges();

    const charge: AdditionalChargeCreationRequest = {
      alreadyPaid: 0,
      attachedWithRentalInvoice: true,
      isRecurring: false,
      dueDate: '2026-08-15',
      hasNoEndDate: false,
      isGrouped: false,
      isSharedByAll: true,
      items: [{ itemType: 'Late Fee', description: 'Late payment', quantity: 1, rate: 25, amount: 25 }]
    };
    component.onAdditionalChargeCreated([{ charge, target: 'Rent' }]);

    component.removeAdditionalCharge(0);

    expect(component.additionalCharges()).toEqual([]);
  });

  it('includes the running additional-charges list in the save request', fakeAsync(() => {
    fixture.detectChanges();
    fillValidForm();
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);

    const charge: AdditionalChargeCreationRequest = {
      alreadyPaid: 0,
      attachedWithRentalInvoice: true,
      isRecurring: false,
      dueDate: '2026-08-15',
      hasNoEndDate: false,
      isGrouped: false,
      isSharedByAll: true,
      items: [{ itemType: 'Late Fee', description: 'Late payment', quantity: 1, rate: 25, amount: 25 }]
    };
    component.onAdditionalChargeCreated([{ charge, target: 'Rent' }]);

    component.generatePreview();
    httpMock.expectOne(previewUrl).flush({
      rows: [{ scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 100 }],
      totalInvoices: 1,
      totalAmount: 100
    } as PreviewRentScheduleResponse);

    component.save();

    const req = httpMock.expectOne(createUrl);
    expect(req.request.body.additionalCharges).toEqual([charge]);

    req.flush({
      agreementId: '44444444-4444-4444-4444-444444444444',
      status: 'draft',
      depositCollected: false,
      scheduleRows: [],
      additionalCharges: []
    } as CreateRentAgreementResponse);
  }));
});
