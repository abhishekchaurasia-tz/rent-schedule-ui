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

  it('starts shared by everyone, which is a complete instruction rather than an empty one', () => {
    fixture.componentRef.setInput('tenants', rosterOf(tenantA, tenantB));
    fixture.componentRef.setInput('feeTotal', 300);
    fixture.detectChanges();

    expect(component.isSharedByEveryone()).toBeTrue();
    expect(component.rows()).toEqual([]);
    expect(reported).toEqual({ shares: undefined, blocker: null });
    expect(fixture.nativeElement.textContent).toContain('shared by every active renter');
    expect(rendered().length).toBe(0);
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

  it('returns to shared by everyone, discarding the typed rows with it', () => {
    splitAcross(300, tenantA, tenantB);
    component.typeShare(tenantA, '250');
    expect(component.hasTypedShares()).toBeTrue();

    component.setSplitMode('shared');
    fixture.detectChanges();

    // Going back to "the whole lease owes this" is a deliberate click, and it cannot leave typed
    // per-renter figures behind it — there are no rows left for them to belong to.
    expect(component.isSharedByEveryone()).toBeTrue();
    expect(component.hasTypedShares()).toBeFalse();
    expect(reported!.shares).toBeUndefined();
  });

  it('reads what is typed into a row, in the unit that row is set to', () => {
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

  it('switches a row to a percentage without moving the money', () => {
    splitAcross(300, tenantA, tenantB, tenantC);

    const unit = rendered()[0].querySelector('.share-unit');
    unit.value = 'percent';
    unit.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // The row was at its even $100.00 of $300; asking to see it as a percentage says 33.33%, and the
    // cent it loses to that rounding is the point — it is now a stated percentage, not a stated amount.
    expect(rowFor(tenantA).authoredUnit).toBe('percent');
    expect(rowFor(tenantA).text).toBe('33.33');
    expect(rowFor(tenantA).amount).toBe(99.99);
    expect(reported!.shares![0].sharePercent).toBe(33.33);
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

      // One selector per row, on the amount box alone.
      expect(rendered()[0].querySelectorAll('.share-unit').length).toBe(1);
    });
  });
});
