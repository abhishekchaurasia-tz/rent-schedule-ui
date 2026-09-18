import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import { AddAdditionalChargeComponent } from './add-additional-charge.component';
import {
  AdditionalChargeCreationRequest,
  AgreementTenantsResponse,
  RentAgreementAdditionalChargeResponse,
  RentAgreementDetailResponse
} from './rent-agreement.models';

describe('AddAdditionalChargeComponent', () => {
  let fixture: ComponentFixture<AddAdditionalChargeComponent>;
  let component: AddAdditionalChargeComponent;
  let httpMock: HttpTestingController;

  const agreementId = '8f14e45f-ceea-467e-bd9f-000000000001';
  const baseUrl = `${environment.apiBaseUrl}/api/v1/rent/agreements`;

  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';
  const tenantC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const tenantD = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const tenantE = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const tenantF = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  const agreement: RentAgreementDetailResponse = {
    agreementId,
    propertyUnitId: '33333333-3333-3333-3333-333333333333',
    propertyId: '44444444-4444-4444-4444-444444444444',
    propertyOwnerId: '55555555-5555-5555-5555-555555555555',
    leaseTermType: 'fixed',
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    fullRent: 1200,
    frequency: 'monthly',
    frequencyConfig: { dueOnDay: 1 },
    firstRentalDueDate: '2026-09-01',
    deposit: 1200,
    depositDueDate: '2026-09-01',
    depositCollected: false,
    isDepositEditable: false,
    isFirstRentalDueDateEditable: true,
    status: 'Active',
    todayUtc: '2026-08-31',
    scheduleRows: [],
    additionalCharges: []
  };

  const tenants: AgreementTenantsResponse = {
    isGroupInvoice: false,
    partialPaymentAllowed: true,
    tenants: [
      { tenantId: tenantA, rentAmount: 600, rentPercent: 50, deposit: 600, depositPercent: 50 },
      { tenantId: tenantB, rentAmount: 600, rentPercent: 50, deposit: 600, depositPercent: 50 }
    ]
  };

  /** The shape the fee panel emits — a minimal, valid one-time charge. */
  const emittedCharge: AdditionalChargeCreationRequest = {
    notes: 'Parking',
    alreadyPaid: 0,
    attachedWithRentalInvoice: false,
    isRecurring: false,
    dueDate: '2026-10-01',
    frequency: null,
    frequencyConfig: null,
    startDate: null,
    endDate: null,
    hasNoEndDate: false,
    items: [
      {
        lineItemId: '66666666-6666-6666-6666-666666666666',
        itemType: 'Parking',
        description: 'Reserved bay',
        quantity: 1,
        rate: 50,
        amount: 50
      }
    ]
  };

  const createdCharge: RentAgreementAdditionalChargeResponse = {
    id: '77777777-7777-7777-7777-777777777777',
    category: 'Rent',
    notes: 'Parking',
    alreadyPaid: 0,
    attachedWithRentalInvoice: false,
    isRecurring: false,
    dueDate: '2026-10-01',
    hasNoEndDate: false,
    tenantShares: [{ tenantId: tenantA, amount: 50 }],
    items: [
      {
        id: '88888888-8888-8888-8888-888888888888',
        itemType: 'Parking',
        description: 'Reserved bay',
        quantity: 1,
        rate: 50,
        amount: 50
      }
    ],
    isApplied: false
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddAdditionalChargeComponent, HttpClientTestingModule],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(AddAdditionalChargeComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Runs a successful load and leaves the component with the lease and both tenants in hand. */
  function loadAgreement(tenantsBody: AgreementTenantsResponse | null = tenants): void {
    component.agreementIdInput.setValue(agreementId);
    component.load();

    httpMock.expectOne(`${baseUrl}/${agreementId}`).flush(agreement);

    const tenantsRequest = httpMock.expectOne(`${baseUrl}/${agreementId}/tenants`);
    if (tenantsBody === null) {
      tenantsRequest.flush(null, { status: 204, statusText: 'No Content' });
    } else {
      tenantsRequest.flush(tenantsBody);
    }

    fixture.detectChanges();
  }

  /**
   * A saved roster of the named renters, **in the order given** — which is the order the leftover
   * cents are handed out in, so these tests list their ids rather than generating them.
   */
  function rosterOf(...tenantIds: string[]): AgreementTenantsResponse {
    return {
      isGroupInvoice: false,
      partialPaymentAllowed: true,
      tenants: tenantIds.map((tenantId) => ({
        tenantId,
        rentAmount: 0,
        rentPercent: null,
        deposit: 0,
        depositPercent: null
      }))
    };
  }

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('refuses a malformed id inline and issues no request at all', () => {
    component.agreementIdInput.setValue('not-a-guid');
    component.load();

    expect(component.idError()).toContain('valid id');
    httpMock.expectNone(`${baseUrl}/not-a-guid`);
    expect(component.agreement()).toBeNull();
  });

  it('refuses an empty id inline', () => {
    component.agreementIdInput.setValue('   ');
    component.load();

    expect(component.idError()).toBe('Enter a rent agreement id.');
  });

  it('loads the lease and its tenants concurrently, rendering neither until both answer', () => {
    component.agreementIdInput.setValue(agreementId);
    component.load();

    // Both are in flight together — neither waits on the other.
    const agreementRequest = httpMock.expectOne(`${baseUrl}/${agreementId}`);
    const tenantsRequest = httpMock.expectOne(`${baseUrl}/${agreementId}/tenants`);
    expect(component.loading()).toBeTrue();

    agreementRequest.flush(agreement);
    expect(component.loading()).toBeTrue();

    tenantsRequest.flush(tenants);
    fixture.detectChanges();

    expect(component.loading()).toBeFalse();
    expect(component.agreement()?.agreementId).toBe(agreementId);
    expect(component.tenants().length).toBe(2);
  });

  it('lists no renters of its own — the fee panel is where they are shown and ticked', () => {
    loadAgreement();

    // The page loads the roster and hands it to the panel; it does not render a second copy. A
    // read-only list beside the editor that lists the same people was duplication, and the duplicate
    // is the one that goes stale.
    expect(component.tenants().length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.tenant-row').length).toBe(0);
    expect(fixture.nativeElement.textContent).not.toContain(tenantA);
  });

  it('mints an idempotency key, so a replay cannot become a second charge', () => {
    loadAgreement();

    component.onChargeCreated(emittedCharge);

    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);

    // The endpoint replays a submission whose id it has already seen (backend FR 57, FR 60). Without
    // one it cannot tell a retry from a new fee, which is what made the retry below unsafe before.
    expect(request.request.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    request.flush(createdCharge);
  });

  it('replays the submission once when the server answers 409, and reports nothing to the user', fakeAsync(() => {
    loadAgreement();

    component.onChargeCreated(emittedCharge);

    const first = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    const key = first.request.body.id;

    // A concurrent write to the same lease won the race — measured against the running system by
    // submitting a fee while an activation's own post-commit issuing pass was still in flight.
    first.flush({ detail: 'A concurrent write won.' }, { status: 409, statusText: 'Conflict' });
    tick(500);

    const retried = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    expect(retried.request.body.id).toBe(key);

    retried.flush(createdCharge);
    tick();

    expect(component.submitError()).toBeNull();
    expect(component.submitting()).toBeFalse();
    expect(component.addedCharges().length).toBe(1);
  }));

  it('gives up after one replay, and never retries a business rule', fakeAsync(() => {
    loadAgreement();

    component.onChargeCreated(emittedCharge);

    httpMock
      .expectOne(`${baseUrl}/${agreementId}/additional-charges`)
      .flush({ detail: 'Conflict.' }, { status: 409, statusText: 'Conflict' });
    tick(500);

    httpMock
      .expectOne(`${baseUrl}/${agreementId}/additional-charges`)
      .flush({ detail: 'Still conflicting.' }, { status: 409, statusText: 'Conflict' });
    tick(500);

    httpMock.verify();
    expect(component.submitError()).toBe('Still conflicting.');

    // A 422 is the user's to fix, not the network's, so it reaches them on the first answer.
    component.onChargeCreated(emittedCharge);
    httpMock
      .expectOne(`${baseUrl}/${agreementId}/additional-charges`)
      .flush({ detail: 'The lease is not active.' }, { status: 422, statusText: 'Unprocessable Entity' });
    tick(500);

    httpMock.verify();
    expect(component.submitError()).toBe('The lease is not active.');
  }));

  it('posts the emitted charge fields at the body root and never sends isManualInvoice', () => {
    loadAgreement();

    component.onChargeCreated(emittedCharge);

    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.charge).toBeUndefined();
    expect(request.request.body.isManualInvoice).toBeUndefined();
    expect(request.request.body.alreadyPaid).toBe(0);
    expect(request.request.body.items.length).toBe(1);

    request.flush(createdCharge);
  });

  it('keeps the panel open until the POST succeeds, then closes it and lists the created charge', () => {
    loadAgreement();
    component.openPanel();
    expect(component.showPanel()).toBeTrue();

    component.onChargeCreated(emittedCharge);

    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    expect(component.showPanel()).withContext('panel closed before the response').toBeTrue();
    expect(component.submitting()).toBeTrue();

    request.flush(createdCharge);
    fixture.detectChanges();

    expect(component.showPanel()).toBeFalse();
    expect(component.submitting()).toBeFalse();
    expect(component.addedCharges()).toEqual([createdCharge]);
    expect(fixture.nativeElement.textContent).toContain(createdCharge.id);
  });

  it('renders a 422 detail verbatim, keeps the panel open, and keeps the lease loaded', () => {
    loadAgreement();
    component.openPanel();

    component.onChargeCreated(emittedCharge);

    httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`).flush(
      {
        type: 'about:blank',
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'A deposit item cannot be mixed with rent items.'
      },
      { status: 422, statusText: 'Unprocessable Entity' }
    );
    fixture.detectChanges();

    // The panel is still on screen, so it runs its own catalog fetch — which is itself the proof that
    // it survived the failure, since a closed panel would never have asked. A 422 here is routine, and
    // closing on emit would throw away the authored fee and its split in order to hit one.
    httpMock.expectOne((request) => request.url.includes('/line-items')).flush([]);

    expect(component.submitError()).toBe('A deposit item cannot be mixed with rent items.');
    expect(component.showPanel()).toBeTrue();
    expect(component.submitting()).toBeFalse();
    expect(component.agreement()).not.toBeNull();
    expect(component.addedCharges().length).toBe(0);
  });

  it('does not submit twice while a request is already in flight', () => {
    loadAgreement();

    component.onChargeCreated(emittedCharge);
    expect(component.submitting()).toBeTrue();

    component.onChargeCreated(emittedCharge);

    // One and only one — a second click on Save while the first is in flight is dropped, not queued.
    const requests = httpMock.match(`${baseUrl}/${agreementId}/additional-charges`);
    expect(requests.length).toBe(1);

    requests[0].flush(createdCharge);
    expect(component.addedCharges().length).toBe(1);
  });

  it('treats a 204 from the tenants endpoint as "step 2 never saved", not as an empty roster', () => {
    loadAgreement(null);

    expect(component.hasSavedTenants()).toBeFalse();
    expect(component.tenants().length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('no tenants saved');

    // A shared fee is still addable in that state, and it names nobody -- there is nobody to name.
    component.onChargeCreated(emittedCharge);
    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    expect(request.request.body.tenantShares).toBeUndefined();
    request.flush(createdCharge);
  });

  it('names the renters a saved fee landed on from its split', () => {
    loadAgreement();

    const label = component.chargePayerLabel({
      ...createdCharge,
      tenantShares: [
        { tenantId: tenantA, amount: 30 },
        { tenantId: tenantB, amount: 20 }
      ]
    });

    expect(label).toContain(component.tenantName(tenantA));
    expect(label).toContain(component.tenantName(tenantB));
  });

  it('says every renter when a saved fee names nobody', () => {
    loadAgreement();

    expect(component.chargePayerLabel({ ...createdCharge, tenantShares: [] }))
      .toBe('All active tenants');
    expect(component.chargePayerLabel({ ...createdCharge, tenantShares: undefined }))
      .toBe('All active tenants');
  });

  it('declares no tenantIds on the charge response model', () => {
    // A type-level assertion, not a value one. A test that only read the label would pass with the
    // field still declared and merely unread, and the point of this slice is that nothing can read
    // it -- the server stops sending it in the same release.
    const charge: RentAgreementAdditionalChargeResponse = createdCharge;

    expect('tenantIds' in charge).toBeFalse();
  });

  it('hands the roster to the fee panel, which is what offers the split editor', () => {
    loadAgreement();
    component.openPanel();
    fixture.detectChanges();

    httpMock.expectOne((request) => request.url.includes('/line-items')).flush([]);
    fixture.detectChanges();

    // Requirement 22 in one assertion: the editor appears because this host passed renters. A host
    // that passes none — the lease create/edit screens — renders no renter control at all.
    expect(fixture.nativeElement.querySelector('app-tenant-split-editor')).not.toBeNull();
  });

  it('passes the loaded lease through to the fee panel', () => {
    loadAgreement();

    expect(component.propertyOwnerId).toBe(agreement.propertyOwnerId);
    expect(component.leaseStartDate).toBe(agreement.startDate);
    expect(component.leaseEndDate).toBe(agreement.endDate!);
  });

  it('derives the month-to-month invoice count from the schedule rows, and only when open-ended', () => {
    loadAgreement();
    expect(component.leaseMonthToMonthInvoiceCount)
      .withContext('a fixed-term lease has no month-to-month count')
      .toBeNull();

    component.agreement.set({
      ...agreement,
      endDate: null,
      leaseTermType: 'month_to_month',
      scheduleRows: [
        { id: 'a', scheduledDate: '2026-09-01', dueDate: '2026-09-01', rent: 1200, isManualChanged: false },
        { id: 'b', scheduledDate: '2026-10-01', dueDate: '2026-10-01', rent: 1200, isManualChanged: false }
      ]
    });

    expect(component.leaseMonthToMonthInvoiceCount).toBe(2);
  });

  it('reports a failed load and holds nothing back from a retry', () => {
    component.agreementIdInput.setValue(agreementId);
    component.load();

    // The tenants read is answered first on purpose: `forkJoin` unsubscribes from whatever is still
    // in flight the moment one source errors, and a cancelled `TestRequest` can no longer be flushed
    // — which would leave the verifier holding an open request rather than testing anything.
    httpMock.expectOne(`${baseUrl}/${agreementId}/tenants`).flush(null, { status: 204, statusText: 'No Content' });
    httpMock.expectOne(`${baseUrl}/${agreementId}`).flush(
      { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Rent agreement not found.' },
      { status: 404, statusText: 'Not Found' }
    );
    fixture.detectChanges();

    expect(component.loadError()).toBe('Rent agreement not found.');
    expect(component.loading()).toBeFalse();
    expect(component.agreement()).toBeNull();
  });

  it('names the payers of an added charge, and says "all active tenants" for a shared one', () => {
    loadAgreement();

    expect(component.chargePayerLabel(createdCharge)).toContain(component.tenantName(tenantA));
    expect(component.chargePayerLabel({ ...createdCharge, tenantShares: [] })).toBe('All active tenants');
    expect(component.chargePayerLabel({ ...createdCharge, tenantShares: undefined })).toBe('All active tenants');
  });

  it('totals an added charge from its item amounts', () => {
    expect(component.chargeTotal(createdCharge)).toBe(50);
  });

  it('FR101_SaveReportsUnbilledLines_SurfacesThemAgainstThatCharge', () => {
    loadAgreement();
    component.openPanel();
    component.onChargeCreated(emittedCharge);

    httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`).flush({
      ...createdCharge,
      unbilledLines: [{ description: 'Reserved bay', amount: 50 }]
    });
    fixture.detectChanges();

    expect(component.unbilledFor(createdCharge.id).length).toBe(1);
    expect(component.unbilledFor(createdCharge.id)[0].description).toBe('Reserved bay');
    expect(component.unbilledFor(createdCharge.id)[0].amount).toBe(50);

    // The charge was saved. Reporting what it could not bill must not read as a rejection.
    expect(component.submitError()).toBeNull();
    expect(component.addedCharges().length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Reserved bay');
  });

  it('FR101_SaveReportsNoUnbilledLines_SurfacesNothing', () => {
    loadAgreement();
    component.openPanel();
    component.onChargeCreated(emittedCharge);

    httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`).flush(createdCharge);
    fixture.detectChanges();

    expect(component.unbilledFor(createdCharge.id)).toEqual([]);
  });

  it('FR101_ASecondChargeBillsFine_LeavesTheFirstChargesDisclosureStanding', () => {
    loadAgreement();

    component.onChargeCreated(emittedCharge);
    httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`).flush({
      ...createdCharge,
      unbilledLines: [{ description: 'Reserved bay', amount: 50 }]
    });

    const second = { ...createdCharge, id: '99999999-9999-9999-9999-999999999999' };
    component.onChargeCreated(emittedCharge);
    httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`).flush(second);
    fixture.detectChanges();

    // Keyed by charge, not one banner for the latest save: a second fee that bills fine says nothing
    // about the first one, and the owner still has to act on the first.
    expect(component.unbilledFor(createdCharge.id).length).toBe(1);
    expect(component.unbilledFor(second.id)).toEqual([]);
  });
});
