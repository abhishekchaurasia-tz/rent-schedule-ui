import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RentAgreementLifecycleComponent } from './rent-agreement-lifecycle.component';
import {
  ArchiveRentAgreementResponse,
  TerminateRentAgreementResponse
} from './rent-agreement.models';

describe('RentAgreementLifecycleComponent', () => {
  let fixture: ComponentFixture<RentAgreementLifecycleComponent>;
  let component: RentAgreementLifecycleComponent;
  let httpMock: HttpTestingController;

  const agreementId = '8f14e45f-ceea-467e-bd9f-000000000041';
  const terminateUrl = `http://localhost:5169/api/v1/rent/agreements/${agreementId}/terminate`;
  const archiveUrl = `http://localhost:5169/api/v1/rent/agreements/${agreementId}/archive`;

  const terminated = (
    overrides: Partial<TerminateRentAgreementResponse> = {}
  ): TerminateRentAgreementResponse => ({
    agreementId,
    effectiveDate: '2026-10-15',
    status: 'Terminating',
    alreadyTerminated: false,
    cyclesCancelled: 3,
    ...overrides
  });

  const archived = (
    overrides: Partial<ArchiveRentAgreementResponse> = {}
  ): ArchiveRentAgreementResponse => ({
    agreementId,
    archivedAt: '2026-09-02T10:00:00+00:00',
    status: 'Archived',
    alreadyArchived: false,
    cyclesCancelled: 3,
    ...overrides
  });

  /**
   * Builds the component at a given lease status — the input every gating decision reads.
   *
   * `setInput`, not assignment: both inputs are signal inputs, which is what makes the `computed`
   * gating actually react when the host re-passes a new status. See
   * `reacts when the host re-passes a new status` below for the bug that forced this.
   */
  const at = (status: string): void => {
    fixture.componentRef.setInput('agreementId', agreementId);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RentAgreementLifecycleComponent, HttpClientTestingModule]
    });

    fixture = TestBed.createComponent(RentAgreementLifecycleComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ---------- FR 2 – FR 5: the status table ----------

  it('offers neither action on an unactivated draft', () => {
    // A draft has nothing to withdraw, and the backend refuses to archive one with a 422. Offering a
    // button that reliably fails is worse than offering none — which is only decidable at all because
    // backend v73 made `status` trustworthy.
    at('InProcess');

    expect(component.canTerminate()).toBeFalse();
    expect(component.canArchive()).toBeFalse();
    expect(component.isDraft()).toBeTrue();
  });

  (['Future', 'Active', 'Expiring'] as const).forEach((status) => {
    it(`offers both actions on a live lease (${status})`, () => {
      at(status);

      expect(component.canTerminate()).toBeTrue();
      expect(component.canArchive()).toBeTrue();
    });
  });

  (['Terminating', 'Terminated'] as const).forEach((status) => {
    it(`offers archive only once a termination is recorded (${status})`, () => {
      // Re-terminating with a corrected date is something the backend accepts and this screen does
      // not expose yet — see UI spec 05's Out of Scope.
      at(status);

      expect(component.canTerminate()).toBeFalse();
      expect(component.canArchive()).toBeTrue();
    });
  });

  it('offers archive on an expired lease', () => {
    at('Expired');

    expect(component.canTerminate()).toBeFalse();
    expect(component.canArchive()).toBeTrue();
  });

  it('offers nothing once archived, and says the lease is closed', () => {
    at('Archived');

    expect(component.canTerminate()).toBeFalse();
    expect(component.canArchive()).toBeFalse();
    expect(component.isArchived()).toBeTrue();
  });

  it('reacts when the host re-passes a new status', () => {
    // THE BUG THIS PINS. `status` was a plain @Input first, and the gating computeds read it — but a
    // `computed` tracks signals, so handed a plain field it evaluated once and cached forever. The
    // gating was right on the first render and never updated again: after terminating, the host
    // reloaded, re-passed `Terminating`, and the Terminate button was still on offer.
    //
    // Every other test in this file sets the input once, which is exactly why none of them caught it —
    // it was found by running the app. This one changes the input mid-life, which is the only shape
    // that fails when the inputs are not signals.
    at('Active');
    expect(component.canTerminate()).toBeTrue();

    fixture.componentRef.setInput('status', 'Terminating');
    fixture.detectChanges();

    expect(component.canTerminate()).toBeFalse();
    expect(component.canArchive()).toBeTrue();
  });

  // ---------- FR 6, FR 8: terminating ----------

  it('posts the picked effective date and reports the outcome from the response', () => {
    at('Active');
    component.confirm('terminate');
    component.effectiveDate.set('2026-10-15');

    component.terminate();

    const request = httpMock.expectOne(terminateUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.effectiveDate).toBe('2026-10-15');
    // The fence is a constant 1: the backend rejects only a version BELOW the stored one, and nothing
    // in this app issues versions. Same constant ActivateLeaseComponent sends.
    expect(request.request.body.version).toBe(1);
    request.flush(terminated());

    // Both figures come from the response, never computed here — the backend's recompute decides
    // which cycles were protected, by rules this client does not model.
    expect(component.terminateResult()?.status).toBe('Terminating');
    expect(component.terminateResult()?.cyclesCancelled).toBe(3);
    expect(component.error()).toBeNull();
  });

  it('closes the confirmation and tells the host to reload after a termination', () => {
    let reloads = 0;
    at('Active');
    component.changed.subscribe(() => reloads++);
    component.confirm('terminate');

    component.terminate();
    httpMock.expectOne(terminateUrl).flush(terminated());

    expect(reloads).toBe(1);
    expect(component.pendingAction()).toBeNull();
    expect(component.working()).toBeFalse();
  });

  // ---------- FR 9: a repeat is information, not success ----------

  it('renders an idempotent repeat as a repeat rather than a fresh termination', () => {
    let reloads = 0;
    at('Active');
    component.changed.subscribe(() => reloads++);
    component.confirm('terminate');

    component.terminate();
    httpMock.expectOne(terminateUrl).flush(terminated({ alreadyTerminated: true, cyclesCancelled: 0 }));

    const result = component.terminateResult();
    expect(result?.alreadyTerminated).toBeTrue();
    expect(result?.cyclesCancelled).toBe(0);
    // Still a reload: the lease's stored state is what the screen should show either way.
    expect(reloads).toBe(1);
  });

  it('renders an idempotent archive repeat the same way', () => {
    at('Active');
    component.confirm('archive');

    component.archive();
    httpMock.expectOne(archiveUrl).flush(archived({ alreadyArchived: true, cyclesCancelled: 0 }));

    expect(component.archiveResult()?.alreadyArchived).toBeTrue();
    expect(component.archiveResult()?.cyclesCancelled).toBe(0);
  });

  // ---------- FR 7: archiving ----------

  it('posts the archive instant and the constant fence, with no date', () => {
    at('Active');
    component.confirm('archive');

    component.archive();

    const request = httpMock.expectOne(archiveUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.archivedAt).toBeTruthy();
    expect(request.request.body.effectiveDate).toBeUndefined();
    expect(request.request.body.version).toBe(1);
    request.flush(archived());

    expect(component.archiveResult()?.status).toBe('Archived');
  });

  // ---------- FR 10: the backend's own words reach the user ----------

  it('renders a refusal detail verbatim and leaves the confirmation open', () => {
    at('Active');
    component.confirm('terminate');
    component.effectiveDate.set('2020-01-01');

    component.terminate();
    httpMock.expectOne(terminateUrl).flush(
      { detail: 'The agreement cannot be terminated with an effective date before its begin date.' },
      { status: 422, statusText: 'Unprocessable Entity' }
    );

    expect(component.error()).toBe(
      'The agreement cannot be terminated with an effective date before its begin date.'
    );
    // Left open on purpose: the user's next move is to correct the date and retry.
    expect(component.pendingAction()).toBe('terminate');
    expect(component.working()).toBeFalse();
  });

  it('falls back to the status line when a failure carries no problem detail', () => {
    at('Active');
    component.confirm('archive');

    component.archive();
    httpMock
      .expectOne(archiveUrl)
      .flush(null, { status: 409, statusText: 'Conflict' });

    expect(component.error()).toContain('409');
  });

  it('defaults the effective date to today', () => {
    at('Active');

    expect(component.effectiveDate()).toBe(new Date().toISOString().slice(0, 10));
  });

  it('does nothing when a call is already in flight', () => {
    at('Active');
    component.confirm('terminate');

    component.terminate();
    component.terminate();

    // One request, not two: the in-flight guard is what stops a double-click withdrawing twice.
    httpMock.expectOne(terminateUrl).flush(terminated());
  });
});
