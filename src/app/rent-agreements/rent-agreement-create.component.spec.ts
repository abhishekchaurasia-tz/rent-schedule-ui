import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';

import { RentAgreementCreateComponent } from './rent-agreement-create.component';
import { AdditionalChargeCreationRequest, CreateRentAgreementResponse } from './rent-agreement.models';
import { CandidateDateResponse, PreviewRentScheduleResponse } from '../rent-schedule/rent-schedule.models';

describe('RentAgreementCreateComponent', () => {
  let fixture: ComponentFixture<RentAgreementCreateComponent>;
  let component: RentAgreementCreateComponent;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;

  const optionsUrl = 'http://localhost:5169/api/v1/rent/schedule/first-rental-due-date-options';
  const previewUrl = 'http://localhost:5169/api/v1/rent/schedule/preview';
  const createUrl = 'http://localhost:5169/api/v1/rent/agreements';

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
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);

    TestBed.configureTestingModule({
      imports: [RentAgreementCreateComponent, HttpClientTestingModule],
      providers: [
        {
          // No `:id` on the route — these tests all exercise create mode. The edit-mode tests
          // provide their own ActivatedRoute below.
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({}) } }
        },
        { provide: Router, useValue: router }
      ]
    });

    fixture = TestBed.createComponent(RentAgreementCreateComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    // The form now defaults startDate/endDate to today/+6 months, so construction immediately
    // fires a first-rental-due-date-options request — drain it so tests can reason about the
    // request(s) they trigger themselves.
    httpMock.expectOne(optionsUrl).flush({ dates: [] } as CandidateDateResponse);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not auto-generate a preview while required fields are incomplete', () => {
    fixture.detectChanges();

    expect(() => httpMock.expectNone(previewUrl)).not.toThrow();
  });

  it('automatically generates a preview once the required fields are filled, without a button', fakeAsync(() => {
    fixture.detectChanges();
    fillValidForm();
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);

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
    // Unedited rows go up with isManualChanged/isCancelled: false — always sent, never omitted.
    expect(req.request.body.scheduleRows).toEqual(
      previewResponse.rows.map((row) => ({ ...row, isManualChanged: false, isCancelled: false }))
    );

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
    // A fresh create moves straight into step 2 of the wizard — the renter set.
    expect(router.navigate).toHaveBeenCalledWith(['/rent-agreements', createResponse.agreementId, 'tenants']);
  }));

  /** Drives the form to a previewed, two-row state so row-edit behaviour can be exercised. */
  const previewTwoRows = () => {
    fixture.detectChanges();
    fillValidForm();
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);

    const previewResponse: PreviewRentScheduleResponse = {
      rows: [
        { scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 100 },
        { scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 100 }
      ],
      totalInvoices: 2,
      totalAmount: 200
    };
    httpMock.expectOne(previewUrl).flush(previewResponse);
    return previewResponse;
  };

  it('sends a pre-save deleted row with isCancelled: true, still present in scheduleRows (spec v39)', fakeAsync(() => {
    previewTwoRows();

    component.deleteRow('2026-09-01');
    component.save();

    const req = httpMock.expectOne(createUrl);
    // The deleted row is still submitted — never omitted — but flagged isCancelled so the backend
    // persists it directly with a Cancelled status instead of Planned.
    expect(req.request.body.scheduleRows).toEqual([
      { scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 100, isManualChanged: false, isCancelled: false },
      { scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 100, isManualChanged: false, isCancelled: true }
    ]);

    req.flush({
      agreementId: '44444444-4444-4444-4444-444444444444',
      status: 'draft',
      depositCollected: false,
      scheduleRows: [],
      additionalCharges: []
    } as CreateRentAgreementResponse);
  }));

  it('flags a row whose rent was hand-edited and sends isManualChanged: true for it only', fakeAsync(() => {
    previewTwoRows();

    component.startEditRow(0);
    component.editRowRent.set(80);
    component.saveEditRow(0);

    expect(component.isRowManuallyChanged('2026-08-01')).toBeTrue();
    expect(component.isRowManuallyChanged('2026-09-01')).toBeFalse();

    component.save();

    const req = httpMock.expectOne(createUrl);
    expect(req.request.body.scheduleRows).toEqual([
      { scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 80, isManualChanged: true, isCancelled: false },
      { scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 100, isManualChanged: false, isCancelled: false }
    ]);

    req.flush({
      agreementId: '44444444-4444-4444-4444-444444444444',
      status: 'draft',
      depositCollected: false,
      scheduleRows: [],
      additionalCharges: []
    } as CreateRentAgreementResponse);
  }));

  it('does not flag a row when only its due date was moved', fakeAsync(() => {
    previewTwoRows();

    component.startEditRow(0);
    component.editRowDueDate.set('2026-08-05');
    component.saveEditRow(0);

    // The backend proves a manual date edit from dueDate vs the scheduledDate anchor, so the flag
    // must stay false — setting it would wrongly freeze this row's amount against regeneration.
    expect(component.isRowManuallyChanged('2026-08-01')).toBeFalse();

    component.save();

    const req = httpMock.expectOne(createUrl);
    expect(req.request.body.scheduleRows[0]).toEqual({
      scheduledDate: '2026-08-01',
      dueDate: '2026-08-05',
      rent: 100,
      isManualChanged: false,
      isCancelled: false
    });

    req.flush({
      agreementId: '44444444-4444-4444-4444-444444444444',
      status: 'draft',
      depositCollected: false,
      scheduleRows: [],
      additionalCharges: []
    } as CreateRentAgreementResponse);
  }));

  it('clears hand-edited flags when a fresh preview replaces the rows', fakeAsync(() => {
    previewTwoRows();

    component.startEditRow(0);
    component.editRowRent.set(80);
    component.saveEditRow(0);
    expect(component.isRowManuallyChanged('2026-08-01')).toBeTrue();

    // Changing a schedule-affecting field re-previews: new rows, so the old flags are meaningless.
    component.form.patchValue({ rent: 250 });
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);
    httpMock.expectOne(previewUrl).flush({
      rows: [{ scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 250 }],
      totalInvoices: 1,
      totalAmount: 250
    } as PreviewRentScheduleResponse);

    expect(component.isRowManuallyChanged('2026-08-01')).toBeFalse();
  }));

  it('resets a hand-edited rent and its flag when a same-anchor re-preview fires', fakeAsync(() => {
    previewTwoRows();

    component.startEditRow(0);
    component.editRowRent.set(80);
    component.saveEditRow(0);
    expect(component.isRowManuallyChanged('2026-08-01')).toBeTrue();

    // Only the overall rent changed — the recurrence-generated dates are identical, but the
    // manual-edit flag and the hand-set amount (80) must NOT survive: any schedule-affecting change
    // now takes the fresh preview value for every row and clears manuallyChangedRowDates, matching
    // the backend's reversed D4/D12 rule (spec v44) — manual no longer protects a row from a recompute.
    component.form.patchValue({ rent: 300 });
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);
    httpMock.expectOne(previewUrl).flush({
      rows: [
        { scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 300 },
        { scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 300 }
      ],
      totalInvoices: 2,
      totalAmount: 600
    } as PreviewRentScheduleResponse);

    expect(component.isRowManuallyChanged('2026-08-01')).toBeFalse();
    expect(component.previewResult()!.rows[0].rent).toBe(300);
    expect(component.previewResult()!.rows[1].rent).toBe(300);
    expect(component.previewResult()!.totalAmount).toBe(600);
  }));

  it('sends the deleted row flagged Cancelled in existingRows, on every preview call (spec v46)', fakeAsync(() => {
    previewTwoRows();

    component.deleteRow('2026-09-01');
    expect(component.cancelledRowDates().has('2026-09-01')).toBeTrue();

    component.form.patchValue({ rent: 250 });
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);

    const req = httpMock.expectOne(previewUrl);
    // Deciding whether a row is still cancelled is now the backend's job (spec v46) — the client's
    // only remaining responsibility is reporting its current known row state on every call.
    expect(req.request.body.existingRows).toEqual([
      {
        scheduledDate: '2026-08-01',
        dueDate: '2026-08-01',
        rent: 100,
        isManualChanged: false,
        status: 'Planned',
        invoiceStatus: null,
        invoiceDueDate: null
      },
      {
        scheduledDate: '2026-09-01',
        dueDate: '2026-09-01',
        rent: 100,
        isManualChanged: false,
        status: 'Cancelled',
        invoiceStatus: null,
        invoiceDueDate: null
      }
    ]);

    req.flush({
      rows: [
        { scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 250, status: 'Planned' },
        { scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 250, status: 'Cancelled' }
      ],
      totalInvoices: 1,
      totalAmount: 250
    } as PreviewRentScheduleResponse);

    expect(component.cancelledRowDates().has('2026-09-01')).toBeTrue();

    component.save();
    const saveReq = httpMock.expectOne(createUrl);
    expect(saveReq.request.body.scheduleRows).toEqual([
      { scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 250, isManualChanged: false, isCancelled: false },
      { scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 250, isManualChanged: false, isCancelled: true }
    ]);
  }));

  it('relabels a backend-derived "Cancelled" status onto cancelledRowDates at its new date, even when the anchor shifted (spec v46)', fakeAsync(() => {
    previewTwoRows();

    component.deleteRow('2026-09-01');
    expect(component.cancelledRowDates().has('2026-09-01')).toBeTrue();

    // The exact date the backend assigns to a "Cancelled" row no longer matters to the client at all —
    // deciding which fresh row corresponds to the previously-deleted one (by position, across any
    // frequency) is entirely the backend's job now (spec v46). The client only has to recognise the
    // status it's told and file it into the correct local bucket (deletedRowDates vs cancelledRowDates)
    // by zipping the existingRows it just sent against the response, position for position.
    component.form.patchValue({ dueOnDay: 15 });
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-15'] } as CandidateDateResponse);
    httpMock.expectOne(previewUrl).flush({
      rows: [
        { scheduledDate: '2026-08-15', dueDate: '2026-08-15', rent: 100, status: 'Planned' },
        { scheduledDate: '2026-09-15', dueDate: '2026-09-15', rent: 100, status: 'Cancelled' }
      ],
      totalInvoices: 1,
      totalAmount: 100
    } as PreviewRentScheduleResponse);

    expect(component.cancelledRowDates().has('2026-09-01')).toBeFalse();
    expect(component.cancelledRowDates().has('2026-09-15')).toBeTrue();
    expect(component.cancelledRowDates().has('2026-08-15')).toBeFalse();
  }));

  it('keeps a deleted row deleted when an endDate change drops the row count (spec v47)', fakeAsync(() => {
    previewTwoRows();

    component.deleteRow('2026-09-01');
    expect(component.cancelledRowDates().has('2026-09-01')).toBeTrue();

    // Shortening the term removes a row from the tail, so existingRows (2) and response.rows (1) differ
    // in length — the client must NOT gate on equal counts, because the surviving anchor still matches
    // exactly and the backend already derived its status. Gating here was the reported defect.
    component.form.patchValue({ endDate: '2026-09-30' });
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);
    httpMock.expectOne(previewUrl).flush({
      rows: [{ scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 100, status: 'Cancelled' }],
      totalInvoices: 0,
      totalAmount: 0
    } as PreviewRentScheduleResponse);

    expect(component.cancelledRowDates().has('2026-09-01')).toBeTrue();

    component.save();
    const req = httpMock.expectOne(createUrl);
    expect(req.request.body.scheduleRows).toEqual([
      { scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 100, isManualChanged: false, isCancelled: true }
    ]);
  }));

  it('clears cancelledRowDates when the backend returns no "Cancelled" row at all (e.g. a row-count change)', fakeAsync(() => {
    previewTwoRows();

    component.deleteRow('2026-09-01');
    expect(component.cancelledRowDates().has('2026-09-01')).toBeTrue();

    // A term/frequency change that alters the row count has no principled positional correspondence,
    // so the backend reports every row "Planned" (spec v46) — the client must not invent a carry-over.
    component.form.patchValue({ endDate: '2026-11-01' });
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);
    httpMock.expectOne(previewUrl).flush({
      rows: [
        { scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 100, status: 'Planned' },
        { scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 100, status: 'Planned' },
        { scheduledDate: '2026-10-01', dueDate: '2026-10-01', rent: 100, status: 'Planned' }
      ],
      totalInvoices: 3,
      totalAmount: 300
    } as PreviewRentScheduleResponse);

    expect(component.cancelledRowDates().size).toBe(0);
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

    httpMock.expectOne(previewUrl).flush({
      rows: [{ scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 100 }],
      totalInvoices: 1,
      totalAmount: 100
    } as PreviewRentScheduleResponse);

    component.form.patchValue({ deposit: 500 });
    tick(300);
    // Deposit isn't part of the schedule signature, so this re-fires candidateDates but not preview.
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

    component.onAdditionalChargeCreated(charge);

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
    component.onAdditionalChargeCreated(charge);

    component.removeAdditionalCharge(0);

    expect(component.additionalCharges()).toEqual([]);
  });

  it('editAdditionalCharge opens the matching panel (Rent → general, Deposit → deposit-only) with the charge preloaded', () => {
    fixture.detectChanges();

    const rentCharge: AdditionalChargeCreationRequest = {
      alreadyPaid: 0,
      attachedWithRentalInvoice: true,
      isRecurring: false,
      dueDate: '2026-08-15',
      hasNoEndDate: false,
      isGrouped: false,
      isSharedByAll: true,
      items: [{ itemType: 'Late Fee', description: 'Late payment', quantity: 1, rate: 25, amount: 25 }]
    };
    component.onAdditionalChargeCreated(rentCharge);

    const depositCharge: AdditionalChargeCreationRequest = {
      alreadyPaid: 0,
      attachedWithRentalInvoice: false,
      isRecurring: false,
      dueDate: '2026-08-20',
      hasNoEndDate: false,
      isGrouped: false,
      isSharedByAll: true,
      items: [{ itemType: 'PetDeposit', description: 'Pet deposit', quantity: 1, rate: 200, amount: 200 }]
    };
    component.onDepositChargeCreated(depositCharge);

    component.editAdditionalCharge(0);
    expect(component.showAdditionalChargePanel()).toBeTrue();
    expect(component.showDepositChargePanel()).toBeFalse();
    expect(component.editingCharge).toEqual(rentCharge);

    component.closeAdditionalChargePanel();
    expect(component.editingCharge).toBeNull();

    component.editAdditionalCharge(1);
    expect(component.showDepositChargePanel()).toBeTrue();
    expect(component.showAdditionalChargePanel()).toBeFalse();
    expect(component.editingCharge).toEqual(depositCharge);
  });

  it('re-creating an edited charge replaces it in place, preserving its target and index', () => {
    fixture.detectChanges();

    const original: AdditionalChargeCreationRequest = {
      alreadyPaid: 0,
      attachedWithRentalInvoice: true,
      isRecurring: false,
      dueDate: '2026-08-15',
      hasNoEndDate: false,
      isGrouped: false,
      isSharedByAll: true,
      items: [{ itemType: 'Late Fee', description: 'Late payment', quantity: 1, rate: 25, amount: 25 }]
    };
    component.onAdditionalChargeCreated(original);

    component.editAdditionalCharge(0);

    const edited: AdditionalChargeCreationRequest = { ...original, notes: 'Updated', alreadyPaid: 5 };
    component.onAdditionalChargeCreated(edited);

    expect(component.additionalCharges()).toEqual([edited]);
    expect(component.additionalChargeTargets()).toEqual(['Rent']);
    expect(component.editingCharge).toBeNull();
    expect(component.showAdditionalChargePanel()).toBeFalse();
  });

  it('includes the running additional-charges list in the save request', fakeAsync(() => {
    fixture.detectChanges();
    fillValidForm();
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);
    httpMock.expectOne(previewUrl).flush({
      rows: [{ scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 100 }],
      totalInvoices: 1,
      totalAmount: 100
    } as PreviewRentScheduleResponse);

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
    component.onAdditionalChargeCreated(charge);

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
