import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { CreateDepositRefundRequest, DepositRefundResponse } from './deposit-refund.models';
import { OwnerBankDetail } from './owner-bank.models';
import { ReturnDepositPanelComponent } from './return-deposit-panel.component';

/**
 * Covers FR 5–11 of `09-deposit-refund-ui.md` v1 — the *Return Deposit* panel: the two modes, the
 * running totals, the client mirror of backend BR-17 / BR-19, and the request it builds.
 */
describe('ReturnDepositPanelComponent', () => {
  let fixture: ComponentFixture<ReturnDepositPanelComponent>;
  let component: ReturnDepositPanelComponent;
  let emitted: CreateDepositRefundRequest[];

  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';
  const bankId = '33333333-3333-3333-3333-333333333333';
  const otherBankId = '44444444-4444-4444-4444-444444444444';

  /** merlin's answer, field for field — the three encrypted values are opaque here on purpose. */
  const ownerBanks: OwnerBankDetail[] = [
    {
      bankId,
      bankAccountNumber: 'enc-account==',
      bankAccountName: 'First Bank',
      routingNumber: 'enc-routing==',
      fundingSourceId: 'enc-funding==',
      accountHolder: 'Pat Owner',
      accountTypeId: 1,
      paymentServiceTypeId: 2,
      displayBankAccountNumber: '****6789',
      companyName: 'Pat Owner LLC',
      verifier: null
    },
    {
      bankId: otherBankId,
      bankAccountNumber: 'enc-account-2==',
      bankAccountName: 'Second Bank',
      routingNumber: 'enc-routing-2==',
      fundingSourceId: 'enc-funding-2==',
      accountHolder: 'Pat Owner',
      accountTypeId: 2,
      paymentServiceTypeId: 2,
      displayBankAccountNumber: '****4321',
      companyName: 'Pat Owner LLC',
      verifier: null
    }
  ];

  let http: HttpTestingController;

  /** Two tenants who paid a $21 deposit; nothing returned yet, so all $21 remains. */
  const view: DepositRefundResponse = {
    invoiceId: '8f14e45f-ceea-467e-bd9f-000000000001',
    invoiceNumber: 'INV-102026-000501',
    isDepositInvoice: true,
    isFullyPaid: true,
    canRefundDeposit: true,
    isDepositRefundStarted: false,
    isDepositFullyRefunded: false,
    totals: { depositAmount: 21, totalPaid: 21, totalReturned: 0, depositInterest: 0, totalApplied: 0, remaining: 21 },
    tenants: [
      { tenantId: tenantA, name: 'Jordan Ellis', paid: 11, returned: 0, interestReturned: 0, held: 11 },
      { tenantId: tenantB, name: 'Sam Rivera', paid: 10, returned: 0, interestReturned: 0, held: 10 }
    ],
    fundsReturned: []
  };

  /**
   * The same accounts in merlin's own shape: PascalCase, wrapped in `Data`.
   *
   * The fixture above stays camelCase because that is what the panel reads and what these tests
   * assert on; this turns it back into what the gateway actually answers, so the flush exercises
   * `OwnerBankService`'s mapping instead of bypassing it. Flushing the camelCase array directly is
   * what let this suite pass while the real panel showed no accounts.
   */
  const envelopeFor = (banks: OwnerBankDetail[]) => ({
    Message: { Message: 'Request succeeded successfully.', MessageType: 1 },
    Data: banks.map((bank) => ({
      BankId: bank.bankId,
      BankAccountNumber: bank.bankAccountNumber,
      BankAccountName: bank.bankAccountName,
      RoutingNumber: bank.routingNumber,
      FundingSourceId: bank.fundingSourceId,
      AccountHolder: bank.accountHolder,
      AccountTypeId: bank.accountTypeId,
      PaymentServiceTypeId: bank.paymentServiceTypeId,
      DisplayBankAccountNumber: bank.displayBankAccountNumber,
      CompanyName: bank.companyName,
      Verifier: bank.verifier
    })),
    IsFeedbackSet: true
  });

  function create(source: DepositRefundResponse = view, banks: OwnerBankDetail[] | 'fail' = ownerBanks): void {
    fixture = TestBed.createComponent(ReturnDepositPanelComponent);
    component = fixture.componentInstance;
    component.view = source;
    emitted = [];
    component.submitted.subscribe((request) => emitted.push(request));
    fixture.detectChanges();

    const request = http.expectOne(`${environment.monolithBaseUrl}/Home/DropDown/GetPropertyOwnerBankDetails`);
    if (banks === 'fail') {
      request.flush('nope', { status: 500, statusText: 'Server Error' });
    } else {
      request.flush(envelopeFor(banks));
    }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReturnDepositPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    create();
  });

  afterEach(() => http.verify());

  /** Fills offline row `index`; anything left out keeps its current value. */
  function fillRow(
    index: number,
    value: Partial<{ method: string; checkNumber: string; amount: number | null; interest: number | null }>
  ): void {
    component.offlineRows.at(index).patchValue(value);
    fixture.detectChanges();
  }

  /** A complete, valid online form for tenant A. */
  function fillOnline(overrides: Record<string, unknown> = {}): void {
    component.online.patchValue({
      tenantId: tenantA,
      amount: 9,
      interest: 1,
      bankId,
      ...overrides
    });
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  // ---- the choice (FR 5) -------------------------------------------------------------------------

  it('opens on the choice, with nothing to submit until a mode is picked', () => {
    expect(component.mode()).toBeNull();
    expect(text()).toContain('Return Offline');
    expect(text()).toContain('Return Online');

    component.submit();

    expect(emitted).toEqual([]);
  });

  it('keeps what was typed into each mode when switching between them', () => {
    component.chooseMode('offline');
    fillRow(0, { amount: 5, checkNumber: '1042' });

    component.chooseMode('online');
    fillOnline({ amount: 7 });

    component.chooseMode('offline');
    expect(component.offlineRows.at(0).getRawValue().amount).toBe(5);
    expect(component.offlineRows.at(0).getRawValue().checkNumber).toBe('1042');

    component.chooseMode('online');
    expect(component.online.getRawValue().amount).toBe(7);
  });

  // ---- offline rows (FR 6, 7) --------------------------------------------------------------------

  it('builds one offline row per tenant, showing the payer and what each still holds', () => {
    component.chooseMode('offline');
    fixture.detectChanges();

    expect(component.offlineRows.length).toBe(2);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.offline-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Jordan Ellis');
    expect(rows[0].textContent).toContain('$11.00');
    expect(rows[1].textContent).toContain('Sam Rivera');
    expect(rows[1].textContent).toContain('$10.00');
  });

  // FR 19 — a scope-change re-read hands the open panel a new view; rows keep their own tenant.
  it('keeps each row on its own tenant when a re-read reorders the view, and shows the new held figure', () => {
    component.chooseMode('offline');
    fillRow(0, { amount: 5, checkNumber: '1042' });

    component.view = { ...view, tenants: [{ ...view.tenants[1] }, { ...view.tenants[0], held: 6 }] };
    fixture.detectChanges();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.offline-row');
    expect(rows[0].textContent).toContain('Jordan Ellis');
    expect(rows[0].textContent).toContain('$6.00');
    expect(component.offlineRows.at(0).getRawValue().amount).toBe(5);
  });

  it('clears and disables the number when Cash is chosen, and enables it again for a check', () => {
    component.chooseMode('offline');
    fillRow(0, { checkNumber: '1042' });

    fillRow(0, { method: 'cash' });

    const checkNumber = component.offlineRows.at(0).get('checkNumber')!;
    expect(checkNumber.disabled).toBeTrue();
    expect(checkNumber.value).toBe('');

    fillRow(0, { method: 'money_order' });

    expect(checkNumber.enabled).toBeTrue();
  });

  it('keeps running totals: interest, principal plus interest, and remaining minus principal only', () => {
    component.chooseMode('offline');
    fillRow(0, { amount: 5, interest: 1.5, checkNumber: '1' });
    fillRow(1, { amount: 4, interest: 0.25, checkNumber: '2' });

    expect(component.totalHeld).toBe(21);
    expect(component.enteredInterest).toBe(1.75);
    expect(component.amountToReturn).toBe(10.75);
    // Interest never reduces what remains (backend BR-06).
    expect(component.remainingAfter).toBe(12);
    expect(text()).toContain('$10.75');
    expect(text()).toContain('$12.00');
  });

  // ---- the client mirror of BR-17 / BR-19 (FR 8, 8a) ---------------------------------------------

  it('refuses a principal above Remaining with the server\'s own sentence, and sends nothing', () => {
    component.chooseMode('offline');
    fillRow(0, { amount: 15, checkNumber: '1' });
    fillRow(1, { amount: 10, checkNumber: '2' });

    component.submit();
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(component.errors).toContain('Amount to return should be less than remaining amount.');
    expect(text()).toContain('Amount to return should be less than remaining amount.');
  });

  it('accepts a principal exactly equal to Remaining — the rule is at most, not less than', () => {
    component.chooseMode('offline');
    fillRow(0, { amount: 11, checkNumber: '1' });
    fillRow(1, { amount: 10, checkNumber: '2' });

    component.submit();

    expect(component.errors).toEqual([]);
    expect(emitted.length).toBe(1);
  });

  it('refuses a return with no amount at all', () => {
    component.chooseMode('offline');

    component.submit();

    expect(emitted).toEqual([]);
    expect(component.errors).toContain('Enter an amount to return for at least one tenant.');
  });

  it('refuses three decimals and negative figures, naming the payer', () => {
    component.chooseMode('offline');
    fillRow(0, { amount: 1.005, checkNumber: '1' });
    fillRow(1, { amount: 2, interest: -1, checkNumber: '2' });

    component.submit();

    expect(emitted).toEqual([]);
    expect(component.errors).toContain('Jordan Ellis: amounts must be 0 or more, with at most two decimals.');
    expect(component.errors).toContain('Sam Rivera: amounts must be 0 or more, with at most two decimals.');
    expect(component.isInvalid('offline.0.amount')).toBeTrue();
    expect(component.isInvalid('offline.1.interest')).toBeTrue();
  });

  it('requires the number for a check or money order, at most 25 characters', () => {
    component.chooseMode('offline');
    fillRow(0, { method: 'check', amount: 5, checkNumber: '  ' });
    fillRow(1, { method: 'money_order', amount: 4, checkNumber: 'x'.repeat(26) });

    component.submit();

    expect(emitted).toEqual([]);
    expect(component.errors).toContain('Jordan Ellis: enter the check number.');
    expect(component.errors).toContain('Sam Rivera: the money order number can be at most 25 characters.');
    expect(component.isInvalid('offline.0.checkNumber')).toBeTrue();
  });

  it('does not ask for a number on a row that is not being sent', () => {
    component.chooseMode('offline');
    fillRow(0, { method: 'check', amount: 5, checkNumber: '1042' });
    fillRow(1, { method: 'check', amount: null, checkNumber: '' });

    component.submit();

    expect(component.errors).toEqual([]);
  });

  // FR 8a — BR-18 drops a zero-amount row server-side, interest and all, without a word.
  it('refuses interest on a row with no amount, since that row would never be sent', () => {
    component.chooseMode('offline');
    fillRow(0, { amount: 5, checkNumber: '1' });
    fillRow(1, { amount: null, interest: 3 });

    component.submit();

    expect(emitted).toEqual([]);
    expect(component.errors).toContain(
      'Sam Rivera: deposit interest is returned only with an amount. Enter an amount, or clear the interest.'
    );
  });

  it('updates the list live once submit has been tried, so it shrinks as entries are fixed', () => {
    component.chooseMode('offline');
    expect(component.errors).withContext('nothing is reported before the first attempt').toEqual([]);

    component.submit();
    expect(component.errors.length).toBe(1);

    fillRow(0, { amount: 5, checkNumber: '1042' });

    expect(component.errors).toEqual([]);
  });

  // ---- the offline request (FR 9) ----------------------------------------------------------------

  it('sends only rows with an amount, no checkNumber on cash, the number trimmed, and no bank or address', () => {
    component.chooseMode('offline');
    fillRow(0, { method: 'cash', amount: 5, interest: 0.5 });
    fillRow(1, { method: 'check', amount: null, checkNumber: '' });

    component.submit();

    expect(emitted.length).toBe(1);
    const request = emitted[0];
    expect(request.mode).toBe('offline');
    expect(request.returns).toEqual([{ tenantId: tenantA, method: 'cash', amount: 5, interest: 0.5 }]);
    expect('checkNumber' in request.returns[0]).toBeFalse();
    expect('ownerBank' in request).toBeFalse();
    expect('backupAddress' in request).toBeFalse();
  });

  it('carries the trimmed number on a check row', () => {
    component.chooseMode('offline');
    fillRow(0, { method: 'check', amount: 9, checkNumber: '  1042 ' });

    component.submit();

    expect(emitted[0].returns).toEqual([
      { tenantId: tenantA, method: 'check', checkNumber: '1042', amount: 9, interest: 0 }
    ]);
  });

  // ---- online (FR 10) ----------------------------------------------------------------------------

  it('requires one tenant, an amount and a chosen bank account online', () => {
    component.chooseMode('online');

    component.submit();

    expect(emitted).toEqual([]);
    const errors = component.errors;
    expect(errors).toContain('Choose the tenant to return the deposit to.');
    expect(errors).toContain('Enter an amount to return.');
    expect(errors).toContain('Choose the bank account to return from.');
  });

  it('refuses an account that is not one merlin offered, and a principal above Remaining', () => {
    component.chooseMode('online');
    fillOnline({ bankId: '99999999-9999-9999-9999-999999999999', amount: 22 });

    component.submit();

    expect(emitted).toEqual([]);
    expect(component.errors).toContain('Choose the bank account to return from.');
    expect(component.errors).toContain('Amount to return should be less than remaining amount.');
  });

  it('checks the backup address only when it is included', () => {
    component.chooseMode('online');
    fillOnline({ line1: '', city: 'Spring-field', zip: '1234' });

    component.submit();
    expect(component.errors).withContext('not included, so not checked').toEqual([]);
    emitted = [];

    component.online.patchValue({ includeBackupAddress: true });
    component.submit();

    expect(component.errors).toContain('Backup address: enter address line 1.');
    expect(component.errors).toContain('Backup address: the city may hold only letters and spaces.');
    expect(component.errors).toContain('Backup address: enter the state.');
    expect(component.errors).toContain('Backup address: the ZIP code must be 5 digits.');
  });

  it('sends one return with no method or number, the owner bank, and the address only when included', () => {
    component.chooseMode('online');
    fillOnline();

    component.submit();

    expect(emitted.length).toBe(1);
    const request = emitted[0];
    expect(request).toEqual({
      mode: 'online',
      returns: [{ tenantId: tenantA, amount: 9, interest: 1 }],
      ownerBank: {
        bankId,
        bankName: 'First Bank',
        accountHolder: 'Pat Owner',
        accountTypeId: 1,
        accountNumber: 'enc-account==',
        routingNumber: 'enc-routing==',
        fundingSource: 'enc-funding=='
      }
    });

    component.online.patchValue({
      includeBackupAddress: true,
      line1: '1 Main St',
      line2: '  ',
      city: 'Springfield',
      state: 'IL',
      zip: '62704'
    });
    component.submit();

    // `line2` was blank, so it is omitted rather than sent empty.
    expect(emitted[1].backupAddress).toEqual({ line1: '1 Main St', city: 'Springfield', state: 'IL', zip: '62704' });
  });

  it('preselects the tenant online when only one paid', () => {
    create({ ...view, tenants: [view.tenants[0]] });

    component.chooseMode('online');

    expect(component.online.getRawValue().tenantId).toBe(tenantA);
  });

  it('lists the owner\'s accounts from merlin, masked, and never shows an encrypted value', () => {
    component.chooseMode('online');
    fixture.detectChanges();

    expect(text()).toContain('First Bank — ****6789');
    expect(text()).toContain('Second Bank — ****4321');
    expect(text()).not.toContain('enc-account==');
    expect(text()).not.toContain('enc-routing==');
    expect(text()).not.toContain('enc-funding==');
  });

  it('preselects the only account, and leaves the choice open when there are two', () => {
    create(view, [ownerBanks[0]]);

    expect(component.online.getRawValue().bankId).toBe(bankId);

    create();

    expect(component.online.getRawValue().bankId).toBe('');
  });

  it('refuses an online return when merlin offers no account, and says to return offline', () => {
    create(view, []);
    component.chooseMode('online');
    fillOnline({ bankId: '' });

    component.submit();

    expect(emitted).toEqual([]);
    expect(component.errors).toContain(
      'No bank account is available for this owner, so an online return cannot be started. Return offline instead.'
    );
    expect(text()).toContain('No bank account is available for this owner');
  });

  it('treats a failed bank read as no accounts rather than breaking the panel', () => {
    create(view, 'fail');

    expect(component.ownerBanksLoaded()).toBeTrue();
    expect(component.ownerBanks()).toEqual([]);

    // The offline tab is untouched by merlin being unreachable.
    component.chooseMode('offline');
    fillRow(0, { method: 'cash', amount: 5 });
    component.submit();

    expect(emitted.length).toBe(1);
  });

  it('sends the chosen account, not the first one', () => {
    component.chooseMode('online');
    fillOnline({ bankId: otherBankId });

    component.submit();

    expect(emitted[0].ownerBank).toEqual({
      bankId: otherBankId,
      bankName: 'Second Bank',
      accountHolder: 'Pat Owner',
      accountTypeId: 2,
      accountNumber: 'enc-account-2==',
      routingNumber: 'enc-routing-2==',
      fundingSource: 'enc-funding-2=='
    });
  });

  // ---- sending, and leaving (FR 11) --------------------------------------------------------------

  it('emits nothing while a submission is already in flight', () => {
    component.chooseMode('offline');
    fillRow(0, { amount: 5, checkNumber: '1042' });
    component.submitting = true;

    component.submit();

    expect(emitted).toEqual([]);
  });

  it('says there is nobody to return to when no tenant has paid, and offers no submit', () => {
    create({ ...view, tenants: [] });
    component.chooseMode('offline');
    fixture.detectChanges();

    expect(text()).toContain('nobody to return it to');
    const submit = (fixture.nativeElement as HTMLElement).querySelector('.panel-foot .primary-btn') as HTMLButtonElement;
    expect(submit.disabled).toBeTrue();
  });

  it('emits closed from Cancel and from the overlay', () => {
    let closed = 0;
    component.closed.subscribe(() => closed++);

    ((fixture.nativeElement as HTMLElement).querySelector('.panel-overlay') as HTMLElement).click();
    ((fixture.nativeElement as HTMLElement).querySelector('.panel-foot .ghost-btn') as HTMLElement).click();

    expect(closed).toBe(2);
  });
});
