import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';

import { AddTenantsComponent } from './add-tenants.component';
import {
  AgreementTenantsResponse,
  RentAgreementDetailResponse,
  SaveAgreementTenantsResponse
} from './rent-agreement.models';

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

  /**
   * Opens the screen the way a lease with no saved step 2 does: the lease loads, and the tenants read
   * answers `204 No Content`, which Angular surfaces as a null body.
   */
  const load = (overrides: Partial<RentAgreementDetailResponse> = {}): RentAgreementDetailResponse => {
    const body = detail(overrides);
    httpMock.expectOne(detailUrl).flush(body);
    httpMock.expectOne(tenantsUrl).flush(null, { status: 204, statusText: 'No Content' });
    return body;
  };

  /** Opens the screen on a lease whose step 2 *was* saved, so the form is pre-filled from it. */
  const loadSaved = (
    saved: AgreementTenantsResponse,
    overrides: Partial<RentAgreementDetailResponse> = {}
  ): RentAgreementDetailResponse => {
    const body = detail(overrides);
    httpMock.expectOne(detailUrl).flush(body);
    httpMock.expectOne(tenantsUrl).flush(saved);
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

    // Rows arrive pre-filled, so the name has to be cleared to reach this rule at all — which is the
    // point: the only way to hit it now is for someone to empty the field deliberately.
    component.tenants.at(0).patchValue({ firstName: '', lastName: '' });

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

  describe('when step 2 was never saved (204)', () => {
    it('stays in create mode with a single pre-filled tenant', () => {
      load();

      expect(component.mode()).toBe('create');
      expect(component.savedTenants()).toBeNull();
      expect(component.tenants.length).toBe(1);
    });

    it('pre-fills a placeholder person, so the row is saveable without typing', () => {
      load();

      const row = component.tenants.at(0);
      expect(row.get('firstName')!.value).toBeTruthy();
      expect(row.get('lastName')!.value).toBeTruthy();
      expect(row.get('email')!.value).toContain('@');
      expect(row.valid).withContext('a fresh row must satisfy the required-name rule').toBeTrue();
    });

    it('gives each added row its own person', () => {
      load();
      component.addTenant();

      const first = component.tenants.at(0);
      const second = component.tenants.at(1);

      expect(second.get('firstName')!.value).toBeTruthy();
      // Derived from each row's own freshly minted id, so the two rows are independent people.
      expect(second.get('email')!.value).not.toBe(first.get('email')!.value);
    });
  });

  describe('when step 2 was saved', () => {
    const first = 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
    const second = 'bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb';

    const saved = (overrides: Partial<AgreementTenantsResponse> = {}): AgreementTenantsResponse => ({
      isGroupInvoice: false,
      partialPaymentAllowed: false,
      tenants: [
        { tenantId: first, rentAmount: 700, rentPercent: 70, deposit: 280, depositPercent: 70 },
        { tenantId: second, rentAmount: 300, rentPercent: 30, deposit: 120, depositPercent: 30 }
      ],
      ...overrides
    });

    it('switches to edit mode and pre-fills a row per saved tenant', () => {
      loadSaved(saved());

      expect(component.mode()).toBe('edit');
      expect(component.tenants.length).toBe(2);
    });

    it('keeps each saved tenant id exactly as the server sent it', () => {
      loadSaved(saved());

      // The whole point: a re-save must reconcile against the same tenants, so these ids may never be
      // re-minted. A regenerated id would deactivate the real tenant and insert a stranger.
      expect(component.tenantIdAt(0)).toBe(first);
      expect(component.tenantIdAt(1)).toBe(second);
    });

    it('pre-fills the saved shares rather than an even split', () => {
      loadSaved(saved());

      expect(component.tenants.at(0).get('rentPercent')!.value).toBe(70);
      expect(component.tenants.at(0).get('rentAmount')!.value).toBe(700);
      expect(component.tenants.at(1).get('rentPercent')!.value).toBe(30);
      expect(component.tenants.at(1).get('depositAmount')!.value).toBe(120);
    });

    it('pre-fills both invoicing decisions', () => {
      loadSaved(saved({ isGroupInvoice: true, partialPaymentAllowed: true }));

      expect(component.form.get('isGroupInvoice')!.value).toBeTrue();
      expect(component.form.get('partialPaymentAllowed')!.value).toBeTrue();
    });

    it('gives every row a placeholder identity, since the endpoint carries no personal fields', () => {
      loadSaved(saved());

      const row = component.tenants.at(0);
      expect(row.get('firstName')!.value).toBeTruthy();
      expect(row.get('lastName')!.value).toBeTruthy();
      expect(row.get('email')!.value).toContain('@');
    });

    it('derives that identity from the tenant id, so a reload shows the same made-up person', () => {
      loadSaved(saved());
      const firstNameOnFirstLoad = component.tenants.at(0).get('firstName')!.value;
      const emailOnFirstLoad = component.tenants.at(0).get('email')!.value;

      // A second component over the same saved set — what re-opening the screen does.
      const second = TestBed.createComponent(AddTenantsComponent);
      httpMock.expectOne(detailUrl).flush(detail());
      httpMock.expectOne(tenantsUrl).flush(saved());

      expect(second.componentInstance.tenants.at(0).get('firstName')!.value).toBe(firstNameOnFirstLoad);
      expect(second.componentInstance.tenants.at(0).get('email')!.value).toBe(emailOnFirstLoad);
    });

    it('re-opens on the dollar input mode when a share was entered as a fixed amount', () => {
      loadSaved(
        saved({
          tenants: [{ tenantId: first, rentAmount: 650, rentPercent: null, deposit: 400, depositPercent: 100 }]
        })
      );

      expect(component.rentSplitUnit()).toBe('dollar');
      expect(component.depositSplitUnit()).toBe('percent');
      // The greyed-out half is still filled in, derived from the lease's full rent.
      expect(component.tenants.at(0).get('rentAmount')!.value).toBe(650);
      expect(component.tenants.at(0).get('rentPercent')!.value).toBe(65);
    });

    it('does not re-split the saved shares when a tenant is added', () => {
      loadSaved(saved());

      component.addTenant();

      expect(component.tenants.length).toBe(3);
      expect(component.tenants.at(0).get('rentPercent')!.value).toBe(70);
      expect(component.tenants.at(1).get('rentPercent')!.value).toBe(30);
      expect(component.tenants.at(2).get('rentPercent')!.value).toBe(0);
    });

    it('renders the pre-filled values in the DOM, not just in the form model', () => {
      // The two reads are flushed with a render **between** them, which is what a browser does and
      // what the bug needs: the lease arrives first and the blank create-mode row is painted, and only
      // then does the tenants read come back and replace the controls underneath it. Flushing both
      // back-to-back (as the other tests do) never paints that intermediate row, so the stale binding
      // never arises and this would pass with the bug still in place.
      httpMock.expectOne(detailUrl).flush(detail());
      fixture.detectChanges();

      httpMock.expectOne(tenantsUrl).flush(saved());
      fixture.detectChanges();

      // The regression this pins: with `track $index` the first row kept its original FormGroup
      // binding after the prefill cleared the array, so the model held 70/700 while the inputs on
      // screen still showed the blank 100/0 defaults. Every model-level assertion passed regardless —
      // only reading the rendered inputs catches it.
      const rentInputs: HTMLInputElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.split-row input.split-field')
      );

      expect(rentInputs[0].value).toBe('70');
      expect(rentInputs[1].value).toBe('700');

      const firstNames: HTMLInputElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.tenant-row input[formcontrolname="firstName"]')
      );
      expect(firstNames[0].value).toBeTruthy();

      const renderedIds: HTMLElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.tenant-id-value')
      );
      expect(renderedIds.map((el) => el.textContent!.trim())).toEqual([first, second]);
    });

    it('updates through the same whole-set replace, carrying the saved ids back', () => {
      loadSaved(saved());

      component.tenants.at(0).patchValue({ rentPercent: 60, rentAmount: 600 });
      component.save();

      const req = httpMock.expectOne(tenantsUrl);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body.tenants.map((t: { tenantId: string }) => t.tenantId)).toEqual([first, second]);
      expect(req.request.body.tenants[0].rentAmount).toBe(600);

      req.flush({
        agreementId,
        isGroupInvoice: false,
        partialPaymentAllowed: false,
        tenantIds: [first, second]
      } as SaveAgreementTenantsResponse);
    });

    it('drops a removed tenant from the submitted set, which deactivates them server-side', () => {
      loadSaved(saved());

      component.removeTenant(1);
      component.save();

      const req = httpMock.expectOne(tenantsUrl);
      expect(req.request.body.tenants.map((t: { tenantId: string }) => t.tenantId)).toEqual([first]);

      req.flush({
        agreementId,
        isGroupInvoice: false,
        partialPaymentAllowed: false,
        tenantIds: [first]
      } as SaveAgreementTenantsResponse);
    });
  });

  it('becomes an edit screen once the first save goes through, without a reload', () => {
    load();
    expect(component.mode()).toBe('create');

    const row = component.tenants.at(0);
    row.patchValue({ firstName: 'Ada', lastName: 'Lovelace' });
    component.save();

    const tenantId = row.get('tenantId')!.value;
    httpMock.expectOne(tenantsUrl).flush({
      agreementId,
      isGroupInvoice: true,
      partialPaymentAllowed: true,
      tenantIds: [tenantId]
    } as SaveAgreementTenantsResponse);

    expect(component.mode()).toBe('edit');
    expect(component.savedTenants()!.tenants[0].tenantId).toBe(tenantId);
  });

  it('surfaces a 404 from the tenants read as a load error', () => {
    httpMock.expectOne(detailUrl).flush(detail());
    httpMock
      .expectOne(tenantsUrl)
      .flush({ detail: 'No agreement was found with the given id.' }, { status: 404, statusText: 'Not Found' });

    expect(component.loadError()).toBe('No agreement was found with the given id.');
    expect(component.loadingAgreement()).toBeFalse();
  });
});
