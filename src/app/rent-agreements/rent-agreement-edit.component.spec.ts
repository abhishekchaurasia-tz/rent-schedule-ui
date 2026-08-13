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

  it('omits a deleted row from the save, which is how a removal is expressed', () => {
    load();

    component.deleteRow('2026-02-01');
    component.save();

    const req = httpMock.expectOne(termsUrl);
    expect(req.request.body.scheduleRows.length).toBe(1);
    expect(req.request.body.scheduleRows[0].scheduledDate).toBe('2026-01-01');

    req.flush(detail());
  });

  it('renders a cancelled row from the server as display-only and omits it from the save (spec v38)', () => {
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
    // Resubmitting a cancelled row's anchor would create a brand-new row server-side rather than
    // restore it (ActiveRowsByAnchor no longer treats it as stored) — so it must never be resent.
    expect(req.request.body.scheduleRows.length).toBe(2);
    expect(
      (req.request.body.scheduleRows as { scheduledDate: string }[]).some((r) => r.scheduledDate === '2026-03-01')
    ).toBeFalse();

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
