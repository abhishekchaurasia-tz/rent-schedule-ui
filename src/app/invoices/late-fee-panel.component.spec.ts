import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { LateFeePanelComponent } from './late-fee-panel.component';
import { LateFeeSummaryResponse } from './late-fee.models';

// Spec `07-late-fee-ui.md` v1 — FR 3 to FR 13 (Flows 1 to 3: see, remove and apply a late fee).
describe('LateFeePanelComponent', () => {
  let fixture: ComponentFixture<LateFeePanelComponent>;
  let component: LateFeePanelComponent;
  let httpMock: HttpTestingController;

  const invoiceId = '8f14e45f-ceea-467e-bd9f-000000000001';
  const url = `${environment.apiBaseUrl}/api/v1/invoices/${invoiceId}/late-fee`;

  /** The spec's worked case: a $1,050 invoice with a $50 late fee and $1,020 paid (backend DoD 16). */
  const partPaid: LateFeeSummaryResponse = {
    invoiceId,
    dueDate: '2026-08-01',
    invoiceType: 'Rent',
    invoiceAmount: 1050,
    paidAmount: 1020,
    lateFeeAmount: 50,
    paidLateFeeAmount: 20,
    remainingLateFeeAmount: 30,
    isLateFeeRemoved: false,
    isLateFeeEdited: false,
    lines: [{ lineId: '9a1b2c3d-0000-4000-8000-000000000001', description: 'Late fee charges', quantity: 2, rate: 25, amount: 50 }]
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LateFeePanelComponent, HttpClientTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(LateFeePanelComponent);
    component = fixture.componentInstance;
    component.invoiceId = invoiceId;
    component.invoiceStatus = 'not_received';
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Opens the panel and answers its read with `body`. */
  function open(body: LateFeeSummaryResponse = partPaid): void {
    fixture.detectChanges();
    httpMock.expectOne(url).flush(body);
    fixture.detectChanges();
  }

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector) as HTMLElement | null)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  it('reads the late fee of its invoice when it opens', () => {
    fixture.detectChanges();

    const request = httpMock.expectOne(url);
    expect(request.request.method).toBe('GET');
    request.flush(partPaid);
  });

  it('shows the type, the due date and every figure (FR 3)', () => {
    open();

    const figures = text('.late-fee-figures');
    expect(figures).toContain('Rent');
    expect(figures).toContain('2026-08-01');
    expect(figures).toContain('$1,050.00');
    expect(figures).toContain('$1,020.00');
    expect(figures).toContain('$50.00');
    expect(figures).toContain('$20.00');
    expect(figures).toContain('$30.00');
  });

  it('shows each late fee line with its description, quantity, rate and amount (FR 3)', () => {
    open();

    const rows = fixture.nativeElement.querySelectorAll('.late-fee-lines tbody tr');
    expect(rows.length).toBe(1);
    const cells = Array.from(rows[0].querySelectorAll('td')).map((cell) => (cell as HTMLElement).textContent?.trim());
    expect(cells).toEqual(['Late fee charges', '2', '$25.00', '$50.00']);
  });

  it('shows neither mark while late fees still apply, and each mark once set (FR 3)', () => {
    open();
    expect(fixture.nativeElement.querySelector('.mark-removed')).toBeNull();
    expect(fixture.nativeElement.querySelector('.mark-edited')).toBeNull();

    component.summary.set({ ...partPaid, isLateFeeRemoved: true, isLateFeeEdited: true });
    fixture.detectChanges();

    expect(text('.mark-removed')).toContain('Late fee removed');
    expect(text('.mark-edited')).toContain('Late fee edited');
  });

  it('reads an invoice with no late fee as zeros and no lines, not as an error (FR 4)', () => {
    open({
      ...partPaid,
      paidAmount: 0,
      lateFeeAmount: 0,
      paidLateFeeAmount: 0,
      remainingLateFeeAmount: 0,
      lines: []
    });

    expect(text('.late-fee-empty')).toBe('No late fee lines');
    expect(fixture.nativeElement.querySelector('.late-fee-lines')).toBeNull();
    expect(component.error()).toBeNull();
  });

  it('renders a refusal\'s detail verbatim, with its status, and no figures (FR 13)', () => {
    fixture.detectChanges();
    httpMock.expectOne(url).flush(
      { errorCode: 'invoice.not_found', detail: 'No invoice with that id exists.' },
      { status: 404, statusText: 'Not Found' }
    );
    fixture.detectChanges();

    expect(text('.late-fee-error')).toBe('404 — No invoice with that id exists.');
    expect(fixture.nativeElement.querySelector('.late-fee-figures')).toBeNull();
  });

  it('closes on the close button and on the overlay', () => {
    open();
    const closed = jasmine.createSpy('closed');
    component.closed.subscribe(closed);

    (fixture.nativeElement.querySelector('.close-btn') as HTMLElement).click();
    (fixture.nativeElement.querySelector('.panel-overlay') as HTMLElement).click();

    expect(closed).toHaveBeenCalledTimes(2);
  });
  describe('Remove late fee (FR 5 to FR 7, FR 12)', () => {
    /** What the late fee reads once the removal has reached the invoice: only the paid part. */
    const removed: LateFeeSummaryResponse = {
      ...partPaid,
      invoiceAmount: 1020,
      lateFeeAmount: 20,
      remainingLateFeeAmount: 0,
      isLateFeeRemoved: true,
      lines: [{ lineId: '9a1b2c3d-0000-4000-8000-000000000002', description: 'LateFeeCharges', quantity: 1, rate: 20, amount: 20 }]
    };

    /** The marks have moved, the figures not yet: the reconcile has not run. */
    const notYet: LateFeeSummaryResponse = { ...partPaid, isLateFeeRemoved: true };

    function button(label: string): HTMLButtonElement | undefined {
      return Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
        (candidate) => candidate.textContent!.trim() === label
      );
    }

    function confirmRemoval(): void {
      button('Remove late fee')!.click();
      fixture.detectChanges();
      button('Remove')!.click();
      fixture.detectChanges();
    }

    it('is offered on an open invoice and absent on a voided or a deleted one (FR 5)', () => {
      open();
      expect(button('Remove late fee')).toBeDefined();

      ['voided', 'deleted'].forEach((status) => {
        component.invoiceStatus = status;
        fixture.detectChanges();
        expect(button('Remove late fee')).toBeUndefined();
      });
    });

    it('asks first, naming the unpaid part it removes and the paid part it keeps (FR 6)', () => {
      open();

      button('Remove late fee')!.click();
      fixture.detectChanges();

      const question = text('.late-fee-confirm');
      expect(question).toContain('$30.00');
      expect(question).toContain('$20.00');
      expect(question).toContain('no further late fee');
      httpMock.expectNone(url);
    });

    it('sends nothing when the user keeps the late fee', () => {
      open();

      button('Remove late fee')!.click();
      fixture.detectChanges();
      button('Keep')!.click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.late-fee-confirm')).toBeNull();
      httpMock.expectNone((r) => r.method === 'DELETE');
    });

    it('removes once on confirm, tells the list, and re-reads until only the paid part is left (FR 7, FR 12)', fakeAsync(() => {
      open();
      const changed = jasmine.createSpy('changed');
      component.changed.subscribe(changed);

      confirmRemoval();
      const removal = httpMock.expectOne((r) => r.url === url && r.method === 'DELETE');
      removal.flush(null, { status: 204, statusText: 'No Content' });
      expect(changed).toHaveBeenCalledTimes(1);

      tick(1000);
      httpMock.expectOne((r) => r.url === url && r.method === 'GET').flush(notYet);
      tick(1000);
      httpMock.expectOne((r) => r.url === url && r.method === 'GET').flush(removed);
      fixture.detectChanges();

      tick(5000);
      httpMock.expectNone(url);
      expect(component.summary()).toEqual(removed);
      expect(fixture.nativeElement.querySelector('.late-fee-stale')).toBeNull();
    }));

    it('does not wait when nothing was unpaid: the amount it leaves is the amount it reads (FR 12)', fakeAsync(() => {
      open({ ...partPaid, invoiceAmount: 1050, paidAmount: 1050, paidLateFeeAmount: 50, remainingLateFeeAmount: 0 });

      confirmRemoval();
      httpMock.expectOne((r) => r.method === 'DELETE').flush(null, { status: 204, statusText: 'No Content' });

      tick(1000);
      httpMock.expectOne((r) => r.method === 'GET').flush({ ...partPaid, paidLateFeeAmount: 50, remainingLateFeeAmount: 0, isLateFeeRemoved: true });
      tick(5000);
      httpMock.expectNone(url);
    }));

    it('stops after ten reads that never catch up, and offers Refresh (FR 12)', fakeAsync(() => {
      open();

      confirmRemoval();
      httpMock.expectOne((r) => r.method === 'DELETE').flush(null, { status: 204, statusText: 'No Content' });
      for (let read = 0; read < 10; read++) {
        tick(1000);
        httpMock.expectOne((r) => r.method === 'GET').flush(notYet);
      }
      fixture.detectChanges();

      tick(5000);
      httpMock.expectNone(url);
      expect(text('.late-fee-stale')).toContain('The invoice has not caught up yet');

      button('Refresh')!.click();
      httpMock.expectOne((r) => r.method === 'GET').flush(removed);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.late-fee-stale')).toBeNull();
    }));

    it('stops reading once the panel is gone (FR 12)', fakeAsync(() => {
      open();

      confirmRemoval();
      httpMock.expectOne((r) => r.method === 'DELETE').flush(null, { status: 204, statusText: 'No Content' });
      fixture.destroy();

      tick(10000);
      httpMock.expectNone(url);
      discardPeriodicTasks();
    }));

    it('renders a refusal\'s detail and leaves the figures as they were (FR 13)', () => {
      [
        { status: 409, statusText: 'Conflict', detail: 'The agreement was changed by another request.' },
        { status: 422, statusText: 'Unprocessable Entity', detail: 'A voided or deleted invoice keeps its late fee.' },
        { status: 422, statusText: 'Unprocessable Entity', detail: 'Only late fees would remain on an invoice that has taken money.' }
      ].forEach((refusal, attempt) => {
        if (attempt === 0) {
          open();
        }

        confirmRemoval();
        httpMock.expectOne((r) => r.method === 'DELETE').flush({ detail: refusal.detail }, refusal);
        fixture.detectChanges();

        expect(text('.late-fee-error')).toBe(`${refusal.status} — ${refusal.detail}`);
        expect(component.summary()).toEqual(partPaid);
      });
    });
  });
  describe('Apply a late fee list (FR 8 to FR 11)', () => {
    function button(label: string): HTMLButtonElement | undefined {
      return Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
        (candidate) => candidate.textContent!.trim() === label
      );
    }

    /** Opens the form with one line set to `line`. */
    function openForm(line: Partial<{ lineKey: string; description: string; quantity: number; rate: number }> = {}): void {
      open();
      button('Apply a late fee list')!.click();
      fixture.detectChanges();
      component.addLine();
      component.lines.at(0).setValue({ lineKey: 'flat', description: 'Late fee', quantity: 2, rate: 25, ...line });
      fixture.detectChanges();
    }

    function send(): void {
      button('Send')!.click();
      fixture.detectChanges();
    }

    function problems(): string[] {
      return Array.from(fixture.nativeElement.querySelectorAll('.late-fee-form-problems li')).map((item) =>
        (item as HTMLElement).textContent!.trim()
      );
    }

    it('is offered on an open invoice and absent on a voided or a deleted one (FR 5)', () => {
      open();
      expect(button('Apply a late fee list')).toBeDefined();

      component.invoiceStatus = 'voided';
      fixture.detectChanges();
      expect(button('Apply a late fee list')).toBeUndefined();
    });

    it('starts the calculation time as now, in ISO 8601 UTC, and lets it be edited (FR 9)', () => {
      const before = Date.now();
      openForm();

      const value = component.applyForm.controls.calculatedAtUtc.value;
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(Date.parse(value)).toBeGreaterThanOrEqual(before - 1000);

      component.applyForm.controls.calculatedAtUtc.setValue('2026-01-01T00:00:00Z');
      expect(component.problems()).toEqual([]);
    });

    it('works each amount out as quantity × rate, and offers no field to type it (FR 8)', () => {
      openForm({ quantity: 3, rate: 10.25 });

      expect(text('.late-fee-line-amount')).toBe('$30.75');
      expect(fixture.nativeElement.querySelector('.late-fee-form input[formControlName="amount"]')).toBeNull();
    });

    it('sends the list with each amount worked out, and shows an applied answer (FR 8, FR 11)', fakeAsync(() => {
      openForm({ quantity: 2, rate: 25 });
      component.applyForm.controls.calculatedAtUtc.setValue('2026-08-20T06:00:00.000Z');
      const changed = jasmine.createSpy('changed');
      component.changed.subscribe(changed);

      send();
      const put = httpMock.expectOne((r) => r.url === url && r.method === 'PUT');
      expect(put.request.body).toEqual({
        calculatedAtUtc: '2026-08-20T06:00:00.000Z',
        lines: [{ lineKey: 'flat', description: 'Late fee', quantity: 2, rate: 25, amount: 50 }]
      });
      put.flush({ outcome: 'applied', skipReason: null, linesChanged: true });
      fixture.detectChanges();

      expect(text('.late-fee-outcome')).toBe('Applied: lines changed');
      expect(changed).toHaveBeenCalledTimes(1);

      // FR 12 — the list's total is what the late fee will read.
      tick(1000);
      httpMock.expectOne((r) => r.method === 'GET').flush({ ...partPaid, lateFeeAmount: 50 });
      tick(5000);
      httpMock.expectNone(url);
    }));

    it('says when an applied list changed no line, and does not wait', fakeAsync(() => {
      openForm();

      send();
      httpMock.expectOne((r) => r.method === 'PUT').flush({ outcome: 'applied', skipReason: null, linesChanged: false });
      fixture.detectChanges();
      tick(5000);

      expect(text('.late-fee-outcome')).toBe('Applied: no line changed');
      httpMock.expectNone(url);
    }));

    it('sends an empty list as lines: [], which removes every keyed late fee line', () => {
      open();
      button('Apply a late fee list')!.click();
      fixture.detectChanges();

      send();
      const put = httpMock.expectOne((r) => r.method === 'PUT');
      expect(put.request.body.lines).toEqual([]);
      put.flush({ outcome: 'skipped', skipReason: 'older_calculation', linesChanged: false });
    });

    const skipWords: [string, string][] = [
      ['unknown_invoice', 'no such invoice for this owner'],
      ['invoice_withdrawn', 'the invoice is voided or deleted'],
      ['rent_agreement_not_found', 'its rent agreement was not found'],
      ['rent_agreement_archived', 'its rent agreement is archived'],
      ['proposal_ended', 'its billing plan entry has ended'],
      ['deposit_invoice', 'a deposit invoice takes no late fee'],
      ['late_fee_removed', 'late fees are stopped on this invoice'],
      ['paid_in_full', 'the invoice is paid in full'],
      ['older_calculation', 'a newer calculation was already applied']
    ];
    skipWords.forEach(([reason, words]) => {
      it(`shows a skip for ${reason} as "${words}" (FR 11)`, () => {
        openForm();

        send();
        httpMock.expectOne((r) => r.method === 'PUT').flush({ outcome: 'skipped', skipReason: reason, linesChanged: false });
        fixture.detectChanges();

        expect(text('.late-fee-outcome')).toBe(`Skipped: ${words}`);
      });
    });

    const refusals: [string, Partial<{ lineKey: string; description: string; quantity: number; rate: number }>, string][] = [
      ['a blank key', { lineKey: '   ' }, 'needs a key'],
      ['a 101-character key', { lineKey: 'k'.repeat(101) }, 'at most 100 characters'],
      ['a blank description', { description: ' ' }, 'needs a description'],
      ['a 201-character description', { description: 'd'.repeat(201) }, 'at most 200 characters'],
      ['a quantity of 1.5', { quantity: 1.5 }, 'whole number from 1 to 9,999,999,999'],
      ['a quantity of 0', { quantity: 0 }, 'whole number from 1 to 9,999,999,999'],
      ['a quantity of 10000000000', { quantity: 10000000000, rate: 0.01 }, 'whole number from 1 to 9,999,999,999'],
      ['a rate of 0', { rate: 0 }, 'greater than 0'],
      ['a rate of 10.001', { rate: 10.001 }, 'at most 2 decimals'],
      ['a rate of 1000000000000', { rate: 1000000000000, quantity: 1 }, 'at most 999,999,999,999.99'],
      ['an amount over its limit', { quantity: 2, rate: 999999999999.99 }, 'amount is over 999,999,999,999.99']
    ];
    refusals.forEach(([name, line, words]) => {
      it(`refuses ${name} before sending anything (FR 10)`, () => {
        openForm(line);

        send();

        expect(problems().join(' | ')).toContain(words);
        httpMock.expectNone((r) => r.method === 'PUT');
      });
    });

    it('refuses two lines with one key, ignoring the spaces around it (FR 10)', () => {
      openForm();
      component.addLine();
      component.lines.at(1).setValue({ lineKey: ' flat ', description: 'Another', quantity: 1, rate: 10 });

      send();

      expect(problems().join(' | ')).toContain('Each key may appear once');
      httpMock.expectNone((r) => r.method === 'PUT');
    });

    it('refuses a calculation time that is not a date and time (FR 9)', () => {
      openForm();
      component.applyForm.controls.calculatedAtUtc.setValue('yesterday');

      send();

      expect(problems().join(' | ')).toContain('ISO 8601');
      httpMock.expectNone((r) => r.method === 'PUT');
    });

    it('renders a 400 refusal\'s detail verbatim (FR 13)', () => {
      openForm();

      send();
      httpMock.expectOne((r) => r.method === 'PUT').flush(
        { detail: 'A late fee line amount must be exactly its quantity × rate.' },
        { status: 400, statusText: 'Bad Request' }
      );
      fixture.detectChanges();

      expect(text('.late-fee-error')).toBe('400 — A late fee line amount must be exactly its quantity × rate.');
    });
  });
});
