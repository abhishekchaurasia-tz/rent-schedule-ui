import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { OwnerBankDetail, OwnerBankDetailWire } from './owner-bank.models';
import { OwnerBankService } from './owner-bank.service';

/** Covers FR 10 of `09-deposit-refund-ui.md` v2 — the owner's bank list, read from merlin. */
describe('OwnerBankService', () => {
  const url = `${environment.monolithBaseUrl}/Home/DropDown/GetPropertyOwnerBankDetails`;

  let service: OwnerBankService;
  let http: HttpTestingController;

  // PascalCase, wrapped in `Data`, `CompanyName` null -- merlin's answer as the qa gateway actually
  // returns it, not a tidied-up version of it. The previous fixture was a bare camelCase array, which
  // is why this suite passed while the panel showed nothing.
  const wire: OwnerBankDetailWire = {
    BankId: '33333333-3333-3333-3333-333333333333',
    BankAccountNumber: 'enc-account==',
    BankAccountName: 'First Bank',
    RoutingNumber: 'enc-routing==',
    FundingSourceId: 'enc-funding==',
    AccountHolder: 'Pat Owner',
    AccountTypeId: 61,
    PaymentServiceTypeId: 208,
    DisplayBankAccountNumber: 'xxxx-6789',
    CompanyName: null,
    Verifier: 2
  };

  const envelope = (data: OwnerBankDetailWire[] | null) => ({
    Message: { Message: 'Request succeeded successfully.', MessageType: 1 },
    Data: data,
    IsFeedbackSet: true
  });

  const bank: OwnerBankDetail = {
    bankId: '33333333-3333-3333-3333-333333333333',
    bankAccountNumber: 'enc-account==',
    bankAccountName: 'First Bank',
    routingNumber: 'enc-routing==',
    fundingSourceId: 'enc-funding==',
    accountHolder: 'Pat Owner',
    accountTypeId: 61,
    paymentServiceTypeId: 208,
    displayBankAccountNumber: 'xxxx-6789',
    companyName: null,
    verifier: 2
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(OwnerBankService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads merlin\'s own route, with no parameters — the organization comes from the session', () => {
    let answered: OwnerBankDetail[] | undefined;

    service.list().subscribe((banks) => (answered = banks));

    const request = http.expectOne(url);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);

    request.flush(envelope([wire]));

    expect(answered).toEqual([bank]);
  });

  it('unwraps merlin\'s envelope and maps its PascalCase onto the panel\'s shape', () => {
    let answered: OwnerBankDetail[] | undefined;

    service.list().subscribe((banks) => (answered = banks));

    http.expectOne(url).flush(envelope([wire]));

    // Both of these were broken and neither threw: the array sat under `Data`, and every field came
    // back `undefined` because merlin capitalises them.
    expect(answered?.length).toBe(1);
    expect(answered?.[0].bankId).toBe('33333333-3333-3333-3333-333333333333');
    expect(answered?.[0].displayBankAccountNumber).toBe('xxxx-6789');
    expect(answered?.[0].bankAccountName).toBe('First Bank');
    expect(answered?.[0]).toEqual(bank);
  });

  it('answers an empty list when the envelope carries no Data at all', () => {
    const answers: OwnerBankDetail[][] = [];

    service.list().subscribe((banks) => answers.push(banks));

    // An error-shaped answer omits `Data`. Mapping over `undefined` would throw, and the panel would
    // break rather than say no account is available.
    http.expectOne(url).flush({ Message: { Message: 'No.', MessageType: 3 }, IsFeedbackSet: true });

    expect(answers).toEqual([[]]);
  });

  it('answers an empty list when merlin cannot be read, rather than an error', () => {
    const answers: OwnerBankDetail[][] = [];
    let errored = false;

    service.list().subscribe({ next: (banks) => answers.push(banks), error: () => (errored = true) });

    http.expectOne(url).flush('no', { status: 500, statusText: 'Server Error' });

    expect(errored).toBeFalse();
    expect(answers).toEqual([[]]);
  });

  it('answers an empty list when the caller has no token and merlin refuses', () => {
    const answers: OwnerBankDetail[][] = [];

    service.list().subscribe((banks) => answers.push(banks));

    http.expectOne(url).flush('', { status: 401, statusText: 'Unauthorized' });

    expect(answers).toEqual([[]]);
  });
});
