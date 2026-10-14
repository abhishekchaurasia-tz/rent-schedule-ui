import { HttpClientTestingModule, HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { toIsoDate } from '../shared/date.util';
import {
  PREVIEW_DEBOUNCE_MS,
  RecordPaymentConfirmation,
  RecordPaymentFieldMessages,
  RecordPaymentPanelComponent
} from './record-payment-panel.component';
import {
  OfflinePaymentContextResponse,
  OfflinePaymentPreviewResponse,
  OfflinePaymentSubmittedResponse,
  RecordOfflinePaymentRequest
} from './record-payment.models';
import { RecordPaymentMessages, SUBMISSION_UNCONFIRMED } from './record-payment.service';

/** Covers FR 1 – FR 18 of `11-record-payment-ui.md` v1 — the panel's layout, lines, checks, preview and submission. */
describe('RecordPaymentPanelComponent', () => {
  let fixture: ComponentFixture<RecordPaymentPanelComponent>;
  let component: RecordPaymentPanelComponent;
  let httpMock: HttpTestingController;
  let recorded: OfflinePaymentSubmittedResponse[];
  let closed: number;

  const invoiceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const nextId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const laterId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const geetika = '11111111-1111-1111-1111-111111111111';
  const pandit = '22222222-2222-2222-2222-222222222222';

  const invoicesUrl = `${environment.apiBaseUrl}/api/v1/invoices`;
  const contextUrl = `${invoicesUrl}/${invoiceId}/offline-payment`;
  const previewUrl = `${invoicesUrl}/${invoiceId}/offline-payments/preview`;
  const submitUrl = `${invoicesUrl}/${invoiceId}/offline-payments`;
  const today = toIsoDate(new Date())!;

  /** Billing spec 18's worked example: $190 net of a credit, $5 paid by Geetika, two tenants. */
  const context: OfflinePaymentContextResponse = {
    invoiceId,
    invoiceNumber: 'INV-102026-000101',
    total: 190,
    paid: 5,
    payable: 185,
    tenants: [
      { tenantId: geetika, name: 'Geetika Shukla', share: 95, paid: 5, suggestedAmount: 90 },
      { tenantId: pandit, name: 'Pandit Yeman', share: 95, paid: 0, suggestedAmount: 95 }
    ],
    methods: ['cash', 'check', 'money_order']
  };

  const withinBalance: OfflinePaymentPreviewResponse = {
    totalEntered: 90,
    payable: 185,
    excess: 0,
    maxPayable: 585,
    exceedsPayable: false,
    message: null,
    allocations: [
      { invoiceId, invoiceNumber: 'INV-102026-000101', dueDate: '2026-10-09', payableBefore: 185, applied: 90, payableAfter: 95, slices: [] }
    ]
  };

  /** Geetika pays $400 cash: $185 here, $200 on the November invoice, $15 on December's. */
  const withExcess: OfflinePaymentPreviewResponse = {
    totalEntered: 400,
    payable: 185,
    excess: 215,
    maxPayable: 585,
    exceedsPayable: false,
    message: null,
    allocations: [
      { invoiceId, invoiceNumber: 'INV-102026-000101', dueDate: '2026-10-09', payableBefore: 185, applied: 185, payableAfter: 0, slices: [] },
      { invoiceId: nextId, invoiceNumber: 'INV-112026-000102', dueDate: '2026-11-02', payableBefore: 200, applied: 200, payableAfter: 0, slices: [] },
      { invoiceId: laterId, invoiceNumber: 'INV-122026-000103', dueDate: '2026-12-02', payableBefore: 200, applied: 15, payableAfter: 185, slices: [] }
    ]
  };

  const exceeding: OfflinePaymentPreviewResponse = {
    totalEntered: 600,
    payable: 185,
    excess: 415,
    maxPayable: 585,
    exceedsPayable: true,
    message: 'There are no other unpaid or future invoices, therefore, you cannot enter an amount greater than $585.00.',
    allocations: []
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordPaymentPanelComponent, HttpClientTestingModule]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RecordPaymentPanelComponent);
    component = fixture.componentInstance;
    component.invoiceId = invoiceId;
    recorded = [];
    closed = 0;
    component.recorded.subscribe((response) => recorded.push(response));
    component.closed.subscribe(() => closed++);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function page(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string {
    return page().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  /** Opens the panel and answers both reads; the empty line's preview check settles with nothing sent. */
  function open(body: OfflinePaymentContextResponse = context, subject: string | null = 'Rent due on October 9, 2026'): void {
    fixture.detectChanges();
    httpMock.expectOne(contextUrl).flush(body);
    const detail = httpMock.expectOne(`${invoicesUrl}/${invoiceId}`);
    if (subject === null) {
      detail.flush({ detail: 'nope' }, { status: 500, statusText: 'Server Error' });
    } else {
      detail.flush({ invoiceId, lines: [{ description: subject }] });
    }
    fixture.detectChanges();
    tick(PREVIEW_DEBOUNCE_MS);
  }

  function chooseTenant(tenantId: string): void {
    const select = page().querySelector('.payment-line select') as HTMLSelectElement;
    select.value = tenantId;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function fill(index: number, values: { method?: string; checkNumber?: string; paidOn?: Date | null; amount?: number | null }): void {
    component.lines.at(index).patchValue(values as never);
    fixture.detectChanges();
  }

  /** Waits out the debounce and returns the preview it sent. */
  function previewSent(): TestRequest {
    tick(PREVIEW_DEBOUNCE_MS);
    return httpMock.expectOne(previewUrl);
  }

  /** Geetika, cash, the suggested $90, today — and its preview answered. */
  function readyToSubmit(answer: OfflinePaymentPreviewResponse = withinBalance): void {
    chooseTenant(geetika);
    fill(0, { method: 'cash' });
    previewSent().flush(answer);
    fixture.detectChanges();
  }

  function button(label: string): HTMLButtonElement {
    return Array.from(page().querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === label
    ) as HTMLButtonElement;
  }

  function labels(): string[] {
    return Array.from(page().querySelectorAll('.payment-line .label')).map((label) => label.textContent!.replace(/\s+/g, ' ').trim());
  }

  describe('opening (FR 1, FR 2)', () => {
    it('reads the context and the invoice, and shows the summary as the owner app does', fakeAsync(() => {
      open();

      expect(text('.panel-head h2')).toBe('RECORD PAYMENT');
      expect(text('.summary h3')).toBe('INVOICE SUMMARY');
      const headers = Array.from(page().querySelectorAll('.summary-table th')).map((th) => th.textContent!.trim());
      expect(headers).toEqual(['ID', 'SUBJECT', 'DUE', 'PAID', 'BALANCE']);
      const cells = Array.from(page().querySelectorAll('.summary-table td')).map((td) => td.textContent!.trim());
      expect(cells).toEqual(['INV-102026-000101', 'Rent due on October 9, 2026', '$190.00', '$5.00', '$185.00']);
    }));

    it('reads the subject as a dash when the invoice read fails, and nothing else changes', fakeAsync(() => {
      open(context, null);

      expect(text('.summary-table .subject')).toBe('—');
      expect(page().querySelectorAll('.payment-line').length).toBe(1);
    }));

    it('shows a refused context with its sentence and code, and no form', fakeAsync(() => {
      fixture.detectChanges();
      httpMock
        .expectOne(contextUrl)
        .flush({ detail: 'Nothing is left to pay on this invoice.', errorCode: 'record_payment.nothing_to_pay' }, { status: 422, statusText: 'Unprocessable Entity' });
      httpMock.expectOne(`${invoicesUrl}/${invoiceId}`).flush({ lines: [] });
      fixture.detectChanges();

      expect(text('.load-error')).toContain(RecordPaymentMessages['record_payment.nothing_to_pay']);
      expect(text('.load-error')).toContain('record_payment.nothing_to_pay');
      expect(page().querySelector('.payment-line')).toBeNull();
      expect(button('Submit').disabled).toBeTrue();
    }));
  });

  describe('the tenant and the method (FR 3 – FR 6)', () => {
    it('asks for a tenant first, then offers the methods; date and amount wait for a method', fakeAsync(() => {
      open();

      expect(labels()).toEqual(['Tenant']);
      expect(text('.payment-line select')).toContain('Select Tenant');

      chooseTenant(pandit);
      expect(labels()).toEqual(['Tenant', 'Payment Method']);
      const methods = Array.from(page().querySelectorAll('select[aria-label="Payment Method"] option')).map((o) => o.textContent!.trim());
      expect(methods).toEqual(['Select Payment Method', 'Cash', 'Check', 'Money Order']);

      fill(0, { method: 'cash' });
      expect(labels()).toEqual(['Tenant', 'Payment Method', 'Submission Date*', 'Amount Paid *']);
      previewSent().flush(withinBalance);
    }));

    it('fills the chosen tenant\'s suggested amount and today\'s date', fakeAsync(() => {
      open();

      chooseTenant(pandit);
      expect(component.lines.at(0).controls.amount.value).toBe(95);
      chooseTenant(geetika);
      expect(component.lines.at(0).controls.amount.value).toBe(90);
      expect(toIsoDate(component.lines.at(0).controls.paidOn.value)).toBe(today);
      tick(PREVIEW_DEBOUNCE_MS);
    }));

    it('starts with the tenant chosen when the invoice has only one', fakeAsync(() => {
      open({ ...context, tenants: [context.tenants[1]] });

      expect(component.tenantId).toBe(pandit);
      expect(component.lines.at(0).controls.amount.value).toBe(95);
      expect(labels()).toContain('Payment Method');
    }));

    it('names a tenant Billing has no name for with the app\'s stand-in', fakeAsync(() => {
      open({ ...context, tenants: [{ ...context.tenants[0], name: '' }, context.tenants[1]] });

      const first = page().querySelectorAll('.payment-line select option')[1].textContent!.trim();
      expect(first).not.toBe('');
      expect(first).not.toBe(geetika);
    }));

    it('shows Check Number for a check, Money Order Number for a money order and neither for cash', fakeAsync(() => {
      open();
      chooseTenant(geetika);

      fill(0, { method: 'check' });
      expect(labels()).toContain('Check Number');
      fill(0, { method: 'money_order', checkNumber: 'Abc' });
      expect(labels()).toContain('Money Order Number');
      expect(labels()).not.toContain('Check Number');

      fill(0, { method: 'cash' });
      expect(labels()).not.toContain('Money Order Number');
      expect(component.lines.at(0).controls.checkNumber.value).toBe('');
      previewSent().flush(withinBalance);
    }));

    it('caps the number at 24 characters and offers no day after today', fakeAsync(() => {
      open();
      chooseTenant(geetika);
      fill(0, { method: 'check' });

      expect((page().querySelector('input[aria-label="Check Number"]') as HTMLInputElement).maxLength).toBe(24);
      expect(toIsoDate(component.today)).toBe(today);
      previewSent().flush(withinBalance);
    }));
  });

  describe('more than one line (FR 7, FR 8)', () => {
    it('adds a line only once the last one has a method and an amount', fakeAsync(() => {
      open();
      chooseTenant(geetika);
      expect(button('+ Add Additional Payment').disabled).toBeTrue();

      fill(0, { method: 'cash', amount: null });
      expect(button('+ Add Additional Payment').disabled).toBeTrue();
      component.addPayment();
      expect(component.lines.length).toBe(1);

      fill(0, { amount: 4 });
      previewSent().flush(withinBalance);
      fixture.detectChanges();
      expect(button('+ Add Additional Payment').disabled).toBeFalse();
    }));

    it('locks the new line to line 1\'s tenant, copies its date, and starts its method and amount empty', fakeAsync(() => {
      open();
      readyToSubmit();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      fill(0, { paidOn: yesterday, amount: 4 });
      previewSent().flush(withinBalance);

      button('+ Add Additional Payment').click();
      fixture.detectChanges();

      const second = component.lines.at(1);
      expect(component.lines.length).toBe(2);
      expect(second.controls.tenantId.disabled).toBeTrue();
      expect(second.controls.tenantId.value).toBe(geetika);
      expect((page().querySelectorAll('.payment-line')[1].querySelector('select') as HTMLSelectElement).disabled).toBeTrue();
      expect(toIsoDate(second.controls.paidOn.value)).toBe(toIsoDate(yesterday));
      expect(second.controls.method.value).toBe('');
      expect(second.controls.amount.value).toBeNull();
      tick(PREVIEW_DEBOUNCE_MS);
    }));

    it('puts Remove on every line but the first, and Remove drops that line', fakeAsync(() => {
      open();
      readyToSubmit();
      component.addPayment();
      fill(1, { method: 'money_order', checkNumber: 'Abc', amount: 3 });
      previewSent().flush(withinBalance);
      component.addPayment();
      fixture.detectChanges();
      tick(PREVIEW_DEBOUNCE_MS);

      const blocks = page().querySelectorAll('.payment-line');
      expect(blocks.length).toBe(3);
      expect(blocks[0].querySelector('.remove-link')).toBeNull();
      expect(blocks[1].querySelector('.remove-link')?.textContent?.trim()).toBe('Remove');

      (blocks[2].querySelector('.remove-link') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(component.lines.length).toBe(2);
      component.removePayment(0);
      expect(component.lines.length).toBe(2);
      previewSent().flush(withinBalance);
    }));

    it('goes back to one line when line 1\'s tenant changes, with the new tenant\'s amount', fakeAsync(() => {
      open();
      readyToSubmit();
      component.addPayment();
      tick(PREVIEW_DEBOUNCE_MS);
      fixture.detectChanges();
      expect(component.lines.length).toBe(2);

      chooseTenant(pandit);

      expect(component.lines.length).toBe(1);
      expect(component.lines.at(0).controls.amount.value).toBe(95);
      expect(component.preview()).toBeNull();
      previewSent().flush(withinBalance);
    }));
  });

  describe('field checks (FR 9)', () => {
    it('shows nothing before the first press, then Required on each empty field, and sends nothing', fakeAsync(() => {
      open();
      expect(page().querySelector('.field-error')).toBeNull();

      button('Submit').click();
      fixture.detectChanges();
      expect(text('.field-error')).toBe(RecordPaymentFieldMessages.required);

      chooseTenant(geetika);
      fill(0, { method: 'cash', amount: null, paidOn: null });
      tick(PREVIEW_DEBOUNCE_MS);
      const errors = Array.from(page().querySelectorAll('.field-error')).map((e) => e.textContent!.trim());
      expect(errors).toEqual([RecordPaymentFieldMessages.required, RecordPaymentFieldMessages.required]);
      expect(component.confirming()).toBeFalse();
    }));

    it('refuses an amount of zero or less, and one with more than two decimals', fakeAsync(() => {
      open();
      chooseTenant(geetika);
      fill(0, { method: 'cash', amount: 0 });
      button('Submit').click();
      fixture.detectChanges();
      expect(text('.field-error')).toBe(RecordPaymentFieldMessages.amountPositive);

      fill(0, { amount: -5 });
      expect(text('.field-error')).toBe(RecordPaymentFieldMessages.amountPositive);

      fill(0, { amount: 1.234 });
      expect(text('.field-error')).toBe(RecordPaymentFieldMessages.amountDecimals);
      tick(PREVIEW_DEBOUNCE_MS);
    }));

    it('refuses a Submission Date after today and a number over 24 characters', fakeAsync(() => {
      open();
      chooseTenant(geetika);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      fill(0, { method: 'check', paidOn: tomorrow, checkNumber: 'x'.repeat(25) });
      button('Submit').click();
      fixture.detectChanges();

      const errors = Array.from(page().querySelectorAll('.field-error')).map((e) => e.textContent!.trim());
      expect(errors).toEqual([RecordPaymentFieldMessages.numberTooLong, RecordPaymentFieldMessages.futureDate]);
      tick(PREVIEW_DEBOUNCE_MS);
    }));
  });

  describe('the preview (FR 10 – FR 12)', () => {
    it('posts the tenant and the lines 350 ms after the last change, and not before', fakeAsync(() => {
      open();
      chooseTenant(geetika);
      fill(0, { method: 'check', checkNumber: ' 1042 ', amount: 400 });

      tick(PREVIEW_DEBOUNCE_MS - 1);
      httpMock.expectNone(previewUrl);
      tick(1);
      const request = httpMock.expectOne(previewUrl);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        tenantId: geetika,
        payments: [{ method: 'check', amount: 400, paidOn: today, checkNumber: '1042' }]
      });
      request.flush(withExcess);
    }));

    it('sends one preview for a burst of changes, with the last values, and drops a stale answer', fakeAsync(() => {
      open();
      readyToSubmit();

      fill(0, { amount: 100 });
      tick(100);
      fill(0, { amount: 400 });
      const first = previewSent();
      expect(first.request.body.payments[0].amount).toBe(400);

      fill(0, { amount: 401 });
      const second = previewSent();
      expect(first.cancelled).toBeTrue();
      second.flush(withExcess);
      fixture.detectChanges();
      expect(component.preview()).toEqual(withExcess);
    }));

    it('shows the excess and the other invoices it goes to, the current one left out', fakeAsync(() => {
      open();
      chooseTenant(geetika);
      fill(0, { method: 'cash', amount: 400 });
      previewSent().flush(withExcess);
      fixture.detectChanges();

      expect(text('.excess-box p')).toBe(
        'You entered an amount greater than the balance due. The excess amount of $215.00 will be applied on the following invoices.'
      );
      const headers = Array.from(page().querySelectorAll('.excess-table th')).map((th) => th.textContent!.trim());
      expect(headers).toEqual(['ID', 'DUE ON', 'AMOUNT', 'PAID', 'BALANCE']);
      const rows = Array.from(page().querySelectorAll('.excess-row')).map((row) =>
        Array.from(row.querySelectorAll('td')).map((td) => td.textContent!.trim())
      );
      expect(rows).toEqual([
        ['INV-112026-000102', 'Nov 2, 2026', '$200.00', '$200.00', '$0.00'],
        ['INV-122026-000103', 'Dec 2, 2026', '$200.00', '$15.00', '$185.00']
      ]);
    }));

    it('shows no excess box while the payment fits the invoice', fakeAsync(() => {
      open();
      readyToSubmit(withinBalance);

      expect(page().querySelector('.excess-box')).toBeNull();
      expect(button('Submit').disabled).toBeFalse();
    }));

    it('shows the server\'s sentence when the total is too high and blocks Submit and Add Additional Payment', fakeAsync(() => {
      open();
      chooseTenant(geetika);
      fill(0, { method: 'cash', amount: 600 });
      previewSent().flush(exceeding);
      fixture.detectChanges();

      expect(text('.exceeds-message')).toBe(exceeding.message!);
      expect(page().querySelector('.excess-box')).toBeNull();
      expect(button('Submit').disabled).toBeTrue();
      expect(button('+ Add Additional Payment').disabled).toBeTrue();
      component.submit();
      expect(component.confirming()).toBeFalse();

      fill(0, { amount: 585 });
      previewSent().flush({ ...withExcess, totalEntered: 585, excess: 400 });
      fixture.detectChanges();
      expect(page().querySelector('.exceeds-message')).toBeNull();
      expect(button('Submit').disabled).toBeFalse();
    }));

    it('holds Submit while a preview waits or is in flight', fakeAsync(() => {
      open();
      chooseTenant(geetika);
      fill(0, { method: 'cash' });

      expect(button('Submit').disabled).toBeTrue();
      const request = previewSent();
      fixture.detectChanges();
      expect(button('Submit').disabled).toBeTrue();
      request.flush(withinBalance);
      fixture.detectChanges();
      expect(button('Submit').disabled).toBeFalse();
    }));

    it('clears the preview, sending nothing, once a line no longer passes the checks', fakeAsync(() => {
      open();
      chooseTenant(geetika);
      fill(0, { method: 'cash', amount: 400 });
      previewSent().flush(withExcess);

      fill(0, { amount: null });
      tick(PREVIEW_DEBOUNCE_MS);
      fixture.detectChanges();

      httpMock.expectNone(previewUrl);
      expect(component.preview()).toBeNull();
      expect(page().querySelector('.excess-box')).toBeNull();
    }));

    it('shows a failed preview under the lines without blocking Submit', fakeAsync(() => {
      open();
      chooseTenant(geetika);
      fill(0, { method: 'cash' });
      previewSent().flush(
        { detail: 'x', errorCode: 'record_payment.payment_service_unavailable' },
        { status: 502, statusText: 'Bad Gateway' }
      );
      fixture.detectChanges();

      expect(text('.preview-error')).toContain(RecordPaymentMessages['record_payment.payment_service_unavailable']);
      expect(button('Submit').disabled).toBeFalse();
    }));
  });

  describe('submitting (FR 13 – FR 17)', () => {
    function confirmYes(): void {
      button('Yes').click();
      fixture.detectChanges();
    }

    it('asks the owner app\'s review question; No sends nothing', fakeAsync(() => {
      open();
      readyToSubmit();

      button('Submit').click();
      fixture.detectChanges();
      expect(text('.confirm-box p')).toBe(RecordPaymentConfirmation);

      button('No').click();
      fixture.detectChanges();
      expect(page().querySelector('.confirm-box')).toBeNull();
      httpMock.expectNone(submitUrl);
    }));

    it('posts every line in order with this opening\'s submission id, and reports the 202', fakeAsync(() => {
      open();
      chooseTenant(geetika);
      fill(0, { method: 'cash', amount: 4 });
      previewSent().flush(withinBalance);
      component.addPayment();
      fill(1, { method: 'money_order', checkNumber: 'Abc', amount: 3 });
      previewSent().flush(withinBalance);
      fixture.detectChanges();

      button('Submit').click();
      fixture.detectChanges();
      confirmYes();

      const request = httpMock.expectOne(submitUrl);
      expect(request.request.method).toBe('POST');
      const body = request.request.body as RecordOfflinePaymentRequest;
      expect(body).toEqual({
        submissionId: component.submissionId,
        tenantId: geetika,
        payments: [
          { method: 'cash', amount: 4, paidOn: today },
          { method: 'money_order', amount: 3, paidOn: today, checkNumber: 'Abc' }
        ]
      });
      expect(body.submissionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(button('Submitting…').disabled).toBeTrue();

      const accepted: OfflinePaymentSubmittedResponse = { invoiceId, submissionId: body.submissionId, status: 'accepted', allocations: [] };
      request.flush(accepted, { status: 202, statusText: 'Accepted' });

      expect(recorded).toEqual([accepted]);
    }));

    it('warns that an unconfirmed payment may have been queued, and retries with the same submission id', fakeAsync(() => {
      open();
      readyToSubmit();

      button('Submit').click();
      fixture.detectChanges();
      confirmYes();
      const first = httpMock.expectOne(submitUrl);
      first.flush(
        { detail: 'The payment service did not confirm the payment.', errorCode: SUBMISSION_UNCONFIRMED },
        { status: 502, statusText: 'Bad Gateway' }
      );
      fixture.detectChanges();

      const banner = page().querySelector('.submit-error') as HTMLElement;
      expect(banner.classList).toContain('warn');
      expect(banner.textContent).toContain('may or may not have been recorded');
      expect(banner.textContent).toContain(RecordPaymentMessages[SUBMISSION_UNCONFIRMED]);
      expect(recorded).toEqual([]);

      button('Submit').click();
      fixture.detectChanges();
      confirmYes();
      const second = httpMock.expectOne(submitUrl);
      expect(second.request.body.submissionId).toBe(first.request.body.submissionId);
      second.flush({ invoiceId, submissionId: component.submissionId, status: 'accepted', allocations: [] }, { status: 202, statusText: 'Accepted' });
      expect(recorded.length).toBe(1);
    }));

    it('shows a refusal with the server\'s detail and code, and keeps what was typed', fakeAsync(() => {
      open();
      readyToSubmit();

      button('Submit').click();
      fixture.detectChanges();
      confirmYes();
      httpMock.expectOne(submitUrl).flush(
        {
          detail: 'Payment for this invoice has already been received or is in progress.',
          errorCode: 'record_payment.rejected_by_payment_service'
        },
        { status: 422, statusText: 'Unprocessable Entity' }
      );
      fixture.detectChanges();

      const banner = page().querySelector('.submit-error') as HTMLElement;
      expect(banner.classList).toContain('error');
      expect(banner.textContent).toContain('The payment was not recorded.');
      expect(banner.textContent).toContain('Payment for this invoice has already been received or is in progress.');
      expect(banner.textContent).toContain('record_payment.rejected_by_payment_service');
      expect(component.lines.at(0).controls.amount.value).toBe(90);
      expect(button('Submit').disabled).toBeFalse();
    }));

    it('mints a different submission id for each opening of the panel', () => {
      const other = TestBed.createComponent(RecordPaymentPanelComponent).componentInstance;

      expect(component.submissionId).not.toBe(other.submissionId);
    });
  });

  describe('closing (FR 18)', () => {
    it('closes from Cancel, the × and the overlay, with nothing sent', fakeAsync(() => {
      open();

      button('Cancel').click();
      (page().querySelector('.close-btn') as HTMLButtonElement).click();
      (page().querySelector('.panel-overlay') as HTMLElement).click();

      expect(closed).toBe(3);
      httpMock.expectNone(submitUrl);
    }));
  });
});
