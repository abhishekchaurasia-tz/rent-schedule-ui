import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { RentAgreementCreateComponent } from './rent-agreement-create.component';
import { RentAgreementDetailResponse } from './rent-agreement.models';

/**
 * Edit mode: the same component reached through `rent-agreements/:id/edit`.
 */
describe('RentAgreementCreateComponent (edit mode)', () => {
  let fixture: ComponentFixture<RentAgreementCreateComponent>;
  let component: RentAgreementCreateComponent;
  let httpMock: HttpTestingController;

  const agreementId = '8f14e45f-ceea-467e-bd9f-000000000001';
  const detailUrl = `http://localhost:5169/api/v1/rent/agreements/${agreementId}`;
  const termsUrl = `${detailUrl}/terms`;
  const previewUrl = 'http://localhost:5169/api/v1/rent/schedule/preview';
  const optionsUrl = 'http://localhost:5169/api/v1/rent/schedule/first-rental-due-date-options';

  const detail = (): RentAgreementDetailResponse => ({
    agreementId,
    propertyUnitId: '11111111-1111-1111-1111-111111111111',
    propertyId: '22222222-2222-2222-2222-222222222222',
    propertyOwnerId: '33333333-3333-3333-3333-333333333333',
    leaseTermType: 'fixed',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    fullRent: 1000,
    frequency: 'monthly',
    frequencyConfig: { dueOnDay: 1 },
    firstRentalDueDate: '2026-01-01',
    deposit: 500,
    depositDueDate: '2026-01-01',
    depositCollected: false,
    // Locked by default in this fixture, so the existing tests keep exercising the read-only path; the
    // editable-deposit tests below override it.
    isDepositEditable: false,
    status: 'draft',
    todayUtc: '2026-01-15',
    scheduleRows: [
      { id: 'r1', scheduledDate: '2026-01-01', dueDate: '2026-01-01', rent: 800, isManualChanged: true, status: 'invoiced', isFrozen: true },
      { id: 'r2', scheduledDate: '2026-02-01', dueDate: '2026-02-05', rent: 1000, isManualChanged: false, status: 'planned' }
    ],
    additionalCharges: [
      {
        id: 'c1',
        category: 'Rent',
        notes: 'Parking',
        alreadyPaid: 0,
        attachedWithRentalInvoice: false,
        isRecurring: false,
        dueDate: '2026-01-01',
        hasNoEndDate: false,
        isGrouped: false,
        isSharedByAll: true,
        items: [{ id: 'i1', itemType: 'Parking', description: 'Parking', quantity: 1, rate: 50, amount: 50 }],
        isApplied: false
      }
    ]
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RentAgreementCreateComponent, HttpClientTestingModule],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: agreementId }) } }
        }
      ]
    });

    fixture = TestBed.createComponent(RentAgreementCreateComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /**
   * Creates the component and satisfies the load, leaving it in a loaded edit state.
   *
   * A successful load also refreshes the first-rental-due-date options — the edit screen needs that
   * dropdown populated — so that request is flushed here too.
   */
  const load = (): RentAgreementDetailResponse => {
    fixture.detectChanges();
    const body = detail();
    httpMock.expectOne(detailUrl).flush(body);
    httpMock.match(optionsUrl).forEach((req) => req.flush({ dates: ['2026-01-01'] }));
    return body;
  };

  it('loads the agreement named by the route and enters edit mode', () => {
    fixture.detectChanges();

    const req = httpMock.expectOne(detailUrl);
    expect(req.request.method).toBe('GET');
    req.flush(detail());
    httpMock.match(optionsUrl).forEach((r) => r.flush({ dates: ['2026-01-01'] }));

    expect(component.isEditMode).toBeTrue();
    expect(component.agreementId()).toBe(agreementId);
    expect(component.loadingAgreement()).toBeFalse();
    expect(component.loadError()).toBeNull();
  });

  it('fills the form and the schedule table from the loaded agreement', () => {
    load();

    expect(component.form.get('rent')!.value).toBe(1000);
    expect(component.form.get('frequency')!.value).toBe('monthly');
    expect(component.form.get('dueOnDay')!.value).toBe(1);
    expect(component.previewResult()!.rows.length).toBe(2);
    expect(component.additionalCharges().length).toBe(1);
  });

  it('restores the hand-edited and frozen flags from the server', () => {
    load();

    expect(component.isRowManuallyChanged('2026-01-01')).toBeTrue();
    expect(component.isRowManuallyChanged('2026-02-01')).toBeFalse();
    expect(component.isRowFrozen('2026-01-01')).toBeTrue();
    expect(component.isRowFrozen('2026-02-01')).toBeFalse();
  });

  it('does not re-preview after loading, so the persisted rows survive', fakeAsync(() => {
    load();

    // Patching the form fires valueChanges; without the signature guard this would regenerate the
    // schedule and throw away the loaded rows, their ids and their hand-edited amounts.
    tick(300);

    httpMock.expectNone(previewUrl);
    expect(component.previewResult()!.rows[0].rent).toBe(800);
  }));

  it('saves through PUT .../terms with both collections complete', () => {
    load();

    component.save();

    const req = httpMock.expectOne(termsUrl);
    expect(req.request.method).toBe('PUT');
    // Every row goes, changed or not, and charges carry their ids so the server updates rather
    // than replaces them (decisions D8 / E1 / E2).
    expect(req.request.body.scheduleRows.length).toBe(2);
    expect(req.request.body.additionalCharges[0].id).toBe('c1');
    expect(req.request.body.additionalCharges[0].items[0].id).toBe('i1');
    // Only schedule-affecting terms are sent (decision D3).
    expect(req.request.body.propertyUnitId).toBeUndefined();
    expect(req.request.body.deposit).toBeUndefined();

    req.flush(detail());
    expect(component.saving()).toBeFalse();
  });

  it('sends a deleted row flagged isCancelled: true, carrying its edited due date (spec v45)', () => {
    load();

    component.deleteRow('2026-02-01');
    component.save();

    const req = httpMock.expectOne(termsUrl);
    // The row is still sent — not omitted — so the backend applies any in-flight edit (e.g. a due
    // date changed just before deleting) before cancelling it, instead of discarding it by omission.
    expect(req.request.body.scheduleRows.length).toBe(2);
    const deletedRow = (req.request.body.scheduleRows as { scheduledDate: string; isCancelled?: boolean }[]).find(
      (r) => r.scheduledDate === '2026-02-01'
    );
    expect(deletedRow?.isCancelled).toBeTrue();

    req.flush(detail());
  });

  it('locks the deposit when the server reports isDepositEditable: false, and still saves (spec v12)', () => {
    load();

    // The server said the deposit is locked (activated lease), so the fields are disabled rather than
    // hidden — the saved values stay visible but cannot be silently discarded.
    expect(component.isDepositEditable).toBeFalse();
    expect(component.form.get('deposit')!.disabled).toBeTrue();
    expect(component.form.get('depositDueDate')!.disabled).toBeTrue();
    expect(component.form.get('depositCollected')!.disabled).toBeTrue();

    // The loaded values are still readable even though the controls are disabled.
    expect(component.form.getRawValue().deposit).toBe(500);

    // Regression guard: disabled controls drop out of `form.value`, so the deposit pairing rule must be
    // skipped while locked — otherwise it misfires and blocks every edit save.
    component.save();

    expect(component.saveError()).toBeNull();
    const req = httpMock.expectOne(termsUrl);
    // Omitted entirely, which is what leaves the stored deposit untouched (backend spec v48).
    expect('deposit' in req.request.body).toBeFalse();

    req.flush(detail());
  });

  it('allows editing the deposit and sends it when the server reports isDepositEditable: true (spec v12)', () => {
    fixture.detectChanges();
    httpMock.expectOne(detailUrl).flush({ ...detail(), isDepositEditable: true });
    httpMock.match(optionsUrl).forEach((r) => r.flush({ dates: ['2026-01-01'] }));

    expect(component.isDepositEditable).toBeTrue();
    expect(component.form.get('deposit')!.disabled).toBeFalse();
    expect(component.form.get('depositDueDate')!.disabled).toBeFalse();
    expect(component.form.get('depositCollected')!.disabled).toBeFalse();

    component.form.patchValue({ deposit: 900 });
    component.save();

    expect(component.saveError()).toBeNull();
    const req = httpMock.expectOne(termsUrl);
    expect(req.request.body.deposit).toBe(900);
    expect(req.request.body.depositDueDate).toBe('2026-01-01');
    expect(req.request.body.depositCollected).toBeFalse();

    req.flush(detail());
  });

  it('re-locks the deposit when the save response reports it is no longer editable (spec v12)', () => {
    fixture.detectChanges();
    httpMock.expectOne(detailUrl).flush({ ...detail(), isDepositEditable: true });
    httpMock.match(optionsUrl).forEach((r) => r.flush({ dates: ['2026-01-01'] }));

    expect(component.form.get('deposit')!.disabled).toBeFalse();

    component.save();
    // The lease was activated between load and save, so the response says the deposit is now locked.
    httpMock.expectOne(termsUrl).flush({ ...detail(), isDepositEditable: false });

    expect(component.form.get('deposit')!.disabled).toBeTrue();
  });

  it('renders a cancelled row from the server and sends it flagged isCancelled rather than omitting it (spec v47)', () => {
    fixture.detectChanges();

    const withCancelledRow: RentAgreementDetailResponse = {
      ...detail(),
      scheduleRows: [
        ...detail().scheduleRows,
        { id: 'r3', scheduledDate: '2026-03-01', dueDate: '2026-03-01', rent: 1000, isManualChanged: false, status: 'cancelled' }
      ]
    };
    httpMock.expectOne(detailUrl).flush(withCancelledRow);
    httpMock.match(optionsUrl).forEach((r) => r.flush({ dates: ['2026-01-01'] }));

    // Still rendered — GET no longer omits a cancelled row (v38) — but flagged so the UI can badge it.
    expect(component.previewResult()!.rows.length).toBe(3);
    expect(component.isRowCancelled('2026-03-01')).toBeTrue();
    // The cancelled row's amount does not inflate the schedule summary.
    expect(component.previewResult()!.totalInvoices).toBe(2);

    component.save();

    const req = httpMock.expectOne(termsUrl);
    // EVERY row is sent now, including the still-cancelled one, flagged isCancelled: true. The backend
    // treats that flag as decisive whatever the stored status (spec v47), so the row stays cancelled —
    // it no longer has to be omitted to avoid being restored, which is what let the client drop its
    // "which kind of cancellation is this" bookkeeping entirely.
    expect(req.request.body.scheduleRows.length).toBe(3);
    expect(
      (req.request.body.scheduleRows as { scheduledDate: string; isCancelled: boolean }[]).find(
        (r) => r.scheduledDate === '2026-03-01'
      )?.isCancelled
    ).toBeTrue();

    req.flush(detail());
  });

  it('trusts the backend-derived status for a server-confirmed cancelled row after dueOnDay shifts every anchor (spec v46)', fakeAsync(() => {
    fixture.detectChanges();

    const withCancelledRow: RentAgreementDetailResponse = {
      ...detail(),
      scheduleRows: [
        ...detail().scheduleRows,
        { id: 'r3', scheduledDate: '2026-03-01', dueDate: '2026-03-01', rent: 1000, isManualChanged: false, status: 'cancelled' }
      ]
    };
    httpMock.expectOne(detailUrl).flush(withCancelledRow);
    httpMock.match(optionsUrl).forEach((r) => r.flush({ dates: ['2026-01-01'] }));

    expect(component.isRowCancelled('2026-03-01')).toBeTrue();

    // Changing "Due on the day" shifts every row's scheduledDate too, without changing the row count.
    // Deciding whether the cancelled row still corresponds to a fresh row is now the backend's job
    // (spec v46) — the client sends its current known state as existingRows and trusts whatever
    // status comes back, rather than re-deciding the correlation itself.
    component.form.patchValue({ dueOnDay: 15 });
    tick(300);
    httpMock.match(optionsUrl).forEach((r) => r.flush({ dates: ['2026-01-15'] }));

    const previewReq = httpMock.expectOne(previewUrl);
    expect(
      (previewReq.request.body.existingRows as { scheduledDate: string; status: string }[]).find(
        (r) => r.scheduledDate === '2026-03-01'
      )?.status
    ).toBe('Cancelled');

    previewReq.flush({
      rows: [
        { scheduledDate: '2026-01-15', dueDate: '2026-01-15', rent: 800, status: 'Planned' },
        { scheduledDate: '2026-02-15', dueDate: '2026-02-15', rent: 1000, status: 'Planned' },
        { scheduledDate: '2026-03-15', dueDate: '2026-03-15', rent: 1000, status: 'Cancelled' }
      ],
      totalInvoices: 2,
      totalAmount: 1800
    });

    expect(component.isRowCancelled('2026-03-01')).toBeFalse();
    expect(component.isRowCancelled('2026-03-15')).toBeTrue();

    component.save();

    const req = httpMock.expectOne(termsUrl);
    // The cancelled row is sent flagged, at its new anchor — the flag keeps it cancelled, so it is no
    // longer at risk of the silent restore that omission used to guard against (spec v47).
    expect(req.request.body.scheduleRows.length).toBe(3);
    expect(
      (req.request.body.scheduleRows as { scheduledDate: string; isCancelled: boolean }[]).find(
        (r) => r.scheduledDate === '2026-03-15'
      )?.isCancelled
    ).toBeTrue();

    req.flush(detail());
  }));

  it('restores a cancelled row on request, resubmitting it so the backend reactivates it (spec v42)', () => {
    fixture.detectChanges();

    const withCancelledRow: RentAgreementDetailResponse = {
      ...detail(),
      scheduleRows: [
        ...detail().scheduleRows,
        { id: 'r3', scheduledDate: '2026-03-01', dueDate: '2026-03-01', rent: 1000, isManualChanged: false, status: 'cancelled' }
      ]
    };
    httpMock.expectOne(detailUrl).flush(withCancelledRow);
    httpMock.match(optionsUrl).forEach((r) => r.flush({ dates: ['2026-01-01'] }));

    expect(component.isRowCancelled('2026-03-01')).toBeTrue();

    component.restoreCancelledRow('2026-03-01');

    expect(component.isRowCancelled('2026-03-01')).toBeFalse();

    component.save();

    const req = httpMock.expectOne(termsUrl);
    // The restored row is now resubmitted like any other row — its mere presence is the restore
    // signal the backend acts on (spec v42), not a separate flag.
    expect(req.request.body.scheduleRows.length).toBe(3);
    expect(
      (req.request.body.scheduleRows as { scheduledDate: string }[]).some((r) => r.scheduledDate === '2026-03-01')
    ).toBeTrue();

    req.flush(detail());
  });

  it('reports a missing agreement without leaving the page in a loading state', () => {
    fixture.detectChanges();

    httpMock.expectOne(detailUrl).flush('not found', { status: 404, statusText: 'Not Found' });

    expect(component.loadError()).toContain(agreementId);
    expect(component.loadingAgreement()).toBeFalse();
    httpMock.expectNone(optionsUrl);
  });
});
