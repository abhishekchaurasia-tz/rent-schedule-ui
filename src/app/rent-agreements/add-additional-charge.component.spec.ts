import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
    tenantIds: [tenantA],
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

  it('sends tenantIds: [] when nobody is ticked — the backend meaning of "shared by all"', () => {
    loadAgreement();

    component.onChargeCreated(emittedCharge);

    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    expect(request.request.body.tenantIds).toEqual([]);

    request.flush(createdCharge);
  });

  it('sends exactly the ticked tenants when some are selected', () => {
    loadAgreement();
    component.toggleTenant(tenantB);

    component.onChargeCreated(emittedCharge);

    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    expect(request.request.body.tenantIds).toEqual([tenantB]);

    request.flush(createdCharge);
  });

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
    // it survived the failure, since a closed panel would never have asked.
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
    component.onChargeCreated(emittedCharge);

    // One and only one — expectOne throws if a second matching request exists.
    httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`).flush(createdCharge);
  });

  it('treats a 204 from the tenants endpoint as "step 2 never saved", not as an empty roster', () => {
    loadAgreement(null);

    expect(component.hasSavedTenants()).toBeFalse();
    expect(component.tenants().length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('no tenants saved');

    // A shared fee is still addable in that state.
    component.onChargeCreated(emittedCharge);
    const request = httpMock.expectOne(`${baseUrl}/${agreementId}/additional-charges`);
    expect(request.request.body.tenantIds).toEqual([]);
    request.flush(createdCharge);
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
    expect(component.chargePayerLabel({ ...createdCharge, tenantIds: [] })).toBe('All active tenants');
    expect(component.chargePayerLabel({ ...createdCharge, tenantIds: undefined })).toBe('All active tenants');
  });

  it('totals an added charge from its item amounts', () => {
    expect(component.chargeTotal(createdCharge)).toBe(50);
  });
});
