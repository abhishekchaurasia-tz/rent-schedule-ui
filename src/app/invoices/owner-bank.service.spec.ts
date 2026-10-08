import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { OwnerBankDetail } from './owner-bank.models';
import { OwnerBankService } from './owner-bank.service';

/** Covers FR 10 of `09-deposit-refund-ui.md` v2 — the owner's bank list, read from merlin. */
describe('OwnerBankService', () => {
  const url = `${environment.monolithBaseUrl}/Home/DropDown/GetPropertyOwnerBankDetails`;

  let service: OwnerBankService;
  let http: HttpTestingController;

  const bank: OwnerBankDetail = {
    bankId: '33333333-3333-3333-3333-333333333333',
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

    request.flush([bank]);

    expect(answered).toEqual([bank]);
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
