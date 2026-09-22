import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgreementTenantShareResponse } from './rent-agreement.models';
import { TenantSplitEditorComponent, TenantSplitState } from './tenant-split-editor.component';

/**
 * The split editor's own behaviour — the parts that are not arithmetic.
 *
 * The rules themselves are pinned in `tenant-split.util.spec.ts`; what is tested here is the control
 * surface: the two modes, typing through the DOM, the per-row and whole-split resets, and what the
 * component reports upward for the fee panel to send or refuse.
 */
describe('TenantSplitEditorComponent', () => {
  let fixture: ComponentFixture<TenantSplitEditorComponent>;
  let component: TenantSplitEditorComponent;

  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';
  const tenantC = '33333333-3333-3333-3333-333333333333';

  /** A saved roster of the named renters, **in the order given** — the order leftover cents follow. */
  function rosterOf(...tenantIds: string[]): AgreementTenantShareResponse[] {
    return tenantIds.map((tenantId) => ({
      tenantId,
      rentAmount: 0,
      rentPercent: null,
      deposit: 0,
      depositPercent: null
    }));
  }

  /** The last state the editor reported, which is all the fee panel ever sees of it. */
  let reported: TenantSplitState | null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TenantSplitEditorComponent] }).compileComponents();

    fixture = TestBed.createComponent(TenantSplitEditorComponent);
    component = fixture.componentInstance;
    reported = null;
    component.splitChange.subscribe((state) => (reported = state));
  });

  /** Renders the editor for `total` across the given roster, split per renter. */
  function splitAcross(total: number, ...tenantIds: string[]): void {
    fixture.componentRef.setInput('tenants', rosterOf(...tenantIds));
    fixture.componentRef.setInput('feeTotal', total);
    fixture.detectChanges();
    component.setSplitMode('split');
    fixture.detectChanges();
  }

  /** The two boxes on a rendered row: the fee share, then what has been paid of it. */
  function boxes(index: number): { amount: HTMLInputElement; paid: HTMLInputElement } {
    const inputs = rendered()[index].querySelectorAll('.share-input');
    return { amount: inputs[0], paid: inputs[1] };
  }

  /** Types into a box the way a person does, through the DOM. */
  function typeInto(box: HTMLInputElement, text: string): void {
    box.value = text;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function rowFor(tenantId: string) {
    return component.rows().find((row) => row.tenantId === tenantId)!;
  }

  function rendered() {
    return fixture.nativeElement.querySelectorAll('.roster-row');
  }

  describe('switching the mode keeps the figures (FR 25 as corrected)', () => {
    // Until v14 setSplitMode('shared') called resetSplit(), because clearing the shares WAS the way
    // back from naming. Under v14 naming is the mode, so that reset destroys data for no reason: the
    // figures are a division, and a division is as meaningful on one mode as on the other.

    it('keeps the typed figures when the owner picks Shared Lease', () => {
      splitAcross(300, tenantA, tenantB);
      component.typeShare(tenantA, '200');
      fixture.detectChanges();
      expect(reported!.shares!.map((share) => share.amount)).toEqual([200, 100]);

      component.setSplitMode('shared');
      fixture.detectChanges();

      expect(reported!.mode).toBe('Shared');
      expect(reported!.shares!.map((share) => share.amount))
        .withContext('the owner typed a division, and it still divides')
        .toEqual([200, 100]);
    });

    it('keeps them going the other way too, so neither direction is a quiet reset', () => {
      fixture.componentRef.setInput('tenants', rosterOf(tenantA, tenantB));
      fixture.componentRef.setInput('feeTotal', 300);
      fixture.detectChanges();
      component.typeShare(tenantA, '200');
      fixture.detectChanges();

      component.setSplitMode('split');
      fixture.detectChanges();

      expect(reported!.mode).toBe('PerTenant');
      expect(reported!.shares!.map((share) => share.amount)).toEqual([200, 100]);
    });

    it('still clears them on the reset control, which is the only thing that should', () => {
      splitAcross(300, tenantA, tenantB);
      component.typeShare(tenantA, '200');
      fixture.detectChanges();

      component.resetSplit();
      fixture.detectChanges();

      expect(component.hasTypedShares()).toBeFalse();
      expect(reported!.shares!.map((share) => share.amount))
        .withContext('back to the even division, not to nothing')
        .toEqual([150, 150]);
    });
  });

  describe('the mode goes on the wire (FR 26)', () => {
    // The service reads splitMode as the only thing that says WHO OWES the fee. Until v14 this
    // component had no mode at all: "Shared Lease" WAS the empty selection, and typing a share flipped
    // namesRenters to true. So a shared fee with figures in it looked exactly like a named one, and the
    // service -- which falls back to "a split was sent, so it names payers" -- stored it as PerTenant.
    //
    // That is the defect these cases exist for, and the second one is the whole of it.

    it('reports Shared when the owner picks Shared Lease and types nothing', () => {
      fixture.componentRef.setInput('tenants', rosterOf(tenantA, tenantB));
      fixture.componentRef.setInput('feeTotal', 300);
      fixture.detectChanges();

      component.setSplitMode('shared');
      fixture.detectChanges();

      expect(reported!.mode).toBe('Shared');
      expect(reported!.shares).toBeUndefined();
    });

    it('reports Shared when the owner picks Shared Lease and DOES type figures', () => {
      // The case the field exists for. Typing says how the fee divides, never who owes it.
      fixture.componentRef.setInput('tenants', rosterOf(tenantA, tenantB));
      fixture.componentRef.setInput('feeTotal', 300);
      fixture.detectChanges();

      component.setSplitMode('shared');
      fixture.detectChanges();

      typeInto(boxes(0).amount, '200');
      typeInto(boxes(1).amount, '100');
      fixture.detectChanges();

      expect(reported!.mode).toBe('Shared');
      expect(reported!.shares).toBeDefined();
      expect(reported!.shares!.map((share) => share.amount)).toEqual([200, 100]);
    });

    it('reports PerTenant when the owner picks Split per Tenant', () => {
      splitAcross(300, tenantA, tenantB);

      expect(reported!.mode).toBe('PerTenant');
    });

    it('reports PerTenant for a subset, because the mode says so and not the selection size', () => {
      splitAcross(300, tenantA, tenantB, tenantC);
      component.toggleTenant(tenantC);
      fixture.detectChanges();

      expect(reported!.mode).toBe('PerTenant');
    });
  });

  describe('Shared Lease carries the same boxes (FR 25)', () => {
    /** Renders the editor for `total` across the roster, left in Shared Lease. */
    function sharedAcross(total: number, ...tenantIds: string[]): void {
      fixture.componentRef.setInput('tenants', rosterOf(...tenantIds));
      fixture.componentRef.setInput('feeTotal', total);
      fixture.detectChanges();
    }

    it('shows the whole roster with boxes, and still sends nothing', () => {
      sharedAcross(300, tenantA, tenantB);

      expect(component.isSharedByEveryone()).toBeTrue();
      expect(rendered().length).withContext('the table is not rendered in Shared Lease').toBe(2);
      expect(fixture.nativeElement.querySelectorAll('.split-unit').length)
        .withContext('the unit control is not offered in Shared Lease')
        .toBe(1);
      expect(component.rows().map((row) => row.amount)).toEqual([150, 150]);

      // The figures are shown because they are true. They are not sent, because nobody has said
      // this fee names anybody -- it still covers renters added later.
      expect(component.namesRenters()).toBeFalse();
      expect(reported!.shares).toBeUndefined();
      expect(fixture.nativeElement.textContent).toContain('shared by every active renter');
    });

    it('sends every renter shown the moment one share is typed, and still names nobody', () => {
      // v14: this case asserted namesRenters() became TRUE here, which was FR 25's naming half. The
      // user reversed it on 2026-09-22 in favour of the service's BR-30: typing says HOW the fee
      // divides, the mode says WHO OWES it. So the figures go out exactly as before -- both rows,
      // never one alone -- and the fee still covers renters added later.
      sharedAcross(300, tenantA, tenantB);
      component.typeShare(tenantA, '210');
      fixture.detectChanges();

      expect(component.namesRenters()).toBeFalse();
      expect(reported!.mode).toBe('Shared');
      expect(reported!.shares!.map((share) => share.amount)).toEqual([210, 90]);
      expect(reported!.shares!.length).withContext('one row went out alone').toBe(2);
    });

    it('does the same in percent, stating both rows', () => {
      sharedAcross(300, tenantA, tenantB);
      component.setSplitUnit('percent');
      component.typeShare(tenantA, '60');
      fixture.detectChanges();

      expect(reported!.shares!.map((share) => share.sharePercent)).toEqual([60, 40]);
      expect(reported!.shares!.map((share) => share.amount)).toEqual([180, 120]);
      expect(component.blocker()).toBeNull();
    });

    it('says what naming costs, and only once the owner has picked the mode that names', () => {
      // v14: the notice is right and its trigger was wrong. A named fee is resolved by an
      // intersection with the roster, so it drops a renter who leaves and never adds one who joins
      // -- a different product from the one the owner had a moment ago. What changed is that the
      // choice is the MODE CONTROL, not the first keystroke in a share box.
      sharedAcross(300, tenantA, tenantB);
      expect(fixture.nativeElement.querySelector('.split-note.naming')).toBeNull();

      component.typeShare(tenantA, '210');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.split-note.naming'))
        .withContext('typing a figure is not naming anybody')
        .toBeNull();

      component.setSplitMode('split');
      fixture.detectChanges();

      const notice = fixture.nativeElement.querySelector('.split-note.naming');
      expect(notice).not.toBeNull();
      expect(notice.textContent).toContain('will not');
      expect(notice.textContent).toContain('added to the lease later');
    });

    it('goes back to shared when the shares are cleared', () => {
      sharedAcross(300, tenantA, tenantB);
      component.typeShare(tenantA, '210');
      fixture.detectChanges();
      expect(reported!.shares).toBeDefined();

      component.resetSplit();
      fixture.detectChanges();

      expect(component.namesRenters()).toBeFalse();
      expect(reported!.shares).toBeUndefined();
      expect(fixture.nativeElement.querySelector('.split-note.naming')).toBeNull();
    });

    it('cannot untick a renter on a shared fee, because the invoice would bill them anyway', () => {
      // v14: this case used to assert that unticking on a shared fee narrowed the table. Under BR-30
      // a Shared fee is billed to the LIVE ROSTER, so a tick that appears to remove somebody would
      // promise what the invoice does not do. The ticks belong to Split per Tenant, where they
      // decide something. (User, 2026-09-22.)
      sharedAcross(300, tenantA, tenantB, tenantC);

      component.toggleTenant(tenantC);
      fixture.detectChanges();

      expect(component.rows().map((row) => row.tenantId)).toEqual([tenantA, tenantB, tenantC]);
      expect(component.rows().map((row) => row.amount)).toEqual([100, 100, 100]);
      expect(reported!.mode).toBe('Shared');
    });

    it('disables the ticks on a shared fee, so the control does not promise what it cannot do', () => {
      sharedAcross(300, tenantA, tenantB);

      const ticks = fixture.nativeElement.querySelectorAll('.roster-row input[type="checkbox"]');
      expect(ticks.length).toBe(2);
      expect([...ticks].every((tick: HTMLInputElement) => tick.disabled)).toBeTrue();
    });

    it('keeps a lease with no renters on the note, with nothing to type into', () => {
      sharedAcross(300);

      expect(rendered().length).toBe(0);
      expect(reported!.shares).toBeUndefined();
      expect(fixture.nativeElement.textContent).toContain('no renters saved yet');
    });
  });

  it('starts shared by everyone, which is a complete instruction rather than an empty one', () => {
    fixture.componentRef.setInput('tenants', rosterOf(tenantA, tenantB));
    fixture.componentRef.setInput('feeTotal', 300);
    fixture.detectChanges();

    expect(component.isSharedByEveryone()).toBeTrue();
    // v14: the reported state gained a mode. A fee nobody has touched is Shared, and says so
    // explicitly rather than by sending nothing -- which is the whole of requirement 26.
    expect(reported).toEqual({ shares: undefined, blocker: null, mode: 'Shared' });
    expect(fixture.nativeElement.textContent).toContain('shared by every active renter');

    // v13: the table IS rendered here now, and this case used to assert it was not. What it was
    // really protecting is the line above -- a shared fee sends nothing at all -- and that has not
    // changed. The rows exist so the owner has somewhere to type; showing them commits to nothing.
    expect(rendered().length).toBe(2);
    expect(component.namesRenters()).toBeFalse();
  });

  it('ticks everybody when switched to Split per Tenant, changing who owes the fee not at all', () => {
    splitAcross(300, tenantA, tenantB, tenantC);

    // "Split per renter" from an empty selection has to tick somebody, and everybody is the only
    // choice that leaves who-pays untouched while making the split editable.
    expect(component.rows().length).toBe(3);
    expect(component.rows().map((row) => row.amount)).toEqual([100, 100, 100]);
    expect(reported!.shares!.length).toBe(3);
  });

  it('lists the whole roster, so an unticked renter can be ticked back', () => {
    splitAcross(300, tenantA, tenantB, tenantC);
    component.toggleTenant(tenantC);
    fixture.detectChanges();

    expect(rendered().length).withContext('an unticked renter vanished from the table').toBe(3);
    expect(rendered()[2].textContent).toContain('Not charged this fee');
    expect(component.rows().map((row) => row.amount)).toEqual([150, 150]);
  });

  it('returns to shared by everyone, and keeps the typed rows', () => {
    splitAcross(300, tenantA, tenantB);
    component.typeShare(tenantA, '250');
    expect(component.hasTypedShares()).toBeTrue();

    component.setSplitMode('shared');
    fixture.detectChanges();

    // v14: this case asserted the figures were DISCARDED here, on the reasoning that "there are no
    // rows left for them to belong to". That reasoning was stale twice over. v13 already gave Shared
    // Lease the whole roster with boxes, so the rows are still there; and v14 makes the mode -- not
    // the figures -- say who owes the fee, so a division typed under one mode is just as true under
    // the other. The reset control is what clears them, and it is its own deliberate click.
    expect(component.isSharedByEveryone()).toBeTrue();
    expect(component.hasTypedShares()).toBeTrue();
    expect(reported!.mode).toBe('Shared');
    expect(reported!.shares!.map((share) => share.amount)).toEqual([250, 50]);
  });

  it('reads what is typed into a row, in the unit the split is set to', () => {
    splitAcross(300, tenantA, tenantB, tenantC);

    const input = rendered()[0].querySelector('.share-input');
    input.value = '120';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(rowFor(tenantA).authoredUnit).toBe('amount');
    expect(rowFor(tenantA).amount).toBe(120);
    expect(rendered()[0].querySelector('.cell-derived').textContent).toContain('40.00%');
    expect(rendered()[0].textContent).toContain('Typed');
    expect(rendered()[1].textContent).toContain('Even');
  });

  it('switches the whole split to percentages, converting every typed row', () => {
    splitAcross(300, tenantA, tenantB, tenantC);
    component.typeShare(tenantA, '150');
    component.typeShare(tenantB, '90');
    fixture.detectChanges();

    component.setSplitUnit('percent');
    fixture.detectChanges();

    // Both typed rows carry across into the new unit; the untouched row is still dividing what they
    // leave and has no figure of its own to convert. Trailing zeros are trimmed -- a box reading
    // 50.000000 is noise, while 33.333334 has to show every place it has.
    expect(rowFor(tenantA).text).toBe('50');
    expect(rowFor(tenantB).text).toBe('30');
    expect(rowFor(tenantC).authoredUnit).toBe('even');
    expect(rowFor(tenantA).amount).toBe(150);
    expect(rowFor(tenantB).amount).toBe(90);
    expect(rowFor(tenantC).amount).toBe(60);
  });

  it('switching to percentages leaves every renter owing exactly what they owed (FR 24)', () => {
    // The case FR 24 was drafted as a warning for. An even $300 three ways is $100.00 each, and
    // 33.33% of 300 is 99.99 -- so carrying the two-decimal figure across took a cent off Alice and
    // handed it to Bob, for no reason but a change of unit. Six places carries the residue instead:
    // 33.334 / 33.333 / 33.333 totals a hundred exactly and each still resolves to $100.00.
    splitAcross(300, tenantA, tenantB, tenantC);
    const before = component.rows().map((row) => row.amount);

    component.setSplitUnit('percent');
    fixture.detectChanges();

    expect(component.rows().map((row) => row.amount)).toEqual(before);
    expect(component.rows().map((row) => row.amount)).toEqual([100, 100, 100]);
    expect(component.blocker()).toBeNull();
    expect(reported!.shares!.map((share) => share.sharePercent))
      .toEqual([33.333334, 33.333333, 33.333333]);
  });

  it('holds the money still on a total that divides no better in percent than in cents', () => {
    // $1,500 across six is $250.00 each. Three decimals would have moved it -- the round trip only
    // survives below about $500 at that precision -- which is why the carry is to six.
    splitAcross(1500, tenantA, tenantB, tenantC);

    component.setSplitUnit('percent');
    fixture.detectChanges();

    expect(component.rows().map((row) => row.amount)).toEqual([500, 500, 500]);
    expect(component.blocker()).toBeNull();
  });

  it('carries a typed row across without rewriting the number the owner entered', () => {
    // The residue goes to the rows the page derived, never onto one the owner authored: answering
    // 66.670001 to somebody who typed 66.67 is the page balancing its books with their input.
    splitAcross(300, tenantA, tenantB, tenantC);
    component.setSplitUnit('percent');
    component.typeShare(tenantA, '66.67');
    fixture.detectChanges();

    expect(rowFor(tenantA).sharePercent).toBe(66.67);
    expect(reported!.shares![0].sharePercent).toBe(66.67);
  });

  it('states a percentage on every row once the split is in percent, never on only some', () => {
    // The v11 defect, at the component. Before it, this reported one sharePercent of 50 and the
    // service refused the save 422 -- the percentages a request STATES must total exactly 100.
    splitAcross(300, tenantA, tenantB);
    component.setSplitUnit('percent');
    component.typeShare(tenantA, '70');
    fixture.detectChanges();

    expect(reported!.shares!.map((share) => share.sharePercent)).toEqual([70, 30]);
    expect(reported!.shares!.map((share) => share.amount)).toEqual([210, 90]);
  });

  it('refuses a percentage split that misses a hundred, before the service does', () => {
    splitAcross(300, tenantA, tenantB);
    component.setSplitUnit('percent');
    component.typeShare(tenantA, '60');
    component.typeShare(tenantB, '30');
    fixture.detectChanges();

    // The amounts are $180 + $90, which is $270 against a $300 fee -- so the money arm speaks first,
    // exactly as requirement 23 settles. Fixing the amounts leaves the percentages as the fault.
    expect(component.blocker()).toContain('the fee is $300.00');

    component.typeShare(tenantB, '40');
    fixture.detectChanges();
    expect(component.blocker()).toBeNull();
  });

  it('names the percentages once the amounts add up', () => {
    splitAcross(300, tenantA, tenantB, tenantC);
    component.setSplitUnit('percent');
    component.typeShare(tenantA, '33.33');
    component.typeShare(tenantB, '33.33');
    component.typeShare(tenantC, '33.33');
    fixture.detectChanges();

    // 99.99 / 99.99 / 99.99 is $0.03 short of the fee, so the money is named first.
    expect(component.blocker()).toContain('the fee is $300.00');

    component.typeShare(tenantC, '33.34');
    fixture.detectChanges();

    // Now the amounts are exact and the percentages total 100.00 -- both arms are satisfied.
    expect(component.blocker()).toBeNull();
    expect(reported!.shares!.map((share) => share.sharePercent)).toEqual([33.33, 33.33, 33.34]);
    expect(reported!.shares!.map((share) => share.amount)).toEqual([99.99, 99.99, 100.02]);
  });

  it('states no percentage on any row while the split is in money', () => {
    splitAcross(300, tenantA, tenantB);
    component.typeShare(tenantA, '210');
    fixture.detectChanges();

    expect(reported!.shares!.every((share) => !('sharePercent' in share))).toBeTrue();
  });

  it('hands one row back to the even split without disturbing the others', () => {
    splitAcross(300, tenantA, tenantB, tenantC);
    component.typeShare(tenantA, '200');
    component.typeShare(tenantB, '50');
    fixture.detectChanges();

    const reset = rendered()[0].querySelector('.row-reset');
    expect(reset.disabled).withContext('a typed row offers no reset').toBeFalse();
    reset.click();
    fixture.detectChanges();

    expect(rowFor(tenantA).authoredUnit).toBe('even');
    expect(rowFor(tenantB).authoredUnit).withContext('an untouched row was reset too').toBe('amount');
    expect(rowFor(tenantB).amount).toBe(50);
    // A and C now share the $250 that B has left of the fee.
    expect(rowFor(tenantA).amount).toBe(125);
    expect(rowFor(tenantC).amount).toBe(125);
  });

  it('offers no per-row reset on a row nobody has typed', () => {
    splitAcross(300, tenantA, tenantB);

    expect(rendered()[0].querySelector('.row-reset').disabled).toBeTrue();
  });

  it('refuses a split that does not total the fee, and keeps every typed row', () => {
    splitAcross(300, tenantA, tenantB, tenantC);
    component.typeShare(tenantA, '100');
    component.typeShare(tenantB, '100');
    component.typeShare(tenantC, '90');
    fixture.detectChanges();

    expect(reported!.blocker).toBe('The shares total $290.00, the fee is $300.00 — $10.00 short.');
    expect(fixture.nativeElement.textContent).toContain('the fee is $300.00');

    // The assertion that fails if the editor "helpfully" corrects the owner.
    expect(component.rows().map((row) => row.text)).toEqual(['100', '100', '90']);
  });

  it('offers the whole-split reset only once a row has been typed, and only on a click', () => {
    splitAcross(300, tenantA, tenantB);
    expect(fixture.nativeElement.querySelector('.reset-all')).toBeNull();

    component.typeShare(tenantA, '250');
    fixture.detectChanges();

    const reset = fixture.nativeElement.querySelector('.reset-all');
    expect(reset).not.toBeNull();
    reset.click();
    fixture.detectChanges();

    expect(component.hasTypedShares()).toBeFalse();
    expect(component.rows().map((row) => row.amount)).toEqual([150, 150]);
    expect(reported!.blocker).toBeNull();
  });

  it('re-divides when the fee total changes under it', () => {
    splitAcross(300, tenantA, tenantB);
    expect(component.rows().map((row) => row.amount)).toEqual([150, 150]);

    // The owner goes back up the panel and edits an item's rate. Nothing here was called; the split
    // still has to follow, which is why the total is an input rather than something read once.
    fixture.componentRef.setInput('feeTotal', 100);
    fixture.detectChanges();

    expect(component.rows().map((row) => row.amount)).toEqual([50, 50]);
    expect(reported!.shares!.map((share) => share.amount)).toEqual([50, 50]);
  });

  it('cannot be switched to Split per Tenant when the lease has no renters saved', () => {
    fixture.componentRef.setInput('tenants', []);
    fixture.componentRef.setInput('feeTotal', 300);
    fixture.detectChanges();

    const splitChoice = fixture.nativeElement.querySelectorAll('.mode-choice input')[1];
    expect(splitChoice.disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('no renters saved yet');
    expect(reported!.shares).toBeUndefined();
  });

  it('says how each share is billed, from the lease invoicing mode', () => {
    splitAcross(300, tenantA, tenantB);
    expect(rendered()[0].textContent).toContain('Billed on its own invoice');

    fixture.componentRef.setInput('isGroupInvoice', true);
    fixture.detectChanges();

    expect(rendered()[0].textContent).toContain('group invoice');
  });
  describe('the paid box', () => {
    it('gives each row its own amount box and paid box', () => {
      splitAcross(300, tenantA, tenantB);
      fixture.componentRef.setInput('alreadyPaid', 100);
      fixture.detectChanges();

      expect(rendered()[0].querySelectorAll('.share-input').length).toBe(2);
      expect(boxes(0).amount.value).toBe('150.00');
      expect(boxes(0).paid.value).toBe('50.00');
    });

    it('divides what is already paid as soon as the figure is entered', () => {
      splitAcross(300, tenantA, tenantB, tenantC);
      expect(component.rows().map((row) => row.paidAmount)).toEqual([0, 0, 0]);

      // The owner types the charge-level Already Paid box up in the panel; the split follows.
      fixture.componentRef.setInput('alreadyPaid', 100);
      fixture.detectChanges();

      expect(component.rows().map((row) => row.paidAmount)).toEqual([33.34, 33.33, 33.33]);
      expect(component.paidTotal()).toBe(100);
    });

    it('derives Owes from the two boxes, and never takes it as input', () => {
      splitAcross(300, tenantA, tenantB);
      fixture.componentRef.setInput('alreadyPaid', 100);
      fixture.detectChanges();

      typeInto(boxes(0).paid, '40');

      expect(component.rows().map((row) => row.paidAmount)).toEqual([40, 60]);
      expect(component.rows().map((row) => row.owes)).toEqual([110, 90]);
      expect(component.owesTotal()).toBe(200);

      // Three columns, two of them boxes. Owes is read-only by construction.
      expect(rendered()[0].querySelectorAll('input[type="text"]').length).toBe(2);
    });

    it('keeps the amount box and the paid box independent', () => {
      splitAcross(300, tenantA, tenantB);
      fixture.componentRef.setInput('alreadyPaid', 100);
      fixture.detectChanges();

      typeInto(boxes(0).amount, '200');
      typeInto(boxes(1).paid, '80');

      // Fixing what Alice owes must not disturb what Bob has paid, and the reverse.
      expect(component.rows().map((row) => row.amount)).toEqual([200, 100]);
      expect(component.rows().map((row) => row.paidAmount)).toEqual([20, 80]);
      expect(component.blocker()).toBeNull();
    });

    it('refuses the split when the paid amounts do not add up, naming that column', () => {
      splitAcross(300, tenantA, tenantB);
      fixture.componentRef.setInput('alreadyPaid', 100);
      fixture.detectChanges();

      typeInto(boxes(0).paid, '10');
      typeInto(boxes(1).paid, '10');

      // The fee column is fine, so the message has to name the one that is not.
      expect(component.blocker()).toBe(
        'The paid amounts total $20.00, already paid is $100.00 — $80.00 short.'
      );
      expect(fixture.nativeElement.textContent).toContain('already paid is $100.00');
    });

    it('reports the fee column first when both are wrong', () => {
      splitAcross(300, tenantA, tenantB);
      fixture.componentRef.setInput('alreadyPaid', 100);
      fixture.detectChanges();

      typeInto(boxes(0).amount, '10');
      typeInto(boxes(1).amount, '10');
      typeInto(boxes(0).paid, '1');
      typeInto(boxes(1).paid, '1');

      // Two messages at once names neither clearly, and an owner with the fee wrong is usually about
      // to change the paid figures anyway.
      expect(component.blocker()).toContain('the fee is $300.00');
    });

    it('resets a paid box without touching the amount beside it', () => {
      splitAcross(300, tenantA, tenantB);
      fixture.componentRef.setInput('alreadyPaid', 100);
      fixture.detectChanges();

      typeInto(boxes(0).amount, '200');
      typeInto(boxes(0).paid, '75');

      const resets = rendered()[0].querySelectorAll('.row-reset');
      resets[1].click();
      fixture.detectChanges();

      expect(rowFor(tenantA).paidAmount).toBe(50);
      expect(rowFor(tenantA).amount).withContext('the amount box was reset too').toBe(200);
    });

    it('shows a negative Owes for an overpaid renter rather than refusing it', () => {
      splitAcross(300, tenantA, tenantB);
      fixture.componentRef.setInput('alreadyPaid', 400);
      fixture.detectChanges();

      typeInto(boxes(0).paid, '300');

      // The charge itself allows alreadyPaid to exceed its own total, so a stricter rule per renter
      // would be one this editor invented. It is shown, not blocked.
      expect(rowFor(tenantA).owes).toBe(-150);
      expect(rendered()[0].querySelector('.overpaid')).not.toBeNull();
      expect(component.blocker()).toBeNull();
    });

    it('offers no unit selector on the paid box, because the wire carries no paid percentage', () => {
      splitAcross(300, tenantA, tenantB);

      // No unit control inside a row at all as of v11 -- the unit is the split's, chosen once above
      // the table. What this case has always guarded still holds and holds harder: the paid column
      // has no unit to choose, because there is no alreadyPaidPercent on the wire (requirement 23).
      expect(rendered()[0].querySelectorAll('.share-unit').length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('.split-unit').length).toBe(1);
    });
  });
});
