import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../environments/environment';

import { RequestScopeService } from './request-scope.service';
import { scopeHeadersInterceptor } from './scope-headers.interceptor';

/**
 * Covers requirement 12d and 12e of `01-rent-agreement-edit-ui.md` v21 — the interceptor that sends the
 * two caller-scope ids the Billing API reads (backend v89 FR-127, v90 FR-128).
 */
describe('scopeHeadersInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let scope: RequestScopeService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([scopeHeadersInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    scope = TestBed.inject(RequestScopeService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('Req12d_ApiRequest_AttachesBothHeaders', () => {
    scope.setOrganizationId('11111111-1111-1111-1111-111111111111');
    scope.setPropertyOwnerId('22222222-2222-2222-2222-222222222222');

    http.get(`${environment.apiBaseUrl}/api/v1/rent/agreements/x`).subscribe();

    const request = httpMock.expectOne(`${environment.apiBaseUrl}/api/v1/rent/agreements/x`);

    expect(request.request.headers.get('OrganizationUid')).toBe(
      '11111111-1111-1111-1111-111111111111'
    );
    expect(request.request.headers.get('PropertyOwnerUid')).toBe(
      '22222222-2222-2222-2222-222222222222'
    );

    request.flush({});
  });

  // The box starts populated on purpose: a tester who never opens it must still get a 201, not a 400
  // about a header they have never heard of (spec D1).
  it('Req12b_NothingTyped_StillSendsWellFormedHeaders', () => {
    http.get(`${environment.apiBaseUrl}/api/v1/rent/agreements`).subscribe();

    const request = httpMock.expectOne(`${environment.apiBaseUrl}/api/v1/rent/agreements`);
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    expect(request.request.headers.get('OrganizationUid')).toMatch(guid);
    expect(request.request.headers.get('PropertyOwnerUid')).toMatch(guid);

    request.flush({});
  });

  it('Req12d_NonApiUrl_IsUntouched', () => {
    http.get('https://example.test/something').subscribe();

    const request = httpMock.expectOne('https://example.test/something');

    expect(request.request.headers.has('OrganizationUid')).toBeFalse();
    expect(request.request.headers.has('PropertyOwnerUid')).toBeFalse();

    request.flush({});
  });

  // Pins the cost the spec accepts rather than leaving it to be discovered: the headers ride every
  // Billing API call, not just the create (requirement 12e).
  it('Req12e_EveryApiRequest_CarriesTheHeadersNotJustTheCreate', () => {
    scope.setOrganizationId('33333333-3333-3333-3333-333333333333');

    http.get(`${environment.apiBaseUrl}/api/v1/invoices`).subscribe();

    const request = httpMock.expectOne(`${environment.apiBaseUrl}/api/v1/invoices`);

    expect(request.request.headers.get('OrganizationUid')).toBe(
      '33333333-3333-3333-3333-333333333333'
    );

    request.flush({});
  });
});

/**
 * Covers requirement 12b and 12c — the service the settings box writes to and the interceptor reads.
 */
describe('RequestScopeService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => localStorage.clear());

  it('Req12b_FreshBrowser_SeedsBothIdsSoNothingIsEverSentEmpty', () => {
    const scope = TestBed.inject(RequestScopeService);
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    expect(scope.organizationId()).toMatch(guid);
    expect(scope.propertyOwnerId()).toMatch(guid);
  });

  it('Req12c_TypedValue_IsRemembered', () => {
    TestBed.inject(RequestScopeService).setOrganizationId('44444444-4444-4444-4444-444444444444');

    // A second injector stands in for a reload: it reads what the first one stored.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(RequestScopeService).organizationId()).toBe(
      '44444444-4444-4444-4444-444444444444'
    );
  });

  // A blank box would otherwise send an empty header, which the backend refuses with a 400 that reads
  // as a bug in the service rather than an empty field here.
  it('Req12c_BlankInput_IsIgnoredAndLeavesThePreviousValue', () => {
    const scope = TestBed.inject(RequestScopeService);
    scope.setPropertyOwnerId('55555555-5555-5555-5555-555555555555');

    scope.setPropertyOwnerId('   ');

    expect(scope.propertyOwnerId()).toBe('55555555-5555-5555-5555-555555555555');
  });
});
