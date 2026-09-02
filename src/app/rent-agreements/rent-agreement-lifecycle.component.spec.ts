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

  // ---------- v2, FR 13 – FR 15: the recorded dates ----------

  /**
   * Sets the status and the two v2 date inputs together, so a test reads as the state the host would
   * actually pass.
   */
  const withDates = (
    status: string,
    terminationEffectiveDate: string | null,
    archivedOn: string | null
  ): void => {
    at(status);
    fixture.componentRef.setInput('terminationEffectiveDate', terminationEffectiveDate);
    fixture.componentRef.setInput('archivedOn', archivedOn);
    fixture.detectChanges();
  };

  /** The rendered panel's text, or `''` when it is absent. */
  const panelText = (): string =>
    fixture.nativeElement.querySelector('.lifecycle-dates')?.textContent?.trim() ?? '';

  it('shows the effective date when a termination is recorded', () => {
    withDates('Terminating', '2026-09-30', null);

    expect(component.hasEndDate()).toBeTrue();
    expect(panelText()).toContain('Sep 30, 2026');
  });

  it('keeps the v1 note beside the date, because the two say different things', () => {
    // The date answers "when does this end". The note answers "why is there no Terminate button".
    // Replacing one with the other would drop half the message.
    withDates('Terminating', '2026-09-30', null);

    expect(component.isEnding()).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('only archived');
    expect(panelText()).toContain('Sep 30, 2026');
  });

  it('shows the archival date on an archived lease', () => {
    withDates('Archived', null, '2026-09-02T11:14:59+00:00');

    expect(component.hasArchivedDate()).toBeTrue();
    expect(component.hasEndDate()).toBeFalse();
    expect(panelText()).toContain('Sep 2, 2026');
  });

  it('shows both dates when the lease is archived and terminated', () => {
    // FR 14. `status` reports only `Archived` — FR-105's precedence is a labelling rule — but the
    // tenancy ended on the termination date and that is the fact a person needs. Rendering one and
    // hiding the other would be this component re-deriving a backend reporting rule it has no
    // business owning.
    withDates('Archived', '2026-09-30', '2026-10-05T09:00:00+00:00');

    expect(component.hasEndDate()).toBeTrue();
    expect(component.hasArchivedDate()).toBeTrue();

    const text = panelText();
    expect(text).toContain('Sep 30, 2026');
    expect(text).toContain('Oct 5, 2026');
  });

  it('falls back to the v1 note when the date is absent, with no empty row', () => {
    // FR 15's fallback: a backend older than FR-113 sends neither field, and the component must read
    // as it did in v1 rather than rendering a label with nothing after it.
    withDates('Terminating', null, null);

    expect(component.hasEndDate()).toBeFalse();
    expect(panelText()).toBe('');
    expect(fixture.nativeElement.textContent).toContain('only archived');
  });

  it('renders no date panel on a live lease', () => {
    withDates('Active', null, null);

    expect(panelText()).toBe('');
  });

  it('shows the date when the host re-passes it after a reload', () => {
    // The shape that would have caught v1's caching defect, applied to the new inputs: every test
    // above sets them once, and the requirement is specifically that the date survives a reload —
    // which is the host re-passing, not an initial render.
    withDates('Active', null, null);
    expect(component.hasEndDate()).toBeFalse();

    fixture.componentRef.setInput('status', 'Terminating');
    fixture.componentRef.setInput('terminationEffectiveDate', '2026-09-30');
    fixture.detectChanges();

    expect(component.hasEndDate()).toBeTrue();
    expect(panelText()).toContain('Sep 30, 2026');
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
