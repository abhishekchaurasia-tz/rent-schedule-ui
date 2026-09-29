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

  /**
   * Requirement 35 — a fee that **rides the rent invoice** shows no setting and read-only shares.
   *
   * v17 removed the setting **and** the shares together, reasoning that a field the service refuses
   * has no place on screen. The two are different questions: the service refuses *typed* shares, and
   * the table's job in this state is to **show** a division the owner may not type. The product
   * decision draws the state with the figures present — *"No setting — the rent invoice has already
   * decided how many invoices there are and who is on them. Owes · read only — Alice 150 ·
   * Bob 150."*
   */
  /**
   * Requirement 36 — the caption under each renter names **where that renter's share lands**.
   *
   * Four captions, not two. The product decision's six cases give them in full: a fee on its own
   * invoice reads them off its **own** mode, and a fee riding the rent invoice has no invoice of its
   * own, so the only fact left is how the **lease** is billed. That is the single place
   * `isGroupInvoice` may be consulted — requirement 31 keeps it out of the other two.
   */
  /**
   * Requirement 37 — a **deposit** fee is billed to the renters who carry a deposit share, which is
   * not always the same set as the rent share.
   *
   * The decision flags this as the surprising one and says so about itself: *"A renter recorded at
   * nothing of the deposit is not billed a deposit fee, even though the same person is billed every
   * other kind of fee. This is worth a frame if you think a manager would be surprised by it — we
   * were."*
   */
  describe('a deposit fee (requirement 37)', () => {
    /** A roster whose renters hold the deposit shares given, in order. */
    function depositRoster(...deposits: readonly (readonly [number, number | null])[]) {
      return deposits.map(([deposit, depositPercent], index) => ({
        tenantId: [tenantA, tenantB, tenantC][index],
        rentAmount: 1000,
        rentPercent: null,
        deposit,
        depositPercent
      }));
    }

    /** Renders the deposit drawer for a fee of `total` across that roster. */
    function depositFeeOf(total: number, roster: ReturnType<typeof depositRoster>): void {
      fixture.componentRef.setInput('tenants', roster);
      fixture.componentRef.setInput('feeTotal', total);
      fixture.componentRef.setInput('depositFee', true);
      fixture.detectChanges();
    }

    it('FR37_ADepositFee_DividesAcrossDepositHoldersOnly', () => {
      // Three renters, one holding no deposit. The service bills 450 to two; the screen said 300
      // to three until this requirement.
      depositFeeOf(900, depositRoster([1500, null], [1500, null], [0, null]));

      expect(component.rows().map((row) => row.amount)).toEqual([450, 450]);
    });

    it('FR37_ADepositHeldAsAPercentage_StillCounts', () => {
      // A share stated as a percentage leaves the amount at zero. Reading only the amount would drop
      // a renter who holds half the deposit.
      depositFeeOf(900, depositRoster([0, 50], [0, 50], [0, null]));

      expect(component.rows().map((row) => row.amount)).toEqual([450, 450]);
    });

    it('FR37_ARenterWithNoDepositShare_IsListedAsNotCharged', () => {
      depositFeeOf(900, depositRoster([1500, null], [1500, null], [0, null]));

      // Listed, not hidden: seeing who is NOT on a fee is half of reading a split, and this is the
      // one case the decision calls surprising.
      expect(rendered().length).toBe(3);
      expect(rendered()[2].textContent).toContain('Not charged this fee');
    });

    it('FR37_ADepositFeeReachingNobody_IsStillSaveable', () => {
      depositFeeOf(900, depositRoster([0, null], [0, null]));

      expect(component.rows()).toEqual([]);
      expect(component.blocker()).toBeNull();
    });

    it('FR37_AnOrdinaryFee_IgnoresTheDepositColumns', () => {
      // The same roster, without the deposit flag: an ordinary fee reaches everybody, because only a
      // deposit is billed from the deposit column.
      fixture.componentRef.setInput('tenants', depositRoster([1500, null], [1500, null], [0, null]));
      fixture.componentRef.setInput('feeTotal', 900);
      fixture.detectChanges();

      expect(component.rows().map((row) => row.amount)).toEqual([300, 300, 300]);
    });
  });

  describe("where each renter's share lands (requirement 36)", () => {
    /** The caption rendered under each renter, in roster order. */
    function captions(): string[] {
      return Array.from<Element>(rendered()).map((row) =>
        row.querySelector('.muted')!.textContent!.trim()
      );
    }

    it('FR36_SharedOnItsOwnInvoice_SaysOnOneInvoice', () => {
      splitAcross(300, tenantA, tenantB);
      component.setSplitMode('shared');
      fixture.detectChanges();

      expect(captions()).toEqual(['On one invoice', 'On one invoice']);
    });

    it('FR36_SplitPerTenant_NumbersEachInvoice', () => {
      splitAcross(300, tenantA, tenantB);

      expect(captions()).toEqual(['Invoice 1 of 2', 'Invoice 2 of 2']);
    });

    it('FR36_SplitPerTenantNamingSomeOfTheRoster_CountsOnlyTheNamed', () => {
      splitAcross(300, tenantA, tenantB, tenantC);
      component.toggleTenant(tenantC);
      fixture.detectChanges();

      // The count is over the renters the fee NAMES, not over the roster: an unnamed renter is
      // charged nothing and so is on none of the invoices being counted.
      expect(captions()).toEqual(['Invoice 1 of 2', 'Invoice 2 of 2', 'Not charged this fee']);
    });

    it('FR36_OnTheRentInvoiceOfAGroupLease_SaysTheSharedRentInvoice', () => {
      fixture.componentRef.setInput('tenants', rosterOf(tenantA, tenantB));
      fixture.componentRef.setInput('feeTotal', 300);
      fixture.componentRef.setInput('ridesRentInvoice', true);
      fixture.componentRef.setInput('isGroupInvoice', true);
      fixture.detectChanges();

      expect(captions()).toEqual(['On the shared rent invoice', 'On the shared rent invoice']);
    });

    it('FR36_OnTheRentInvoiceOfAPerRenterLease_SaysTheirOwnRentInvoice', () => {
      fixture.componentRef.setInput('tenants', rosterOf(tenantA, tenantB));
      fixture.componentRef.setInput('feeTotal', 300);
      fixture.componentRef.setInput('ridesRentInvoice', true);
      fixture.componentRef.setInput('isGroupInvoice', false);
      fixture.detectChanges();

      expect(captions()).toEqual(['On their own rent invoice', 'On their own rent invoice']);
    });

  });

  describe('a fee that rides the rent invoice (requirement 35)', () => {
    /** Renders the editor for a fee that raises no invoice of its own. */
    function ridingTheRent(total: number, ...tenantIds: string[]): void {
      fixture.componentRef.setInput('tenants', rosterOf(...tenantIds));
      fixture.componentRef.setInput('feeTotal', total);
      fixture.componentRef.setInput('ridesRentInvoice', true);
      fixture.detectChanges();
    }

    it('FR35_AFeeOnTheRentInvoice_ShowsNoModeControl', () => {
      ridingTheRent(300, tenantA, tenantB);

      expect(fixture.nativeElement.querySelectorAll('input[name="splitMode"]').length).toBe(0);
      expect(fixture.nativeElement.textContent).toContain('the rent invoice has already decided');
    });

    it('FR35_AFeeOnTheRentInvoice_ShowsItsSharesReadOnly', () => {
      ridingTheRent(300, tenantA, tenantB);

      expect(rendered().length).toBe(2);
      expect(component.rows().map((row) => row.amount)).toEqual([150, 150]);
      expect(boxes(0).amount.readOnly).toBeTrue();
      expect(boxes(1).amount.readOnly).toBeTrue();
    });

    it('FR35_AFeeOnTheRentInvoice_DividesAcrossEveryoneEvenAfterRentersWerePicked', () => {
      splitAcross(300, tenantA, tenantB, tenantC);
      component.toggleTenant(tenantC);
      fixture.detectChanges();
      expect(component.rows().length).toBe(2);

      fixture.componentRef.setInput('ridesRentInvoice', true);
      fixture.detectChanges();

      // The rent invoice has already settled who is on it, so a fee riding it covers the whole
      // roster again — the renters the owner had named describe a fee that no longer exists.
      expect(component.rows().map((row) => row.amount)).toEqual([100, 100, 100]);
    });
  });

  describe('switching the mode hands the division back (FR 25 as withdrawn by FR 30)', () => {
    // Until v14 setSplitMode('shared') called resetSplit(), because clearing the shares WAS the way
    // back from naming. Under v14 naming is the mode, so that reset destroyed data for no reason.
    // v17, requirement 30: the service refuses typed figures on a fee that resolves its payers from
    // the LIVE roster (its requirement 211), because they are correct only until somebody joins or
    // leaves. The division is still SHOWN -- the service computes and stores it -- and is no longer
    // SENT. These cases keep their subject and change what they expect of the emission.

    it('shows the division but stops sending it when the owner picks Shared Lease', () => {
      splitAcross(300, tenantA, tenantB);
      component.typeShare(tenantA, '200');
      fixture.detectChanges();
      expect(reported!.shares!.map((share) => share.amount)).toEqual([200, 100]);

      component.setSplitMode('shared');
      fixture.detectChanges();

      expect(reported!.mode).toBe('Shared');
      expect(reported!.shares)
        .withContext('a shared fee states no split; the lease roster divides it')
        .toBeUndefined();
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

    it('reports Shared, and no split, with the boxes read-only on Shared Lease', () => {
      // v14 called this "the case the field exists for" and typed into both boxes. v17 requirement 30
      // makes them read-only for this mode, so what the field now distinguishes is a shared fee from
      // a named one -- not a shared fee with figures from one without.
      fixture.componentRef.setInput('tenants', rosterOf(tenantA, tenantB));
      fixture.componentRef.setInput('feeTotal', 300);
      fixture.detectChanges();

      component.setSplitMode('shared');
      fixture.detectChanges();

      expect(boxes(0).amount.readOnly)
        .withContext('the box takes no typing on a shared fee')
        .toBeTrue();

      expect(reported!.mode).toBe('Shared');
      expect(reported!.shares).toBeUndefined();
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

  describe('Shared Lease shows the same boxes, read-only (FR 25 as narrowed by FR 30)', () => {
    // v17, requirement 30: the service refuses typed figures on a fee that resolves its payers from
    // the LIVE roster (its requirement 211), because they are correct only until somebody joins or
    // leaves. The division is still SHOWN -- the service computes and stores it -- and is no longer
    // SENT. These cases keep their subject and change what they expect of the emission.

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

    it('sends nothing even when a figure reaches the rows, and still names nobody', () => {
      // v14 asserted the figures went OUT here. Requirement 30 is why they no longer do: the service
      // divides a shared fee across the live roster itself, and refuses a stated split it would have
      // to overwrite the moment that roster moves.
      //
      // typeShare is called directly rather than through the box, which is read-only now. That is
      // deliberate -- it proves the guard is on the EMISSION and not only on the input, so a figure
      // arriving by another route, such as a reopened fee's seed, is not sent either.
      sharedAcross(300, tenantA, tenantB);
      component.typeShare(tenantA, '210');
      fixture.detectChanges();

      expect(component.namesRenters()).toBeFalse();
      expect(reported!.mode).toBe('Shared');
      expect(reported!.shares).toBeUndefined();
      expect(component.rows().map((row) => row.amount))
        .withContext('the figure still reaches the rows the owner reads')
        .toEqual([210, 90]);
    });

    it('does the same in percent: both rows shown, neither sent', () => {
      // The percent lane reaches the same place as the money one, and for the same reason. Asserted
      // separately because the two convert differently, and a guard written on the money path alone
      // would let the percent path send a split the service refuses.
      sharedAcross(300, tenantA, tenantB);
      component.setSplitUnit('percent');
      component.typeShare(tenantA, '60');
      fixture.detectChanges();

      expect(component.rows().map((row) => row.sharePercent)).toEqual([60, 40]);
      expect(component.rows().map((row) => row.amount)).toEqual([180, 120]);
      expect(reported!.shares)
        .withContext('a shared fee states no split, in either unit')
        .toBeUndefined();
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

    it('goes back to the even division when the shares are cleared', () => {
      // The emission was already undefined before the reset -- this fee is shared, so requirement 30
      // sends no split whatever the rows hold. What the reset still does is put the ROWS back to the
      // even division, which is what the owner sees.
      sharedAcross(300, tenantA, tenantB);
      component.typeShare(tenantA, '210');
      fixture.detectChanges();
      expect(component.rows().map((row) => row.amount)).toEqual([210, 90]);

      component.resetSplit();
      fixture.detectChanges();

      expect(component.namesRenters()).toBeFalse();
      expect(reported!.shares).toBeUndefined();
      expect(component.rows().map((row) => row.amount))
        .withContext('back to the even division, not to nothing')
        .toEqual([150, 150]);
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

  it('returns to shared by everyone, keeps the rows, and sends no split', () => {
    splitAcross(300, tenantA, tenantB);
    component.typeShare(tenantA, '250');
    expect(component.hasTypedShares()).toBeTrue();

    component.setSplitMode('shared');
    fixture.detectChanges();

    // v14 asserted the figures were still SENT here; v17 requirement 30 is why they are not. The
    // reasoning v14 gave for keeping the ROWS stands and is unchanged: v13 gave Shared Lease the
    // whole roster with boxes, so there is somewhere for the figures to live, and the reset control
    // is still the only thing that clears them. What changed is that the service refuses a stated
    // split on a fee whose payers it resolves itself.
    expect(component.isSharedByEveryone()).toBeTrue();
    expect(component.hasTypedShares()).toBeTrue();
    expect(reported!.mode).toBe('Shared');
    expect(reported!.shares).toBeUndefined();
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

  describe('a fee that has taken money keeps who owes it (FR 33)', () => {
    // The service freezes on MONEY, not on issuance -- user, 2026-09-29. Its requirement 105 removed
    // an all-or-nothing edit lock because an issued UNPAID invoice is corrected forward, and that
    // stale lock shut this editor the hour it shipped. Freezing on issuance would rebuild it.
    //
    // The flag arrives as the response's isApplied, whose name is older than its meaning: FR-134
    // narrowed it from "any invoice line references this charge" to "has taken a payment".

    function paidSplitAcross(total: number, ...tenantIds: string[]): void {
      splitAcross(total, ...tenantIds);
      fixture.componentRef.setInput('hasTakenMoney', true);
      fixture.detectChanges();
    }

    it('locks both mode controls and says why', () => {
      paidSplitAcross(300, tenantA, tenantB);

      const choices = fixture.nativeElement.querySelectorAll('.mode-choice input');

      expect(choices[0].disabled).toBeTrue();
      expect(choices[1].disabled).toBeTrue();
      expect(fixture.nativeElement.textContent).toContain('who owes it can no longer change');
      expect(fixture.nativeElement.textContent).toContain('amounts can still be edited');
    });

    it('refuses a mode change reached past the control', () => {
      // Guarded in the method as well as on the radio, because the radio is not the only way in --
      // a host, a keyboard, or a later refactor can call this directly, and the rule is about the
      // fee rather than about the control.
      paidSplitAcross(300, tenantA, tenantB);
      expect(reported!.mode).toBe('PerTenant');

      component.setSplitMode('shared');
      fixture.detectChanges();

      expect(reported!.mode).toBe('PerTenant');
    });

    it('refuses a renter tick reached past the control', () => {
      paidSplitAcross(300, tenantA, tenantB);
      const before = reported!.shares!.map((share) => share.tenantId);

      component.toggleTenant(tenantA);
      fixture.detectChanges();

      expect(reported!.shares!.map((share) => share.tenantId)).toEqual(before);
    });

    it('still takes an amount edit, because the service still performs a reprice', () => {
      // The assertion that keeps FR-134 honest. A screen that locked the whole fee would forbid an
      // edit the system does happily, which is the failure requirement 105 removed a lock to avoid.
      paidSplitAcross(300, tenantA, tenantB);

      component.typeShare(tenantA, '200');
      fixture.detectChanges();

      expect(reported!.shares!.map((share) => share.amount)).toEqual([200, 100]);
    });

    it('leaves an unpaid fee alone', () => {
      splitAcross(300, tenantA, tenantB);

      const choices = fixture.nativeElement.querySelectorAll('.mode-choice input');

      expect(choices[0].disabled).toBeFalse();
      expect(fixture.nativeElement.textContent).not.toContain('who owes it can no longer change');

      component.setSplitMode('shared');
      fixture.detectChanges();
      expect(reported!.mode).toBe('Shared');
    });
  });

  it('says how each share is billed, from the FEE and not from the lease (FR 31)', () => {
    // v17: this read isGroupInvoice until requirement 31. The service reversed BR-05 (its
    // requirement 209), so a Shared fee raises one invoice for the lease whatever the lease bills
    // and a Split per Tenant fee raises one per renter -- the two may disagree with the lease, and
    // that is the feature. Taken from the lease, the caption told the renter the wrong thing for
    // exactly the cases this release exists to make possible.
    // The wording changed on 2026-09-29 with requirement 36, which replaced two captions with the
    // four the product decision names. The subject of this case did not: for a fee that raises its
    // OWN invoice, the caption still comes from the fee and never from the lease.
    splitAcross(300, tenantA, tenantB);
    expect(rendered()[0].textContent).toContain('Invoice 1 of 2');

    // The LEASE flips, and the caption does not: it is not the lease's question any more.
    fixture.componentRef.setInput('isGroupInvoice', true);
    fixture.detectChanges();
    expect(rendered()[0].textContent).toContain('Invoice 1 of 2');

    // The FEE flips, and the caption follows it.
    component.setSplitMode('shared');
    fixture.detectChanges();
    expect(rendered()[0].textContent).toContain('On one invoice');
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
