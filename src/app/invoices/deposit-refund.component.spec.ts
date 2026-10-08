import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import { RequestScopeService } from '../request-scope.service';
import { placeholderTenantIdentity } from '../shared/tenant-identity.util';
import { DepositRefundComponent } from './deposit-refund.component';
import { CreateDepositRefundRequest, DepositRefundResponse, FundsReturnedRowResponse } from './deposit-refund.models';

/**
 * Covers FR 1–4 and 11–19 of `09-deposit-refund-ui.md` v1 — the page: the view, the action and its
 * gating, the outcome of a return, *Funds Returned* with its row actions, and the totals.
 * The panel's own rules (FR 5–10) are `return-deposit-panel.component.spec.ts`'s subject.
 */
describe('DepositRefundComponent', () => {
  let fixture: ComponentFixture<DepositRefundComponent>;
  let component: DepositRefundComponent;
  let httpMock: HttpTestingController;

  const invoiceId = '8f14e45f-ceea-467e-bd9f-000000000001';
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';
  const checkRefundId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const achRefundId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const cashRefundId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  const viewUrl = `${environment.apiBaseUrl}/api/v1/invoices/${invoiceId}/deposit-refund`;
  const createUrl = `${environment.apiBaseUrl}/api/v1/invoices/${invoiceId}/deposit-refunds`;

  const checkReturn: FundsReturnedRowResponse = {
    refundId: checkRefundId,
    tenantId: tenantA,
    payerName: 'Jordan Ellis',
    receivedOn: '2026-09-01T10:00:00+00:00',
    returnedOn: '2026-10-05T15:30:00+00:00',
    status: 'refunded',
    method: 'check',
    checkNumber: '1042',
    amountReturned: 12,
    canCancel: false,
    canRemove: true
  };

  const achReturn: FundsReturnedRowResponse = {
    ...checkReturn,
    refundId: achRefundId,
    tenantId: tenantB,
    payerName: null,
    receivedOn: null,
    returnedOn: '2026-10-06T09:00:00+00:00',
    status: 'initiated',
    method: 'ach',
    checkNumber: null,
    amountReturned: 5,
    canCancel: true,
    canRemove: false
  };

  const cashReturn: FundsReturnedRowResponse = {
    ...checkReturn,
    refundId: cashRefundId,
    status: 'processing',
    method: 'cash',
    checkNumber: null,
    amountReturned: 1,
    canCancel: false,
    canRemove: false
  };

  /** QA invoice 9556333's shape (backend BR-06): $21 deposit, $12 + $30 interest returned, $9 remains. */
  const view: DepositRefundResponse = {
    invoiceId,
    invoiceNumber: 'INV-102026-000501',
    isDepositInvoice: true,
    isFullyPaid: true,
    canRefundDeposit: true,
    isDepositRefundStarted: true,
    isDepositFullyRefunded: false,
    totals: { depositAmount: 21, totalPaid: 21, totalReturned: 12, depositInterest: 30, totalApplied: 0, remaining: 9 },
    tenants: [
      { tenantId: tenantA, name: 'Jordan Ellis', paid: 11, returned: 12, interestReturned: 30, held: -1 },
      { tenantId: tenantB, name: null, paid: 10, returned: 0, interestReturned: 0, held: 10 }
    ],
    fundsReturned: [checkReturn, achReturn, cashReturn]
  };

  const offlineRequest: CreateDepositRefundRequest = {
    mode: 'offline',
    returns: [{ tenantId: tenantB, method: 'check', checkNumber: '1043', amount: 9, interest: 0 }]
  };

  function problem(status: number, statusText: string, errorCode: string, detail: string) {
    return {
      body: { type: 'https://datatracker.ietf.org/doc/html/rfc9457', title: statusText, status, detail, errorCode },
      options: { status, statusText }
    };
  }

  async function create(queryParams: Record<string, string> = {}): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [DepositRefundComponent, HttpClientTestingModule],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DepositRefundComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  /** Loads `body` through the lookup box and renders it. */
  function loadView(body: DepositRefundResponse = view): void {
    component.invoiceIdInput.setValue(invoiceId);
    component.load();
    httpMock.expectOne(viewUrl).flush(body);
    fixture.detectChanges();
  }

  /**
   * Answers the owner-bank read the panel makes when it opens. merlin owns that list, so the panel
   * asks for it directly; these tests are about the deposit screen, not the list, so one empty answer
   * is enough to let the panel settle.
   */
  function answerOwnerBanks(): void {
    httpMock
      .match(`${environment.monolithBaseUrl}/Home/DropDown/GetPropertyOwnerBankDetails`)
      .forEach((request) => request.flush([]));
    fixture.detectChanges();
  }


  function page(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function refundButton(): HTMLButtonElement | null {
    return page().querySelector('.refund-action button');
  }

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  // ---- loading (FR 1, 2) -------------------------------------------------------------------------

  describe('loading', () => {
    beforeEach(async () => create());

    it('refuses a malformed id inline and issues no request', () => {
      component.invoiceIdInput.setValue('not-a-guid');
      component.load();

      expect(component.idError()).toContain('valid id');
      expect(component.view()).toBeNull();
    });

    it('refuses an empty id inline', () => {
      component.invoiceIdInput.setValue('   ');
      component.load();

      expect(component.idError()).toBe('Enter an invoice id.');
    });

    it('reports a 502 with its detail and code, and shows no figures in its place', () => {
      component.invoiceIdInput.setValue(invoiceId);
      component.load();

      const failure = problem(
        502,
        'Bad Gateway',
        'deposit_refund.payment_service_unavailable',
        'The deposit\'s payments and refunds could not be read from the payment service.'
      );
      httpMock.expectOne(viewUrl).flush(failure.body, failure.options);
      fixture.detectChanges();

      expect(component.loadError()?.code).toBe('deposit_refund.payment_service_unavailable');
      expect(page().textContent).toContain('could not be read from the payment service');
      expect(page().querySelector('.totals')).toBeNull();
      expect(page().querySelector('.funds-table')).toBeNull();
    });
  });

  it('loads the invoice named by ?invoiceId= on open', async () => {
    await create({ invoiceId });

    expect(component.invoiceIdInput.value).toBe(invoiceId);
    httpMock.expectOne(viewUrl).flush(view);

    expect(component.view()?.invoiceNumber).toBe('INV-102026-000501');
  });

  // ---- what the view says, and the action (FR 3, 4) ----------------------------------------------

  describe('the Refund Deposit action', () => {
    beforeEach(async () => create());

    it('says a non-deposit invoice is not one, and offers nothing else', () => {
      loadView({
        ...view,
        isDepositInvoice: false,
        isFullyPaid: true,
        canRefundDeposit: false,
        fundsReturned: [],
        tenants: []
      });

      expect(page().textContent).toContain('is not a deposit invoice');
      expect(refundButton()).toBeNull();
      expect(page().querySelector('.funds-table')).toBeNull();
      expect(page().querySelector('.totals')).toBeNull();
    });

    it('offers no action on a deposit that is not fully paid, and says why', () => {
      loadView({ ...view, isFullyPaid: false, canRefundDeposit: false, fundsReturned: [] });

      expect(refundButton()).toBeNull();
      expect(page().textContent).toContain('not fully paid');
    });

    it('is enabled on a fully paid deposit with something left to return', () => {
      loadView();

      expect(refundButton()).not.toBeNull();
      expect(refundButton()!.disabled).toBeFalse();
    });

    it('is disabled with the tooltip once the deposit is fully refunded', () => {
      loadView({ ...view, isDepositFullyRefunded: true, canRefundDeposit: false });

      const button = refundButton()!;
      expect(button.disabled).toBeTrue();
      expect(button.title).toBe('Deposit has already been refunded.');
      // The wrapper carries it too: a disabled button fires no pointer events in some browsers.
      expect((page().querySelector('.refund-action') as HTMLElement).title).toBe('Deposit has already been refunded.');
    });

    it('cannot open the panel around a disabled action', () => {
      loadView({ ...view, isDepositFullyRefunded: true, canRefundDeposit: false });

      component.openPanel();

      expect(component.panelOpen()).toBeFalse();
    });

    it('opens the Return Deposit panel', () => {
      loadView();

      refundButton()!.click();
      fixture.detectChanges();
      answerOwnerBanks();

      expect(component.panelOpen()).toBeTrue();
      expect(page().querySelector('app-return-deposit-panel')).not.toBeNull();
    });
  });

  // ---- returning (FR 11–14) ----------------------------------------------------------------------

  describe('returning the deposit', () => {
    beforeEach(async () => {
      await create();
      loadView();
      component.openPanel();
      fixture.detectChanges();
      answerOwnerBanks();
    });

    it('posts the panel\'s request once, ignoring a second submission while the first is in flight', () => {
      component.onReturnSubmitted(offlineRequest);
      component.onReturnSubmitted(offlineRequest);

      const request = httpMock.expectOne(createUrl);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(offlineRequest);

      request.flush({ invoiceId, status: 'accepted' }, { status: 202, statusText: 'Accepted' });
      httpMock.expectOne(viewUrl).flush(view);
    });

    it('on 202 closes the panel, confirms an offline return, and re-reads the view', () => {
      component.onReturnSubmitted(offlineRequest);
      httpMock.expectOne(createUrl).flush({ invoiceId, status: 'accepted' }, { status: 202, statusText: 'Accepted' });

      const reread = httpMock.expectOne(viewUrl);
      reread.flush({ ...view, totals: { ...view.totals, remaining: 0 } });
      fixture.detectChanges();

      expect(component.panelOpen()).toBeFalse();
      expect(page().textContent).toContain('Offline deposit return has been recorded successfully.');
      expect(page().textContent).toContain('queued');
      expect(component.view()?.totals.remaining).toBe(0);
    });

    it('confirms an online return in its own words', () => {
      component.onReturnSubmitted({ ...offlineRequest, mode: 'online' });
      httpMock.expectOne(createUrl).flush({ invoiceId, status: 'accepted' }, { status: 202, statusText: 'Accepted' });
      httpMock.expectOne(viewUrl).flush(view);
      fixture.detectChanges();

      expect(page().textContent).toContain('Online deposit return has been recorded successfully.');
    });

    it('on 422 keeps the panel open and shows the detail and the code above it', () => {
      component.onReturnSubmitted(offlineRequest);

      const failure = problem(
        422,
        'Business Rule Violation',
        'deposit_refund.exceeds_remaining_deposit',
        'Amount to return should be less than remaining amount.'
      );
      httpMock.expectOne(createUrl).flush(failure.body, failure.options);
      fixture.detectChanges();

      expect(component.panelOpen()).toBeTrue();
      expect(component.submitting()).toBeFalse();
      const banner = page().querySelector('.banner.error.floating') as HTMLElement;
      expect(banner.textContent).toContain('Amount to return should be less than remaining amount.');
      expect(banner.textContent).toContain('deposit_refund.exceeds_remaining_deposit');
    });

    it('shows Finance\'s own message when the payment service rejects the return', () => {
      component.onReturnSubmitted(offlineRequest);

      const failure = problem(
        422,
        'Business Rule Violation',
        'deposit_refund.rejected_by_payment_service',
        'Weekly refund limit of $10,000 reached.'
      );
      httpMock.expectOne(createUrl).flush(failure.body, failure.options);
      fixture.detectChanges();

      expect(component.submitError()?.message).toBe('Weekly refund limit of $10,000 reached.');
      expect(component.panelOpen()).toBeTrue();
    });

    // FR 14 — the return may already be queued; a one-click resubmission is the one thing not to offer.
    it('on submission_unconfirmed closes the panel, warns with the server\'s sentence, and re-reads', () => {
      component.onReturnSubmitted(offlineRequest);

      const failure = problem(
        502,
        'Bad Gateway',
        'deposit_refund.submission_unconfirmed',
        'The payment service did not confirm the request. Check Funds Returned before trying again.'
      );
      httpMock.expectOne(createUrl).flush(failure.body, failure.options);
      httpMock.expectOne(viewUrl).flush(view);
      fixture.detectChanges();

      expect(component.panelOpen()).toBeFalse();
      expect(component.submitError()).toBeNull();
      const banner = page().querySelector('.banner.warn') as HTMLElement;
      expect(banner.textContent).toContain('Check Funds Returned before trying again.');
    });
  });

  // ---- Funds Returned and the totals (FR 15, 17, 18) ---------------------------------------------

  describe('Funds Returned', () => {
    beforeEach(async () => {
      await create();
      loadView();
    });

    it('renders one row per return, in the server\'s order, with labels, dates and numbers', () => {
      const rows = page().querySelectorAll('.funds-table tbody tr');
      expect(rows.length).toBe(3);

      const first = rows[0].textContent ?? '';
      expect(first).toContain('Jordan Ellis');
      expect(first).toContain('2026-09-01');
      expect(first).toContain('2026-10-05');
      expect(first).toContain('Refunded');
      expect(first).toContain('Check');
      expect(first).toContain('1042');
      expect(first).toContain('$12.00');

      const second = rows[1].textContent ?? '';
      expect(second).toContain('Initiated');
      expect(second).toContain('ACH');
      expect(second).toContain('—');

      expect(rows[2].textContent).toContain('N/A');
      expect(rows[2].textContent).toContain('Processing');
    });

    it('names a payer the server could not name with the app\'s stand-in for that tenant', () => {
      const identity = placeholderTenantIdentity(tenantB);

      expect(component.payerLabel(achReturn)).toBe(`${identity.firstName} ${identity.lastName}`);
    });

    it('renders the five totals exactly as served', () => {
      const totals = page().querySelector('.totals')!.textContent ?? '';

      expect(totals).toContain('Total Paid');
      expect(totals).toContain('$21.00');
      expect(totals).toContain('Total Returned');
      expect(totals).toContain('$12.00');
      expect(totals).toContain('Deposit Interest');
      expect(totals).toContain('$30.00');
      expect(totals).toContain('Amount Applied To Open Invoices');
      expect(totals).toContain('$0.00');
      expect(totals).toContain('Remaining Deposit Liability');
      expect(totals).toContain('$9.00');
    });

    it('says so when nothing has been returned yet', async () => {
      component.invoiceIdInput.setValue(invoiceId);
      component.load();
      httpMock.expectOne(viewUrl).flush({ ...view, fundsReturned: [] });
      fixture.detectChanges();

      expect(page().querySelector('.funds-table')).toBeNull();
      expect(page().textContent).toContain('No deposit has been returned on this invoice yet.');
    });
  });

  // ---- row actions (FR 16) -----------------------------------------------------------------------

  describe('row actions', () => {
    beforeEach(async () => {
      await create();
      loadView();
    });

    function openMenu(rowIndex: number): void {
      const buttons = page().querySelectorAll('.funds-table tbody tr');
      (buttons[rowIndex].querySelector('.row-menu-btn') as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    function menuText(): string {
      return page().querySelector('.row-menu')?.textContent ?? '';
    }

    it('offers Remove alone on an offline return, Cancel alone on a cancellable online one', () => {
      openMenu(0);
      expect(menuText()).toContain('Remove');
      expect(menuText()).not.toContain('Cancel');

      component.closeRowMenu();
      openMenu(1);
      expect(menuText()).toContain('Cancel');
      expect(menuText()).not.toContain('Remove');
    });

    it('offers no menu on a row that allows neither', () => {
      const rows = page().querySelectorAll('.funds-table tbody tr');

      expect(rows[2].querySelector('.row-menu-btn')).toBeNull();
    });

    it('asks first, then cancels, confirms and re-reads the view', () => {
      component.beginRowAction(achReturn, 'cancel');
      fixture.detectChanges();
      expect(component.pendingRowAction()).toEqual({ refundId: achRefundId, action: 'cancel' });
      httpMock.expectNone(`${createUrl}/${achRefundId}/cancel`);

      component.confirmRowAction(achReturn);

      const request = httpMock.expectOne(`${createUrl}/${achRefundId}/cancel`);
      expect(request.request.method).toBe('POST');
      request.flush(null, { status: 204, statusText: 'No Content' });
      httpMock.expectOne(viewUrl).flush({ ...view, fundsReturned: [checkReturn, cashReturn] });
      fixture.detectChanges();

      expect(page().textContent).toContain('The online return was cancelled.');
      expect(component.view()?.fundsReturned.length).toBe(2);
    });

    it('asks first, then removes, confirms and re-reads the view', () => {
      component.beginRowAction(checkReturn, 'remove');
      component.confirmRowAction(checkReturn);

      const request = httpMock.expectOne(`${createUrl}/${checkRefundId}`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });
      httpMock.expectOne(viewUrl).flush(view);
      fixture.detectChanges();

      expect(page().textContent).toContain('The offline return was removed.');
    });

    it('abandons the confirmation without calling anything', () => {
      component.beginRowAction(checkReturn, 'remove');
      component.cancelRowAction();

      component.confirmRowAction(checkReturn);

      expect(component.pendingRowAction()).toBeNull();
      httpMock.expectNone(`${createUrl}/${checkRefundId}`);
    });

    it('shows a refused cancel as an error with its detail, and does not re-read', () => {
      component.beginRowAction(achReturn, 'cancel');
      component.confirmRowAction(achReturn);

      const failure = problem(
        422,
        'Business Rule Violation',
        'deposit_refund.cannot_cancel',
        'This payment has passed the processing window and cannot be cancelled.'
      );
      httpMock.expectOne(`${createUrl}/${achRefundId}/cancel`).flush(failure.body, failure.options);
      fixture.detectChanges();

      const banner = page().querySelector('.banner.error') as HTMLElement;
      expect(banner.textContent).toContain('The return was not cancelled.');
      expect(banner.textContent).toContain('passed the processing window');
      expect(component.workingRefundId()).toBeNull();
    });

    it('re-reads the view after an unconfirmed remove, keeping the error on screen', () => {
      component.beginRowAction(checkReturn, 'remove');
      component.confirmRowAction(checkReturn);

      const failure = problem(
        502,
        'Bad Gateway',
        'deposit_refund.submission_unconfirmed',
        'The payment service did not confirm the request. Check Funds Returned before trying again.'
      );
      httpMock.expectOne(`${createUrl}/${checkRefundId}`).flush(failure.body, failure.options);
      httpMock.expectOne(viewUrl).flush(view);
      fixture.detectChanges();

      expect(page().querySelector('.banner.error')!.textContent).toContain('The return was not removed.');
    });
  });

  // ---- a scope change (FR 19) --------------------------------------------------------------------

  it('re-reads the view when the Test scope changes, without a browser reload', async () => {
    await create();
    loadView();

    TestBed.inject(RequestScopeService).setAccessToken('a-token-pasted-after-the-page-loaded');
    fixture.detectChanges();

    httpMock.expectOne(viewUrl).flush(view);
    expect(component.view()?.invoiceId).toBe(invoiceId);
  });
});
