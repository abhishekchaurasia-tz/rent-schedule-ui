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
   * Stages a fee the way the panel's Create does, then commits it.
   *
   * The submit was split into these two halves once the split editor needed a fee total to divide:
   * the drawer's Create stages, and the page's own Save posts (requirements 17-19).
   */
  function stageAndSave(charge: AdditionalChargeCreationRequest = emittedCharge): void {
    component.onChargeCreated(charge);
    component.saveFee();
  }

  /** The panel's emitted charge, re-priced to `total` on its single line. */
  function feeOf(total: number): AdditionalChargeCreationRequest {
    return {
      ...emittedCharge,
      items: [{ ...emittedCharge.items[0], quantity: 1, rate: total, amount: total }]
    };
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

  it('loads the lease and its tenants concurrently and renders the picker only once both answer', () => {
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

  it('renders one row per tenant with a stable stand-in name and the recorded shares', () => {
    loadAgreement();

    const rows = fixture.nativeElement.querySelectorAll('.tenant-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain(tenantA);
    expect(rows[0].textContent).toContain(component.tenantName(tenantA));
    expect(component.tenantName(tenantA)).toBe(component.tenantName(tenantA));
  });

  it('toggles, selects all, and clears the tenant selection', () => {
    loadAgreement();

    component.toggleTenant(tenantA);
    expect(component.isTenantSelected(tenantA)).toBeTrue();
    expect(component.isTenantSelected(tenantB)).toBeFalse();

    component.toggleTenant(tenantA);
    expect(component.isTenantSelected(tenantA)).toBeFalse();

    component.selectAllTenants();
    expect(component.selectedTenantIds().size).toBe(2);

    component.clearTenantSelection();
    expect(component.selectedTenantIds().size).toBe(0);
  });

  it('sends no tenantShares when nobody is ticked — the backend meaning of "shared by all"', () => {
    loadAgreement();

    stageAndSave();

    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);

    // Omitted, not empty. Both read the same on the server, but omission states "not specified"
    // rather than "specified as nobody", and it is what requirement 20 asks for.
    expect(request.request.body.tenantShares).toBeUndefined();
    expect(request.request.body.tenantIds).toBeUndefined();

    request.flush(createdCharge);
  });

  it('omits sharePercent on a row the owner typed as an amount', () => {
    loadAgreement();
    component.toggleTenant(tenantA);
    component.toggleTenant(tenantB);
    component.setShareUnit(tenantA, 'amount');
    component.typeShare(tenantA, '30');
    component.setShareUnit(tenantB, 'amount');
    component.typeShare(tenantB, '20');

    stageAndSave();

    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    const shares = request.request.body.tenantShares as Array<Record<string, unknown>>;

    // Absent, not null: null would be a stated percentage of nothing. The unit the owner typed is
    // what the server stores, and an amount-authored row has no percentage to state.
    expect('sharePercent' in shares[0]).toBeFalse();
    expect(shares[0]['amount']).toBe(30);

    request.flush(createdCharge);
  });

  it('sends sharePercent on a row the owner typed as a percentage', () => {
    loadAgreement();
    component.toggleTenant(tenantA);
    component.toggleTenant(tenantB);
    // The fee is staged BEFORE the percentages are typed, because a percentage is of something:
    // with no fee on the page yet, 70 per cent resolves against zero and the split totals nothing.
    component.onChargeCreated(emittedCharge);

    component.setShareUnit(tenantA, 'percent');
    component.typeShare(tenantA, '70');
    component.setShareUnit(tenantB, 'percent');
    component.typeShare(tenantB, '30');

    component.saveFee();

    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    const shares = request.request.body.tenantShares as Array<Record<string, unknown>>;

    expect(shares[0]['sharePercent']).toBe(70);
    expect(shares[0]['amount']).toBe(35);

    request.flush(createdCharge);
  });

  it('sends amounts that total the fee exactly', () => {
    loadAgreement();
    component.toggleTenant(tenantA);
    component.toggleTenant(tenantB);

    stageAndSave(feeOf(100.01));

    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    const shares = request.request.body.tenantShares as Array<{ amount: number }>;

    // Summed in cents, because 50.01 + 50.00 in floating point is not 100.01.
    const cents = shares.reduce((sum, share) => sum + Math.round(share.amount * 100), 0);
    expect(cents).toBe(10001);

    request.flush(createdCharge);
  });

  it('sends a split naming exactly the ticked tenants, and no tenantIds', () => {
    loadAgreement();
    component.toggleTenant(tenantB);

    stageAndSave();

    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);

    expect(request.request.body.tenantShares).toEqual([
      { tenantId: tenantB, amount: 50 }
    ]);
    expect(request.request.body.tenantIds).toBeUndefined();

    request.flush(createdCharge);
  });

  it('mints an idempotency key, so a replay cannot become a second charge', () => {
    loadAgreement();

    stageAndSave();

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

    stageAndSave();

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

    stageAndSave();

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
    stageAndSave();
    httpMock
      .expectOne(`${baseUrl}/${agreementId}/additional-charges`)
      .flush({ detail: 'The lease is not active.' }, { status: 422, statusText: 'Unprocessable Entity' });
    tick(500);

    httpMock.verify();
    expect(component.submitError()).toBe('The lease is not active.');
  }));

  it('posts the emitted charge fields at the body root and never sends isManualInvoice', () => {
    loadAgreement();

    stageAndSave();

    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.charge).toBeUndefined();
    expect(request.request.body.isManualInvoice).toBeUndefined();
    expect(request.request.body.alreadyPaid).toBe(0);
    expect(request.request.body.items.length).toBe(1);

    request.flush(createdCharge);
  });

  it('stages the fee on the panel\'s Create and sends nothing until the page\'s own Save', () => {
    loadAgreement();
    component.openPanel();
    expect(component.showPanel()).toBeTrue();

    component.onChargeCreated(emittedCharge);

    // The drawer closes and nothing is sent: the split divides the fee's money, so it cannot be
    // typed before that total exists, nor behind a drawer that covers the page.
    expect(component.showPanel()).toBeFalse();
    expect(component.pendingCharge()).not.toBeNull();
    httpMock.expectNone(`${baseUrl}/${agreementId}/additional-charges`);

    component.saveFee();

    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    expect(component.pendingCharge())
      .withContext('staged fee dropped before the response')
      .not.toBeNull();
    expect(component.submitting()).toBeTrue();

    request.flush(createdCharge);
    fixture.detectChanges();

    expect(component.pendingCharge()).toBeNull();
    expect(component.submitting()).toBeFalse();
    expect(component.addedCharges()).toEqual([createdCharge]);
    expect(fixture.nativeElement.textContent).toContain(createdCharge.id);
  });

  it('renders a 422 detail verbatim, keeps the staged fee, and keeps the lease loaded', () => {
    loadAgreement();
    component.openPanel();

    stageAndSave();

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

    expect(component.submitError()).toBe('A deposit item cannot be mixed with rent items.');
    expect(component.submitting()).toBeFalse();
    expect(component.agreement()).not.toBeNull();
    expect(component.addedCharges().length).toBe(0);

    // The authored fee survives the failure. That is the protection the old "the panel stays open"
    // behaviour gave, carried over to where the fee now lives: Edit re-opens the drawer on it rather
    // than making the owner author the whole thing again to hit the same 422.
    expect(component.pendingCharge()).not.toBeNull();

    component.editPendingFee();
    fixture.detectChanges();

    expect(component.showPanel()).toBeTrue();
    // The re-opened drawer runs its own catalog fetch, which is itself the proof it came back.
    httpMock.expectOne((request) => request.url.includes('/line-items')).flush([]);
  });

  it('does not submit twice while a request is already in flight', () => {
    loadAgreement();

    stageAndSave();
    expect(component.submitting()).toBeTrue();

    component.saveFee();

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
    stageAndSave();
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
    stageAndSave();

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
    stageAndSave();

    httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`).flush(createdCharge);
    fixture.detectChanges();

    expect(component.unbilledFor(createdCharge.id)).toEqual([]);
  });

  it('FR101_ASecondChargeBillsFine_LeavesTheFirstChargesDisclosureStanding', () => {
    loadAgreement();

    stageAndSave();
    httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`).flush({
      ...createdCharge,
      unbilledLines: [{ description: 'Reserved bay', amount: 50 }]
    });

    const second = { ...createdCharge, id: '99999999-9999-9999-9999-999999999999' };
    stageAndSave();
    httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`).flush(second);
    fixture.detectChanges();

    // Keyed by charge, not one banner for the latest save: a second fee that bills fine says nothing
    // about the first one, and the owner still has to act on the first.
    expect(component.unbilledFor(createdCharge.id).length).toBe(1);
    expect(component.unbilledFor(second.id)).toEqual([]);
  });
  describe('the even per-renter split (FR 17)', () => {
    /** Sums a split the way the wire does — in cents, so the assertion is exact rather than close. */
    function totalCents(): number {
      return component.tenantShares().reduce((sum, share) => sum + Math.round(share.amount * 100), 0);
    }

    it('divides $300 across three renters as 100.00 each', () => {
      loadAgreement(rosterOf(tenantA, tenantB, tenantC));
      component.selectAllTenants();
      component.onChargeCreated(feeOf(300));

      // The case that separates dividing the money from dividing the percentage: 100/3 = 33.33%,
      // and multiplying that back across three rows gives 99.99 / 99.99 / 100.02.
      expect(component.tenantShares().map((share) => share.amount)).toEqual([100, 100, 100]);
      expect(totalCents()).toBe(30000);

      // The percentage is the derived figure here, and it is derived from the money.
      expect(component.tenantShares().map((share) => share.sharePercent)).toEqual([33.33, 33.33, 33.33]);
      expect(component.tenantShares().some((share) => share.carriesLeftoverCent)).toBeFalse();
    });

    it('spreads four leftover cents one each across six renters', () => {
      loadAgreement(rosterOf(tenantA, tenantB, tenantC, tenantD, tenantE, tenantF));
      component.selectAllTenants();
      component.onChargeCreated(feeOf(100));

      // An implementation that stacks the whole remainder on one row passes the three-renter test
      // above and fails here — it would over-bill the first renter by three cents.
      expect(component.tenantShares().map((share) => share.amount)).toEqual([
        16.67, 16.67, 16.67, 16.67, 16.66, 16.66
      ]);
      expect(totalCents()).toBe(10000);
      expect(component.tenantShares().map((share) => share.carriesLeftoverCent)).toEqual([
        true, true, true, true, false, false
      ]);
    });

    it('re-divides when a renter is unticked', () => {
      loadAgreement(rosterOf(tenantA, tenantB, tenantC));
      component.selectAllTenants();
      component.onChargeCreated(feeOf(300));
      expect(component.tenantShares().length).toBe(3);

      component.toggleTenant(tenantC);

      expect(component.tenantShares().map((share) => share.tenantId)).toEqual([tenantA, tenantB]);
      expect(component.tenantShares().map((share) => share.amount)).toEqual([150, 150]);
      expect(totalCents()).toBe(30000);
    });

    it('shows no split when nobody is ticked — the shared-by-all case', () => {
      loadAgreement(rosterOf(tenantA, tenantB, tenantC));
      component.onChargeCreated(feeOf(300));
      fixture.detectChanges();

      // Not an unfinished state: an empty selection is the instruction "every active renter shares
      // this fee", so there is nothing to divide and nothing to say about it.
      expect(component.selectedCount()).toBe(0);
      expect(component.isSharedByEveryone()).toBeTrue();
      expect(component.tenantShares()).toEqual([]);
      expect(fixture.nativeElement.querySelectorAll('.split-row').length).toBe(0);
      expect(fixture.nativeElement.textContent).toContain('shared by every active');
    });

    it('divides nothing until a fee is staged, and says nothing about it either', () => {
      loadAgreement(rosterOf(tenantA, tenantB, tenantC));
      component.selectAllTenants();
      fixture.detectChanges();

      // Ticking renters before authoring the fee is the ordinary order to work in. There is no total
      // to divide yet, which is "not yet" rather than an error, so no rows and no message.
      expect(component.feeTotal()).toBe(0);
      expect(component.tenantShares()).toEqual([]);
      expect(fixture.nativeElement.querySelectorAll('.split-row').length).toBe(0);
    });

    it('renders a row per ticked renter, each with its amount, percentage and Odd/Even badge', () => {
      loadAgreement(rosterOf(tenantA, tenantB, tenantC));
      component.selectAllTenants();
      component.onChargeCreated(feeOf(100));
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('.split-row');
      expect(rows.length).toBe(3);
      expect(rows[0].textContent).toContain(component.tenantName(tenantA));
      expect(rows[0].textContent).toContain('33.34');
      expect(rows[0].textContent).toContain('Odd');
      expect(rows[1].textContent).toContain('33.33');
      expect(rows[2].textContent).toContain('Even');
    });
  });
  describe('typing over a share (FR 18)', () => {
    /** Three renters on a $300 fee — the figures requirement 18 is written in terms of. */
    function stageThreeWaySplit(total = 300): void {
      loadAgreement(rosterOf(tenantA, tenantB, tenantC));
      component.selectAllTenants();
      component.onChargeCreated(feeOf(total));
    }

    function rowFor(tenantId: string) {
      return component.tenantShares().find((share) => share.tenantId === tenantId)!;
    }

    it('typing an amount leaves the percentage derived and marks the row as amount-authored', () => {
      stageThreeWaySplit();

      component.typeShare(tenantA, '120');

      const typed = rowFor(tenantA);
      expect(typed.authoredUnit).toBe('amount');
      expect(typed.amount).toBe(120);
      // Derived, not typed: 120 of 300 is 40%, and nothing on the row said so.
      expect(typed.sharePercent).toBe(40);
      expect(typed.text).withContext('the owner is echoed back verbatim').toBe('120');

      // What is left of the fee goes to the rows nobody has touched.
      expect(rowFor(tenantB).amount).toBe(90);
      expect(rowFor(tenantC).amount).toBe(90);
    });

    it('typing a percentage marks the row as percent-authored and derives the amount', () => {
      stageThreeWaySplit();

      component.setShareUnit(tenantA, 'percent');
      component.typeShare(tenantA, '66.67');

      const typed = rowFor(tenantA);
      expect(typed.authoredUnit).toBe('percent');
      expect(typed.sharePercent).toBe(66.67);
      // 66.67% of $300 is 200.01, not 200.00. This is the assertion that makes the two units
      // non-interchangeable, and the reason the typed one is recorded rather than inferred.
      expect(typed.amount).toBe(200.01);

      // The remaining $99.99 divides across the untouched rows, odd cent to the first of them.
      expect(rowFor(tenantB).amount).toBe(50);
      expect(rowFor(tenantC).amount).toBe(49.99);
    });

    it('ticking another renter re-divides only the untouched rows', () => {
      loadAgreement(rosterOf(tenantA, tenantB, tenantC));
      component.toggleTenant(tenantA);
      component.toggleTenant(tenantB);
      component.onChargeCreated(feeOf(300));
      expect(component.tenantShares().map((share) => share.amount)).toEqual([150, 150]);

      component.typeShare(tenantA, '200');
      component.toggleTenant(tenantC);

      // An owner who has fixed one number does not expect the page to undo it because they ticked
      // somebody else. Only B and C move, and they share what A has left of the fee.
      expect(rowFor(tenantA).amount).withContext('a typed row was re-divided').toBe(200);
      expect(rowFor(tenantA).authoredUnit).toBe('amount');
      expect(rowFor(tenantB).amount).toBe(50);
      expect(rowFor(tenantC).amount).toBe(50);
    });

    it('switching a row between money and percentage does not move the money', () => {
      stageThreeWaySplit();

      // The row is at its even $100.00 of $300; asking for it as a percentage should say 33.33%,
      // not reset it or re-divide it.
      component.setShareUnit(tenantA, 'percent');

      expect(rowFor(tenantA).authoredUnit).toBe('percent');
      expect(rowFor(tenantA).text).toBe('33.33');
      expect(rowFor(tenantA).amount).toBe(99.99);

      component.setShareUnit(tenantA, 'amount');

      expect(rowFor(tenantA).authoredUnit).toBe('amount');
      expect(rowFor(tenantA).text).toBe('99.99');
      expect(rowFor(tenantA).amount).toBe(99.99);
    });

    it('reports a row the page cannot read, and keeps the text on screen', () => {
      stageThreeWaySplit();

      component.typeShare(tenantA, '12,50');

      expect(rowFor(tenantA).error).toBe('Enter a number.');
      // Kept verbatim: a value the page cannot read has to stay on screen to be corrected.
      expect(rowFor(tenantA).text).toBe('12,50');
      expect(component.shareErrors().length).toBe(1);

      component.typeShare(tenantA, '-40');

      expect(rowFor(tenantA).error).toBe('A share cannot be negative.');
      expect(rowFor(tenantA).text).toBe('-40');

      // Clearing the box to retype it is not an error — the total simply will not add up yet.
      component.typeShare(tenantA, '');

      expect(rowFor(tenantA).error).toBeNull();
      expect(rowFor(tenantA).amount).toBe(0);
    });

    it('hands one row back to the even split without disturbing the others', () => {
      stageThreeWaySplit();
      component.typeShare(tenantA, '200');
      component.typeShare(tenantB, '50');

      component.resetShareRow(tenantA);

      expect(rowFor(tenantA).authoredUnit).toBe('even');
      expect(rowFor(tenantB).authoredUnit).withContext('an untouched row was reset too').toBe('amount');
      expect(rowFor(tenantB).amount).toBe(50);
      // A and C now share the $250 that B has left of the fee.
      expect(rowFor(tenantA).amount).toBe(125);
      expect(rowFor(tenantC).amount).toBe(125);
    });

    it('renders the typed unit, the derived counterpart and a Typed badge', () => {
      stageThreeWaySplit();
      component.typeShare(tenantA, '120');
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('.split-row');
      expect(rows[0].querySelector('.share-input').value).toBe('120');
      expect(rows[0].querySelector('.share-unit').value).toBe('amount');
      expect(rows[0].querySelector('.owes-derived').textContent).toContain('40.00%');
      expect(rows[0].textContent).toContain('Typed');
      expect(rows[1].textContent).toContain('Even');
    });
  });
  describe('refusing a split that does not total the fee (FR 19)', () => {
    function stageThreeWaySplit(total = 300): void {
      loadAgreement(rosterOf(tenantA, tenantB, tenantC));
      component.selectAllTenants();
      component.onChargeCreated(feeOf(total));
    }

    function rowFor(tenantId: string) {
      return component.tenantShares().find((share) => share.tenantId === tenantId)!;
    }

    /** Types a split that comes to $290 of the $300 fee — every row authored, ten dollars missing. */
    function typeShortSplit(): void {
      component.typeShare(tenantA, '100');
      component.typeShare(tenantB, '100');
      component.typeShare(tenantC, '90');
    }

    it('refuses the save and names the difference when the shares total $290 of a $300 fee', () => {
      stageThreeWaySplit();
      typeShortSplit();
      fixture.detectChanges();

      expect(component.splitTotal()).toBe(290);
      expect(component.splitBlocker()).toBe(
        'The shares total $290.00, the fee is $300.00 — $10.00 short.'
      );
      expect(component.canSave()).toBeFalse();

      component.saveFee();

      // Refused before the server is asked — the habit requirement 16 established on this page.
      httpMock.expectNone(`${baseUrl}/${agreementId}/additional-charges`);
      expect(component.submitting()).toBeFalse();
      expect(fixture.nativeElement.textContent).toContain('the fee is $300.00');
    });

    it('keeps every typed row when the total is wrong', () => {
      stageThreeWaySplit();
      typeShortSplit();

      component.saveFee();

      // The assertion that fails if the page "helpfully" corrects the owner. An owner who typed three
      // numbers and got one wrong wants all three still on screen, not two of them rewritten.
      expect(rowFor(tenantA).text).toBe('100');
      expect(rowFor(tenantB).text).toBe('100');
      expect(rowFor(tenantC).text).toBe('90');
      expect(component.tenantShares().map((share) => share.amount)).toEqual([100, 100, 90]);
      expect(component.splitTotal()).toBe(290);
    });

    it('refuses a split that comes to more than the fee, and says so in the other direction', () => {
      stageThreeWaySplit();
      component.typeShare(tenantA, '200');
      component.typeShare(tenantB, '200');
      component.typeShare(tenantC, '200');

      expect(component.splitBlocker()).toBe(
        'The shares total $600.00, the fee is $300.00 — $300.00 over.'
      );
      expect(component.canSave()).toBeFalse();
    });

    it('floors the untouched neighbours of an over-typed row at zero, not below it', () => {
      stageThreeWaySplit();

      component.typeShare(tenantA, '400');

      // A row reading -$50.00 would answer a question nobody asked. The neighbours read $0.00 and the
      // excess turns up in the refusal instead, which is where an owner can act on it.
      expect(rowFor(tenantB).amount).toBe(0);
      expect(rowFor(tenantC).amount).toBe(0);
      expect(component.splitTotal()).toBe(400);
      expect(component.splitBlocker()).toBe(
        'The shares total $400.00, the fee is $300.00 — $100.00 over.'
      );

      component.saveFee();
      httpMock.expectNone(`${baseUrl}/${agreementId}/additional-charges`);
    });

    it('refuses a split holding a row it cannot read, whatever the rest add up to', () => {
      stageThreeWaySplit();
      component.typeShare(tenantA, 'one hundred');

      expect(component.splitBlocker()).toBe('One share cannot be read. Correct it to save this fee.');
      expect(component.canSave()).toBeFalse();

      component.saveFee();
      httpMock.expectNone(`${baseUrl}/${agreementId}/additional-charges`);
    });

    it('reset restores the even split', () => {
      stageThreeWaySplit();
      typeShortSplit();
      expect(component.hasTypedShares()).toBeTrue();

      component.resetSplit();

      expect(component.hasTypedShares()).toBeFalse();
      expect(component.tenantShares().map((share) => share.amount)).toEqual([100, 100, 100]);
      expect(component.tenantShares().every((share) => share.authoredUnit === 'even')).toBeTrue();
      expect(component.splitBlocker()).toBeNull();
      expect(component.canSave()).toBeTrue();
    });

    it('allows the save when the rows total exactly', () => {
      stageThreeWaySplit();
      component.typeShare(tenantA, '200');
      component.typeShare(tenantB, '50');
      component.typeShare(tenantC, '50');

      expect(component.splitBlocker()).toBeNull();
      expect(component.canSave()).toBeTrue();

      component.saveFee();

      httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`).flush(createdCharge);
      expect(component.addedCharges().length).toBe(1);
      expect(component.pendingCharge()).toBeNull();
    });

    it('allows the save with the untouched even split, leftover cent and all', () => {
      stageThreeWaySplit(100);

      // 33.34 / 33.33 / 33.33 totals $100.00 exactly, which is the whole point of dividing the money
      // in cents. A split assembled from 33.33 three times would be refused by its own page.
      expect(component.tenantShares().map((share) => share.amount)).toEqual([33.34, 33.33, 33.33]);
      expect(component.splitTotal()).toBe(100);
      expect(component.splitBlocker()).toBeNull();
    });

    it('has nothing to refuse when the fee is shared by everyone', () => {
      loadAgreement(rosterOf(tenantA, tenantB, tenantC));
      component.onChargeCreated(feeOf(300));

      // No rows, nothing to total: the server divides a shared fee, so there is no split to check.
      expect(component.isSharedByEveryone()).toBeTrue();
      expect(component.splitBlocker()).toBeNull();
      expect(component.canSave()).toBeTrue();
    });

    it('offers the reset only once a row has been typed, and only on a click', () => {
      stageThreeWaySplit();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.split-reset-row')).toBeNull();

      component.typeShare(tenantA, '120');
      fixture.detectChanges();

      const reset = fixture.nativeElement.querySelector('.split-reset-row .link-btn');
      expect(reset).not.toBeNull();

      reset.click();
      fixture.detectChanges();

      expect(component.hasTypedShares()).toBeFalse();
    });
  });
});
