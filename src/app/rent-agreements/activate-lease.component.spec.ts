import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActivateLeaseComponent } from './activate-lease.component';
import { ActivateRentAgreementResponse } from './rent-agreement.models';

describe('ActivateLeaseComponent', () => {
  let fixture: ComponentFixture<ActivateLeaseComponent>;
  let component: ActivateLeaseComponent;
  let httpMock: HttpTestingController;

  const agreementId = '8f14e45f-ceea-467e-bd9f-000000000001';
  const activateUrl = `http://localhost:5169/api/v1/rent/agreements/${agreementId}/activate`;

  const response = (
    overrides: Partial<ActivateRentAgreementResponse> = {}
  ): ActivateRentAgreementResponse => ({
    rentAgreementId: agreementId,
    leaseId: agreementId,
    activatedAt: '2026-09-01T10:00:00+00:00',
    alreadyActive: false,
    invoicesGenerated: 2,
    ...overrides
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ActivateLeaseComponent, HttpClientTestingModule]
    });

    fixture = TestBed.createComponent(ActivateLeaseComponent);
    component = fixture.componentInstance;
    component.agreementId = agreementId;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('offers activation until the server has answered', () => {
    // No status passed here, which the component reads as "unknown — offer anyway": a host that has
    // not loaded the lease yet cannot gate on anything, and hiding the button then would remove the
    // action from the very screen that needs it. Safe because the endpoint is idempotent.
    expect(component.canActivate()).toBeTrue();
  });

  it('offers activation for a draft when the host passes its status', () => {
    fixture.componentRef.setInput('status', 'InProcess');

    expect(component.canActivate()).toBeTrue();
  });

  (['Future', 'Active', 'Expiring', 'Expired', 'Terminating', 'Terminated', 'Archived'] as const)
    .forEach((status) => {
      it(`hides activation once the lease is past a draft (${status})`, () => {
        // What backend v73 bought. Until then `status` answered InProcess for every lease however long
        // it had been active, so this gate could not exist and all three lease actions had to be shown
        // at once with two of them certain to be refused.
        fixture.componentRef.setInput('status', status);

        expect(component.canActivate()).toBeFalse();
      });
    });

  it('reacts when the host re-passes a new status', () => {
    // `status` is a signal input precisely so `canActivate` — a computed — tracks it. Handed a plain
    // @Input it would evaluate once and cache, which is the defect the sibling component shipped.
    fixture.componentRef.setInput('status', 'InProcess');
    expect(component.canActivate()).toBeTrue();

    fixture.componentRef.setInput('status', 'Active');

    expect(component.canActivate()).toBeFalse();
  });

  it('stops offering activation once the lease is confirmed active', () => {
    component.activate();
    httpMock.expectOne(activateUrl).flush(response());

    expect(component.canActivate()).toBeFalse();
  });

  it('stops offering activation when the server says it was already active', () => {
    component.activate();
    httpMock.expectOne(activateUrl).flush(response({ alreadyActive: true, invoicesGenerated: 0 }));

    expect(component.canActivate()).toBeFalse();
  });

  it('keeps offering activation after a failure, since a 422 becomes activatable by waiting', () => {
    component.activate();
    httpMock.expectOne(activateUrl).flush(
      { detail: 'The lease begin date has not arrived yet.' },
      { status: 422, statusText: 'Unprocessable Entity' }
    );

    expect(component.canActivate()).toBeTrue();
  });

  it('sends the agreement id as the lease id, at version 1', () => {
    component.activate();

    const req = httpMock.expectOne(activateUrl);
    expect(req.request.method).toBe('POST');
    // The agreement's own id doubles as the lease id — this app has no Lease service to mint one.
    expect(req.request.body.leaseId).toBe(agreementId);
    expect(req.request.body.version).toBe(1);
    expect(typeof req.request.body.activatedAt).toBe('string');

    req.flush(response());
  });

  it('reports the invoices a genuine activation raised', () => {
    component.activate();
    httpMock.expectOne(activateUrl).flush(response({ invoicesGenerated: 3 }));

    expect(component.activating()).toBeFalse();
    expect(component.activateError()).toBeNull();
    expect(component.activateResult()!.invoicesGenerated).toBe(3);
    expect(component.activateResult()!.alreadyActive).toBeFalse();
  });

  it('treats a repeat as a success, not an error', () => {
    component.activate();

    // The endpoint is idempotent by contract: in production the Lease service retries on timeout, so a
    // second call answers 200 with alreadyActive rather than conflicting.
    httpMock.expectOne(activateUrl).flush(response({ alreadyActive: true, invoicesGenerated: 0 }));

    expect(component.activateError()).toBeNull();
    expect(component.activateResult()!.alreadyActive).toBeTrue();
  });

  it('emits the outcome so the host can re-read the lease', () => {
    const seen: ActivateRentAgreementResponse[] = [];
    component.activated.subscribe((r) => seen.push(r));
    component.activate();
    httpMock.expectOne(activateUrl).flush(response());

    expect(seen.length).toBe(1);
    expect(seen[0].rentAgreementId).toBe(agreementId);
  });

  it('surfaces the 422 the begin-date gate returns, verbatim', () => {
    component.activate();

    httpMock.expectOne(activateUrl).flush(
      { detail: 'The lease begin date has not arrived yet.' },
      { status: 422, statusText: 'Unprocessable Entity' }
    );

    expect(component.activateError()).toBe('The lease begin date has not arrived yet.');
    expect(component.activateResult()).toBeNull();
    expect(component.activating()).toBeFalse();
  });

  it('surfaces the 409 an out-of-order version returns', () => {
    component.activate();

    httpMock.expectOne(activateUrl).flush(
      { detail: 'A newer activation has already been recorded.' },
      { status: 409, statusText: 'Conflict' }
    );

    expect(component.activateError()).toBe('A newer activation has already been recorded.');
  });

  it('falls back to the status line when the error carries no problem detail', () => {
    component.activate();

    httpMock.expectOne(activateUrl).flush(null, { status: 500, statusText: 'Server Error' });

    expect(component.activateError()).toBe('Request failed: 500 Server Error');
  });

  it('does not fire a second call while one is in flight', () => {
    component.activate();
    component.activate();

    // One request, not two — a double-clicked button must not raise two sets of invoices.
    httpMock.expectOne(activateUrl).flush(response());
  });

  it('renders the button first, then the Active chip and the outcome banner', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.activate-btn')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.activated-chip')).toBeNull();

    component.activate();
    httpMock.expectOne(activateUrl).flush(response({ invoicesGenerated: 4 }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.activate-btn')).toBeNull();
    expect(fixture.nativeElement.querySelector('.activated-chip').textContent.trim()).toBe('Active');
    expect(fixture.nativeElement.querySelector('.banner.success').textContent).toContain('4 invoice(s)');
  });

  it('renders a repeat as information, not as a success claiming invoices were raised', () => {
    fixture.detectChanges();

    component.activate();
    httpMock.expectOne(activateUrl).flush(response({ alreadyActive: true, invoicesGenerated: 0 }));
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('app-activate-lease .banner, .banner');
    expect(banner.classList.contains('info')).toBeTrue();
    expect(banner.classList.contains('success')).toBeFalse();
    expect(banner.textContent).toContain('Already active');
  });
});
