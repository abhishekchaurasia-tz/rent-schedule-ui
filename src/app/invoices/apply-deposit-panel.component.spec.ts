import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApplyDepositPanelComponent, ApplyMessages } from './apply-deposit-panel.component';
import { ApplyDepositRequest, DepositApplicationContextResponse } from './deposit-application.models';

/** Covers FR 4–9 of `10-deposit-application-ui.md` v1 — the panel's layout, totals, checks and request. */
describe('ApplyDepositPanelComponent', () => {
  let fixture: ComponentFixture<ApplyDepositPanelComponent>;
  let component: ApplyDepositPanelComponent;
  let emitted: ApplyDepositRequest[];

  const rentA = '11111111-1111-1111-1111-111111111111';
  const rentB = '22222222-2222-2222-2222-222222222222';

  /** QA invoice 9559388's shape: a $100 deposit, fully paid, with two $200 rent invoices open. */
  const context: DepositApplicationContextResponse = {
    invoiceId: '8f14e45f-ceea-467e-bd9f-000000000001',
    invoiceNumber: 'INV-102026-000601',
    canApplyDeposit: true,
    depositAmount: 100,
    totalReturned: 0,
    totalApplied: 0,
    available: 100,
    openInvoices: [
      { invoiceId: rentA, invoiceNumber: 'INV-102026-000602', invoiceType: 'Rent', dueDate: '2026-10-09', total: 200, balanceDue: 200 },
      { invoiceId: rentB, invoiceNumber: 'INV-102026-000603', invoiceType: 'Rent', dueDate: '2026-11-02', total: 200, balanceDue: 50 }
    ],
    fundsApplied: []
  };

  async function create(body: DepositApplicationContextResponse = context): Promise<void> {
    await TestBed.configureTestingModule({ imports: [ApplyDepositPanelComponent] }).compileComponents();

    fixture = TestBed.createComponent(ApplyDepositPanelComponent);
    component = fixture.componentInstance;
    component.context = body;
    emitted = [];
    component.submitted.subscribe((request) => emitted.push(request));
    fixture.detectChanges();
  }

  function page(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function setInvoice(index: number, amount: number | null): void {
    component.invoiceRows.at(index).patchValue({ amount });
  }

  function setMaintenance(index: number, description: string, amount: number | null): void {
    component.maintenanceRows.at(index).patchValue({ description, amount });
  }

  function submit(): void {
    component.submit();
    fixture.detectChanges();
  }

  describe('the layout (FR 4–6)', () => {
    beforeEach(async () => create());

    it('shows the invoice, what is available, the PAID stamp and the owner app\'s sentence', () => {
      const text = page().textContent ?? '';
      expect(text).toContain('Apply Deposit');
      expect(text).toContain('INV-102026-000601');
      expect(text).toContain('Available to Apply');
      expect(text).toContain('$100.00');
      expect(page().querySelector('.paid-stamp')?.textContent).toContain('PAID');
      expect(text).toContain('You can apply the deposit amount to outstanding invoices or to move-out maintenance / repairs.');
    });

    it('starts with one empty maintenance row, and adds and removes rows', () => {
      expect(page().querySelectorAll('.maintenance-row').length).toBe(1);

      (page().querySelector('.add-link') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(page().querySelectorAll('.maintenance-row').length).toBe(2);

      (page().querySelector('.maintenance-row .icon-btn') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(page().querySelectorAll('.maintenance-row').length).toBe(1);
    });

    it('lists the open invoices in the order served, with type, due date and balance due', () => {
      const rows = Array.from(page().querySelectorAll('.invoice-row'));
      expect(rows.length).toBe(2);
      expect(rows[0].textContent).toContain('INV-102026-000602');
      expect(rows[0].textContent).toContain('Rent');
      expect(rows[0].textContent).toContain('Oct 9, 2026');
      expect(rows[0].textContent).toContain('$200.00');
      expect(rows[1].textContent).toContain('Nov 2, 2026');
      expect(rows[1].textContent).toContain('$50.00');
    });
  });

  it('says so when the lease has no unpaid invoice (FR 6)', async () => {
    await create({ ...context, openInvoices: [] });

    expect(page().textContent).toContain('No unpaid invoices on this lease.');
  });

  describe('the totals (FR 7)', () => {
    beforeEach(async () => create());

    it('adds every amount and shows what the deposit would still hold', () => {
      setInvoice(0, 60);
      setMaintenance(0, 'Carpet cleaning', 25.5);
      fixture.detectChanges();

      expect(component.totalToApply).toBe(85.5);
      expect(component.remainingAfterApply).toBe(14.5);
      expect(page().querySelector('.totals')?.textContent).toContain('$85.50');
    });

    it('marks the remainder red when too much is applied', () => {
      setInvoice(0, 150);
      fixture.detectChanges();

      expect(page().querySelector('.totals dd.over')?.textContent).toContain('-$50.00');
    });
  });

  describe('the checks (FR 8)', () => {
    beforeEach(async () => create());

    it('reports nothing until the first press', () => {
      setInvoice(0, 500);
      fixture.detectChanges();

      expect(page().querySelector('.banner.error')).toBeNull();
    });

    it('refuses an empty submission with the server\'s sentence', () => {
      submit();

      expect(emitted).toEqual([]);
      expect(page().textContent).toContain(ApplyMessages.nothingToApply);
    });

    it('refuses an amount above the invoice\'s balance due, and allows one equal to it', () => {
      setInvoice(1, 50.01);
      submit();
      expect(page().textContent).toContain(ApplyMessages.exceedsBalance);
      expect(component.isInvalid('invoice.1')).toBeTrue();

      setInvoice(1, 50);
      submit();
      expect(emitted.length).toBe(1);
    });

    it('refuses a total above what the deposit still holds', () => {
      setInvoice(0, 60);
      setMaintenance(0, 'Paint', 41);
      submit();

      expect(emitted).toEqual([]);
      expect(page().textContent).toContain(ApplyMessages.exceedsAvailable);
    });

    it('refuses more than two decimals', () => {
      setInvoice(0, 10.555);
      submit();

      expect(page().textContent).toContain(ApplyMessages.allocationAmount);
    });

    it('needs a description on a maintenance amount, and an amount on a maintenance description', () => {
      setMaintenance(0, '', 20);
      component.addMaintenanceItem();
      setMaintenance(1, 'Paint', null);
      submit();

      expect(emitted).toEqual([]);
      expect(page().textContent).toContain(ApplyMessages.maintenanceDescription);
      expect(page().textContent).toContain(ApplyMessages.maintenanceAmount);
      expect(component.isInvalid('maintenance.0.description')).toBeTrue();
      expect(component.isInvalid('maintenance.1.amount')).toBeTrue();
    });

    it('clears the list as the entries are fixed', () => {
      submit();
      expect(page().querySelector('.banner.error')).not.toBeNull();

      setInvoice(0, 10);
      fixture.detectChanges();
      expect(page().querySelector('.banner.error')).toBeNull();
    });
  });

  describe('the request (FR 9)', () => {
    beforeEach(async () => create());

    it('sends only rows above zero and maintenance that says something, trimmed', () => {
      setInvoice(0, 60);
      setMaintenance(0, '  Carpet cleaning ', 40);
      component.addMaintenanceItem();
      submit();

      expect(emitted).toEqual([
        {
          applicationId: component.applicationId,
          allocations: [{ invoiceId: rentA, amount: 60 }],
          maintenanceItems: [{ description: 'Carpet cleaning', amount: 40 }]
        }
      ]);
    });

    it('keeps one applicationId across presses, so a second press is the same submission', () => {
      setInvoice(0, 10);
      submit();
      submit();

      expect(emitted.length).toBe(2);
      expect(emitted[0].applicationId).toBe(emitted[1].applicationId);
      expect(emitted[0].applicationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('sends nothing while the host\'s request is in flight', () => {
      setInvoice(0, 10);
      component.submitting = true;
      submit();

      expect(emitted).toEqual([]);
    });

    it('closes on Cancel', () => {
      let closed = false;
      component.closed.subscribe(() => (closed = true));

      (page().querySelector('.ghost-btn') as HTMLButtonElement).click();

      expect(closed).toBeTrue();
    });
  });
});
