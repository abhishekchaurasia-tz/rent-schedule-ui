import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';

import { AddTenantsComponent } from './add-tenants.component';
import { RentAgreementDetailResponse, SaveAgreementTenantsResponse } from './rent-agreement.models';

describe('AddTenantsComponent', () => {
  let fixture: ComponentFixture<AddTenantsComponent>;
  let component: AddTenantsComponent;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;

  const agreementId = '8f14e45f-ceea-467e-bd9f-000000000001';
  const detailUrl = `http://localhost:5169/api/v1/rent/agreements/${agreementId}`;
  const tenantsUrl = `${detailUrl}/tenants`;

  const detail = (overrides: Partial<RentAgreementDetailResponse> = {}): RentAgreementDetailResponse => ({
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
    deposit: 400,
    depositDueDate: '2026-01-01',
    depositCollected: false,
    isDepositEditable: true,
    isFirstRentalDueDateEditable: false,
    status: 'draft',
    todayUtc: '2026-01-15',
    scheduleRows: [],
    additionalCharges: [],
    ...overrides
  });

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);

    TestBed.configureTestingModule({
      imports: [AddTenantsComponent, HttpClientTestingModule],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: agreementId }) } }
        },
        { provide: Router, useValue: router }
      ]
    });

    fixture = TestBed.createComponent(AddTenantsComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  const load = (overrides: Partial<RentAgreementDetailResponse> = {}): RentAgreementDetailResponse => {
    const body = detail(overrides);
    httpMock.expectOne(detailUrl).flush(body);
    return body;
  };

  it('should create', () => {
    load();
    expect(component).toBeTruthy();
  });

  it('starts with a single tenant at 100% of rent and deposit', () => {
    load();

    expect(component.tenants.length).toBe(1);
    const first = component.tenants.at(0);
    expect(first.get('rentPercent')!.value).toBe(100);
    expect(first.get('rentAmount')!.value).toBe(1000);
    expect(first.get('depositPercent')!.value).toBe(100);
    expect(first.get('depositAmount')!.value).toBe(400);
  });

  it('re-splits rent and deposit evenly across tenants when one is added', () => {
    load();

    component.addTenant();

    expect(component.tenants.length).toBe(2);
    expect(component.tenants.at(0).get('rentPercent')!.value).toBe(50);
    expect(component.tenants.at(0).get('rentAmount')!.value).toBe(500);
    expect(component.tenants.at(1).get('rentPercent')!.value).toBe(50);
    expect(component.tenants.at(1).get('rentAmount')!.value).toBe(500);
    expect(component.tenants.at(0).get('depositAmount')!.value).toBe(200);
    expect(component.tenants.at(1).get('depositAmount')!.value).toBe(200);
  });

  it('re-splits evenly again once a tenant is removed, and never drops below one row', () => {
    load();
    component.addTenant();
    component.addTenant();

    component.removeTenant(1);

    expect(component.tenants.length).toBe(2);
    expect(component.tenants.at(0).get('rentPercent')!.value).toBe(50);
    expect(component.tenants.at(1).get('rentPercent')!.value).toBe(50);

    component.removeTenant(0);
    component.removeTenant(0);
    expect(component.tenants.length).toBe(1);
  });

  it('recomputes the dollar amount when the percent is hand-edited', () => {
    load();

    const first = component.tenants.at(0);
    first.get('rentPercent')!.setValue(60);
    component.onRentPercentChanged(0);

    expect(first.get('rentAmount')!.value).toBe(600);
  });

  it('recomputes the percent when the dollar amount is hand-edited', () => {
    load();

    const first = component.tenants.at(0);
    first.get('rentAmount')!.setValue(250);
    component.onRentAmountChanged(0);

    expect(first.get('rentPercent')!.value).toBe(25);
  });

  it('sends deposit as 0 with a null percent when the agreement has no deposit', () => {
    load({ deposit: null });

    const first = component.tenants.at(0);
    first.patchValue({ firstName: 'Ada', lastName: 'Lovelace' });

    component.save();

    const req = httpMock.expectOne(tenantsUrl);
    expect(req.request.body.tenants[0].deposit).toBe(0);
    expect(req.request.body.tenants[0].depositPercent).toBeNull();

    req.flush({
      agreementId,
      isGroupInvoice: true,
      partialPaymentAllowed: true,
      tenantIds: [first.get('tenantId')!.value]
    } as SaveAgreementTenantsResponse);
  });

  it('does not call the API when a tenant is missing a required name', () => {
    load();

    component.save();

    expect(() => httpMock.expectNone(tenantsUrl)).not.toThrow();
  });

  it('saves the whole-set replace with the invoicing decisions and reports the echoed tenant ids', () => {
    load();

    const first = component.tenants.at(0);
    first.patchValue({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' });
    component.form.patchValue({ isGroupInvoice: false, partialPaymentAllowed: false });

    component.save();

    const req = httpMock.expectOne(tenantsUrl);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      isGroupInvoice: false,
      partialPaymentAllowed: false,
      tenants: [
        {
          tenantId: first.get('tenantId')!.value,
          rentAmount: 1000,
          rentPercent: 100,
          deposit: 400,
          depositPercent: 100
        }
      ]
    });

    const response: SaveAgreementTenantsResponse = {
      agreementId,
      isGroupInvoice: false,
      partialPaymentAllowed: false,
      tenantIds: [first.get('tenantId')!.value]
    };
    req.flush(response);

    expect(component.saving()).toBeFalse();
    expect(component.saveResult()).toEqual({ tenantIds: response.tenantIds });
  });

  it('navigates back to the edit screen on Cancel', () => {
    load();

    component.cancel();

    expect(router.navigate).toHaveBeenCalledWith(['/rent-agreements', agreementId, 'edit']);
  });
});
