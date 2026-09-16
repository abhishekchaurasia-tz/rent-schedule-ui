import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../environments/environment';

import { RequestScopeService } from './request-scope.service';
import { scopeHeadersInterceptor, sendsScopeIds } from './scope-headers.interceptor';

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

  // v25: asserted with no token set, which is now the branch that sends these headers at all
  // (requirement 15f). The assertion is unchanged; what changed is that it names its precondition.
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

  // -----------------------------------------------------------------------------------------------
  // The access token (requirement 15). Without it the dev and qa builds are refused at the gateway,
  // before Billing is reached -- the proxies already point at api-{dev,qa}-my.innago.com, whose
  // /billing route carries AuthenticationProviderKey: Bearer.
  // -----------------------------------------------------------------------------------------------

  it('Req15_TokenSet_AttachesTheBearer', () => {
    scope.setAccessToken('a-token-from-a-signed-in-session');

    http.get(`${environment.apiBaseUrl}/api/v1/rent/agreements`).subscribe();

    const request = httpMock.expectOne(`${environment.apiBaseUrl}/api/v1/rent/agreements`);

    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer a-token-from-a-signed-in-session'
    );

    request.flush({});
  });

  // THE ARM THAT MATTERS. An unconditionally attached header would pass the test above and would send
  // `Bearer ` with nothing after it from the local build -- a malformed credential, which reads worse
  // than an absent one because it invites whoever is debugging to investigate authentication rather
  // than notice there is none (requirement 15d).
  it('Req15d_TokenBlank_SendsNoAuthorizationHeaderAtAll', () => {
    http.get(`${environment.apiBaseUrl}/api/v1/rent/agreements`).subscribe();

    const request = httpMock.expectOne(`${environment.apiBaseUrl}/api/v1/rent/agreements`);

    expect(request.request.headers.has('Authorization'))
      .withContext('an empty token means send nothing, not `Bearer `')
      .toBeFalse();

    request.flush({});
  });

  // The leak case. The token inherits the URL guard the scope headers already have, and inheriting it
  // silently is worth its own test because the consequence is a credential sent to a third party
  // (requirement 15e).
  // Requirement 15f. The gateway derives the caller from the token, so sending our three ids
  // alongside it would put two answers to one question in one request -- and the client cannot know
  // which the backend records. Not sending them removes the question instead of documenting it.
  it('Req15f_TokenSet_SendsNoScopeIds', () => {
    scope.setAccessToken('a-token-the-gateway-will-read');

    http.get(`${environment.apiBaseUrl}/api/v1/rent/agreements`).subscribe();

    const request = httpMock.expectOne(`${environment.apiBaseUrl}/api/v1/rent/agreements`);

    expect(request.request.headers.get('Authorization')).toBe('Bearer a-token-the-gateway-will-read');
    expect(request.request.headers.has('OrganizationUid'))
      .withContext('the gateway derives this from the token; two answers must not travel together')
      .toBeFalse();
    expect(request.request.headers.has('PropertyOwnerUid')).toBeFalse();
    expect(request.request.headers.has('IdentityId')).toBeFalse();

    request.flush({});
  });

  // The other half, and the local build's normal state: no gateway to derive anything, and Billing
  // reads the three headers itself.
  it('Req15f_NoToken_SendsTheScopeIdsAndNoAuthorization', () => {
    http.get(`${environment.apiBaseUrl}/api/v1/rent/agreements`).subscribe();

    const request = httpMock.expectOne(`${environment.apiBaseUrl}/api/v1/rent/agreements`);

    expect(request.request.headers.has('OrganizationUid')).toBeTrue();
    expect(request.request.headers.has('PropertyOwnerUid')).toBeTrue();
    expect(request.request.headers.has('IdentityId')).toBeTrue();
    expect(request.request.headers.has('Authorization')).toBeFalse();

    request.flush({});
  });

  it('Req15e_NonApiUrl_NeverReceivesTheToken', () => {
    scope.setAccessToken('a-token-that-must-not-leave');

    http.get('https://example.test/something').subscribe();

    const request = httpMock.expectOne('https://example.test/something');

    expect(request.request.headers.has('Authorization')).toBeFalse();

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
  // -----------------------------------------------------------------------------------------------
  // Requirement 15g. THE BUG THESE EXIST FOR, and the reason the rule is a pure function rather than a
  // condition inside the interceptor: the specs run under `environment.ts`, which is the LOCAL build.
  // Keyed on the token alone, no test in this file could ever have observed what a dev or qa build
  // sends -- which is exactly where the wrong thing was being sent. Asking the rule directly is the
  // only way to cover all four builds from one suite.
  // -----------------------------------------------------------------------------------------------

  it('Req15g_DevAndQaBuilds_NeverSendTheScopeIdsEvenWithNoTokenYet', () => {
    // The ids are typed into a box those builds do not show. Before v26 they were still sent -- three
    // GUIDs invented by crypto.randomUUID(), which nobody could see, set or correct, travelling as
    // though they identified an account.
    expect(sendsScopeIds('dev', '')).toBeFalse();
    expect(sendsScopeIds('qa', '')).toBeFalse();
    expect(sendsScopeIds('production', '')).toBeFalse();
  });

  it('Req15g_LocalBuild_SendsTheScopeIdsWhenThereIsNoToken', () => {
    // The one build that shows the fields is the one build that sends them: there is no gateway in
    // front of Billing locally, and Billing reads the three headers itself (requirement 12).
    expect(sendsScopeIds('local', '')).toBeTrue();
  });

  it('Req15f_ATokenSuppressesTheIdsOnEveryBuildIncludingLocal', () => {
    // 15f is unchanged by v26 and still has to hold on its own: wherever a token goes, the ids do not.
    expect(sendsScopeIds('local', 'a-token')).toBeFalse();
    expect(sendsScopeIds('qa', 'a-token')).toBeFalse();
  });

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

  it('Req15_TokenDefaultsToEmpty_NotAnInventedValue', () => {
    // Unlike the three ids beside it, which seed themselves so a tester who never opens the box still
    // gets a 201. A fabricated token looks real, is refused at the gateway, and sends whoever is
    // debugging to look for the wrong problem.
    expect(TestBed.inject(RequestScopeService).accessToken()).toBe('');
  });

  // The opposite of the three ids, and deliberately so: they ignore a blank because an empty header is
  // a 400. An empty token means send no Authorization at all, which is the local build's normal state
  // -- so a blank must be storable, or the box could never be cleared.
  it('Req15d_BlankToken_IsStoredRatherThanIgnored', () => {
    const scope = TestBed.inject(RequestScopeService);
    scope.setAccessToken('something');

    scope.setAccessToken('   ');

    expect(scope.accessToken()).toBe('');
  });

  it('Req15_PastedToken_IsTrimmedAndRemembered', () => {
    // Trimmed because a copied token routinely carries whitespace, and a leading space makes the
    // header malformed in a way that reads as a server fault.
    TestBed.inject(RequestScopeService).setAccessToken('  a-pasted-token\n');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(RequestScopeService).accessToken()).toBe('a-pasted-token');
  });

  // Requirement 15b. One shared key would mean pasting a qa token wipes the dev one, and the next dev
  // run fails with a 401 that looks like a broken environment rather than last Tuesday's paste.
  it('Req15b_StorageKey_IsScopedToTheEnvironment', () => {
    TestBed.inject(RequestScopeService).setAccessToken('env-scoped');

    expect(localStorage.getItem(`innago.test-scope.${environment.name}`))
      .withContext('the key carries the environment, so dev and qa do not overwrite each other')
      .toContain('env-scoped');
  });

  // Requirement 15g. The signal every open screen watches so it can re-read what it fetched under the
  // scope that has just stopped applying.
  it('Req15g_PastingAToken_AnnouncesTheChangeOnRevision', () => {
    const scope = TestBed.inject(RequestScopeService);
    const before = scope.revision();

    scope.setAccessToken('a-token-pasted-after-the-page-loaded');

    expect(scope.revision()).toBeGreaterThan(before);
  });

  // A keystroke that changed nothing must not make every open screen refetch. The three ids return
  // before reaching `persist`, which is where the announcement lives -- so this falls out of that
  // placement rather than needing a rule of its own.
  it('Req15g_IgnoredBlankId_DoesNotAnnounceAChange', () => {
    const scope = TestBed.inject(RequestScopeService);
    const before = scope.revision();

    scope.setOrganizationId('   ');

    expect(scope.revision()).toBe(before);
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
