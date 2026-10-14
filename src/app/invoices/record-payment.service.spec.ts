import { HttpErrorResponse } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import {
  OfflinePaymentContextResponse,
  OfflinePaymentPreviewResponse,
  OfflinePaymentSubmittedResponse,
  PreviewOfflinePaymentRequest,
  RecordOfflinePaymentRequest
} from './record-payment.models';
import {
  RecordPaymentMessages,
  RecordPaymentService,
  SUBMISSION_UNCONFIRMED,
  describeRecordPaymentProblem
} from './record-payment.service';

/** Covers the contract section and FR 16, 17 of `11-record-payment-ui.md` v1 — the three calls and the refusals. */
describe('RecordPaymentService', () => {
  let service: RecordPaymentService;
  let httpMock: HttpTestingController;

  const invoiceId = '8f14e45f-ceea-467e-bd9f-000000000001';
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const baseUrl = `${environment.apiBaseUrl}/api/v1/invoices/${invoiceId}`;

  const preview: PreviewOfflinePaymentRequest = {
    tenantId,
    payments: [
      { method: 'cash', amount: 4, paidOn: '2026-10-13' },
      { method: 'money_order', amount: 3, paidOn: '2026-10-13', checkNumber: 'Abc' }
    ]
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });

    service = TestBed.inject(RecordPaymentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getContext() reads /invoices/{id}/offline-payment and returns the context as served', () => {
    let actual: OfflinePaymentContextResponse | undefined;
    service.getContext(invoiceId).subscribe((context) => (actual = context));

    const request = httpMock.expectOne(`${baseUrl}/offline-payment`);
    expect(request.request.method).toBe('GET');

    const body: OfflinePaymentContextResponse = {
      invoiceId,
      invoiceNumber: 'INV-102026-000101',
      total: 190,
      paid: 5,
      payable: 185,
      tenants: [{ tenantId, name: 'Geetika Shukla', share: 95, paid: 5, suggestedAmount: 90 }],
      methods: ['cash', 'check', 'money_order']
    };
    request.flush(body);

    expect(actual).toEqual(body);
  });

  it('preview() posts the tenant and the lines unchanged to /invoices/{id}/offline-payments/preview', () => {
    const answer: OfflinePaymentPreviewResponse = {
      totalEntered: 7,
      payable: 185,
      excess: 0,
      maxPayable: 585,
      exceedsPayable: false,
      message: null,
      allocations: []
    };

    let actual: OfflinePaymentPreviewResponse | undefined;
    service.preview(invoiceId, preview).subscribe((response) => (actual = response));

    const request = httpMock.expectOne(`${baseUrl}/offline-payments/preview`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(preview);
    request.flush(answer);

    expect(actual).toEqual(answer);
  });

  it('submit() posts the submission id, tenant and lines to /invoices/{id}/offline-payments and reads the 202', () => {
    const body: RecordOfflinePaymentRequest = { ...preview, submissionId: '7a1e2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b' };
    const answer: OfflinePaymentSubmittedResponse = {
      invoiceId,
      submissionId: body.submissionId,
      status: 'accepted',
      allocations: []
    };

    let actual: OfflinePaymentSubmittedResponse | undefined;
    service.submit(invoiceId, body).subscribe((response) => (actual = response));

    const request = httpMock.expectOne(`${baseUrl}/offline-payments`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush(answer, { status: 202, statusText: 'Accepted' });

    expect(actual).toEqual(answer);
  });

  it('passes a refusal through to the caller, unretried', () => {
    let failure: HttpErrorResponse | undefined;
    service.submit(invoiceId, { ...preview, submissionId: 'x' }).subscribe({ error: (err) => (failure = err) });

    httpMock
      .expectOne(`${baseUrl}/offline-payments`)
      .flush({ detail: 'down', errorCode: SUBMISSION_UNCONFIRMED }, { status: 502, statusText: 'Bad Gateway' });

    expect(failure?.status).toBe(502);
  });

  describe('describeRecordPaymentProblem (FR 16, 17)', () => {
    function refusal(status: number, body: unknown, statusText = 'Error'): HttpErrorResponse {
      return new HttpErrorResponse({ status, statusText, error: body });
    }

    it('gives each known code its readable sentence, with the code beside it', () => {
      const cases: [number, string][] = [
        [404, 'invoice.not_found'],
        [422, 'record_payment.not_payable'],
        [422, 'record_payment.nothing_to_pay'],
        [422, 'record_payment.tenant_not_on_invoice'],
        [502, 'record_payment.payment_service_unavailable'],
        [400, 'Request.Malformed'],
        [502, SUBMISSION_UNCONFIRMED]
      ];

      for (const [status, code] of cases) {
        const problem = describeRecordPaymentProblem(refusal(status, { detail: 'server words', errorCode: code }));
        expect(problem).toEqual({ message: RecordPaymentMessages[code], code });
      }
    });

    it('tells the owner an unconfirmed submission may have been queued and to check before retrying', () => {
      const problem = describeRecordPaymentProblem(refusal(502, { errorCode: SUBMISSION_UNCONFIRMED }));

      expect(problem.message).toContain('may still have been queued');
      expect(problem.message).toContain('check the invoice');
    });

    it('shows the server detail verbatim for the codes whose detail is the specific part', () => {
      const exceeds =
        'There are no other unpaid or future invoices, therefore, you cannot enter an amount greater than $585.00.';

      expect(describeRecordPaymentProblem(refusal(422, { detail: exceeds, errorCode: 'record_payment.exceeds_payable' })))
        .toEqual({ message: exceeds, code: 'record_payment.exceeds_payable' });
      expect(
        describeRecordPaymentProblem(
          refusal(422, {
            detail: 'Payment for this invoice has already been received or is in progress.',
            errorCode: 'record_payment.rejected_by_payment_service'
          })
        ).message
      ).toBe('Payment for this invoice has already been received or is in progress.');
      expect(
        describeRecordPaymentProblem(
          refusal(400, { detail: 'Line 1: paidOn cannot be in the future.', code: 'record_payment.validation_failed' })
        )
      ).toEqual({ message: 'Line 1: paidOn cannot be in the future.', code: 'record_payment.validation_failed' });
    });

    it('falls back to the status line when the body is not Problem Details', () => {
      expect(describeRecordPaymentProblem(refusal(500, 'boom', 'Internal Server Error'))).toEqual({
        message: 'Request failed: 500 Internal Server Error',
        code: null
      });
    });
  });
});
