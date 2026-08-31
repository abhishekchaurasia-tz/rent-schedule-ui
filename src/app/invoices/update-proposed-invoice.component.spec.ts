import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { ProposedInvoiceDetailResponse } from '../rent-agreements/rent-agreement.models';
import { InvoiceDetailResponse } from './invoice.models';
import { UpdateProposedInvoiceComponent } from './update-proposed-invoice.component';

describe('UpdateProposedInvoiceComponent', () => {
  let fixture: ComponentFixture<UpdateProposedInvoiceComponent>;
  let component: UpdateProposedInvoiceComponent;
  let httpMock: HttpTestingController;

  const invoiceId = '8f14e45f-ceea-467e-bd9f-000000000001';
  const agreementId = '11111111-1111-1111-1111-111111111111';
  const proposedInvoiceId = '22222222-2222-2222-2222-222222222222';
  const lineOneId = '33333333-3333-3333-3333-333333333333';
  const lineTwoId = '44444444-4444-4444-4444-444444444444';

  const invoicesUrl = `${environment.apiBaseUrl}/api/v1/invoices`;
  const patchUrl =
    `${environment.apiBaseUrl}/api/v1/rent/agreements/${agreementId}` +
    `/proposed-invoices/${proposedInvoiceId}`;

  const invoice: InvoiceDetailResponse = {
    invoiceId,
    invoiceNumber: 'INV-092026-000042',
    invoiceType: 'Rent',
    status: 'NotReceived',
    source: 'Schedule',
    generatedOn: '2026-09-01',
    initialDueDate: '2026-09-01',
    dueDate: '2026-09-01',
    total: 1200,
    amountPaid: 0,
    balance: 1200,
    allowsPartialPayment: true,
    isUndeletable: false,
    isManuallyUpdated: false,
    propertyTimeZone: 'America/New_York',
    overdueMarkedOn: null,
    voidedAt: null,
    deletedAt: null,
    version: 1,
    propertyOwnerId: '55555555-5555-5555-5555-555555555555',
    propertyId: '66666666-6666-6666-6666-666666666666',
    propertyUnitId: '77777777-7777-7777-7777-777777777777',
    tenantId: null,
    rentAgreementId: agreementId,
    leaseId: agreementId,
    scheduleEntryId: '88888888-8888-8888-8888-888888888888',
    additionalChargeIds: [],
    lines: [
      {
        lineId: lineOneId,
        itemType: 'Rent',
        name: 'Rent',
        description: 'Rent — cycle 1',
        quantity: 1,
        rate: 1000,
        amount: 1000,
        lineItemId: null,
        additionalChargeId: null
      },
      {
        lineId: lineTwoId,
        itemType: 'Parking',
        name: 'Parking',
        description: 'Reserved bay',
        quantity: 1,
        rate: 200,
        amount: 200,
        lineItemId: '99999999-9999-9999-9999-999999999999',
        additionalChargeId: null
      }
    ],
    payments: [],
    creditsApplied: [],
    tenantShares: [],
    notes: null,
    isGroupInvoice: true,
    category: 'Rent',
    proposedInvoiceId
  };

  const correctedProposal: ProposedInvoiceDetailResponse = {
    id: proposedInvoiceId,
    occurrenceId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    rentScheduleId: '88888888-8888-8888-8888-888888888888',
    source: 'Schedule',
    category: 'Rent',
    status: 'Planned',
    dueDate: '2026-09-05',
    amount: 1100,
    amountPaid: 0,
    isGroupProposal: true,
    payers: [{ tenantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', amount: 1100, sharePercent: 100, order: 1 }],
    isManuallyUpdated: true,
    lines: [
      {
        lineId: lineOneId,
        source: 'Rent',
        lineItemId: null,
        itemType: 'Rent',
        description: 'Rent — cycle 1',
        quantity: 1,
        rate: 1100,
        appliedSharePercent: 100,
        amount: 1100,
        isAuthored: true
      }
    ]
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateProposedInvoiceComponent, HttpClientTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(UpdateProposedInvoiceComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Loads `body` (the standard invoice unless overridden) and leaves the form seeded from it. */
  function loadInvoice(body: InvoiceDetailResponse = invoice): void {
    component.invoiceIdInput.setValue(invoiceId);
    component.load();
    httpMock.expectOne(`${invoicesUrl}/${invoiceId}`).flush(body);
    fixture.detectChanges();
  }

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('refuses a malformed id inline and issues no request', () => {
    component.invoiceIdInput.setValue('not-a-guid');
    component.load();

    expect(component.idError()).toContain('valid id');
    expect(component.invoice()).toBeNull();
  });

  it('refuses an empty id inline', () => {
    component.invoiceIdInput.setValue('  ');
    component.load();

    expect(component.idError()).toBe('Enter an invoice id.');
  });

  it('loads the invoice and seeds the due date and one row per line, each keeping its lineId', () => {
    loadInvoice();

    expect(component.invoice()?.invoiceNumber).toBe('INV-092026-000042');
    expect(component.form.get('dueDate')!.value).toBe('2026-09-01');
    expect(component.lines.length).toBe(2);
    expect(component.lines.at(0).get('lineId')!.value).toBe(lineOneId);
    expect(component.lines.at(1).get('lineId')!.value).toBe(lineTwoId);
    expect(component.lines.at(1).get('lineItemId')!.value).toBe('99999999-9999-9999-9999-999999999999');
  });

  it('reports a failed load with the problem detail and loads nothing', () => {
    component.invoiceIdInput.setValue(invoiceId);
    component.load();

    httpMock.expectOne(`${invoicesUrl}/${invoiceId}`).flush(
      { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Invoice not found.' },
      { status: 404, statusText: 'Not Found' }
    );

    expect(component.loadError()).toBe('Invoice not found.');
    expect(component.invoice()).toBeNull();
  });

  it('sends only dueDate when only the due date changed — lines stay absent, so their ids are untouched', () => {
    loadInvoice();

    component.form.get('dueDate')!.setValue('2026-09-05');
    component.submit();

    const request = httpMock.expectOne(patchUrl);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body.dueDate).toBe('2026-09-05');
    expect('lines' in request.request.body).toBeFalse();

    request.flush(correctedProposal);
  });

  it('sends the COMPLETE line set with every original lineId when one line is edited', () => {
    loadInvoice();

    component.lines.at(0).get('rate')!.setValue(1100);
    component.submit();

    const request = httpMock.expectOne(patchUrl);
    const lines = request.request.body.lines;

    expect(lines.length).withContext('a partial array would delete the untouched line').toBe(2);
    expect(lines[0].lineId).toBe(lineOneId);
    expect(lines[0].rate).toBe(1100);
    expect(lines[1].lineId).toBe(lineTwoId);
    expect(lines[1].rate).toBe(200);
    expect('dueDate' in request.request.body).toBeFalse();

    request.flush(correctedProposal);
  });

  it('expresses a removal by omitting the row, keeping the survivors ids', () => {
    loadInvoice();

    component.removeLine(1);
    component.submit();

    const request = httpMock.expectOne(patchUrl);
    const lines = request.request.body.lines;

    expect(lines.length).toBe(1);
    expect(lines[0].lineId).toBe(lineOneId);

    request.flush(correctedProposal);
  });

  it('refuses to remove the last line, since the endpoint rejects an empty lines array', () => {
    loadInvoice();

    component.removeLine(1);
    component.removeLine(0);

    expect(component.lines.length).toBe(1);
    expect(component.submitNotice()).toContain('at least one line');
  });

  it('sends a brand-new row with no lineId, which is how an addition is expressed', () => {
    loadInvoice();

    component.addLine();
    component.lines.at(2).patchValue({
      itemType: 'Late Fee',
      description: 'Late fee for September',
      quantity: 1,
      rate: 50
    });
    component.submit();

    const request = httpMock.expectOne(patchUrl);
    const lines = request.request.body.lines;

    expect(lines.length).toBe(3);
    expect('lineId' in lines[2]).toBeFalse();
    expect(lines[2].description).toBe('Late fee for September');

    request.flush(correctedProposal);
  });

  it('never sends an amount on a line — the server derives it from quantity x rate', () => {
    loadInvoice();

    component.lines.at(0).get('quantity')!.setValue(2);
    component.submit();

    const request = httpMock.expectOne(patchUrl);
    for (const line of request.request.body.lines) {
      expect('amount' in line).toBeFalse();
    }

    request.flush(correctedProposal);
  });

  it('addresses the PATCH with the ids from the loaded invoice, not from anything typed', () => {
    loadInvoice();

    component.form.get('dueDate')!.setValue('2026-09-05');
    component.submit();

    // expectOne on the fully-built URL is the assertion: a wrong agreement or proposal id would not match.
    httpMock.expectOne(patchUrl).flush(correctedProposal);
  });

  it('sends nothing when nothing changed, and says so', () => {
    loadInvoice();

    component.submit();

    expect(component.submitNotice()).toContain('Nothing has changed');
    httpMock.expectNone(patchUrl);
  });

  it('refuses locally when the invoice has no proposal behind it', () => {
    loadInvoice({ ...invoice, proposedInvoiceId: null });

    expect(component.isCorrectable).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('cannot be corrected');

    component.form.get('dueDate')!.setValue('2026-09-05');
    component.submit();

    expect(component.submitNotice()).toContain('no proposal behind it');
    httpMock.expectNone(patchUrl);
  });

  it('renders a 422 detail and keeps the edits on screen for a retry', () => {
    loadInvoice();

    component.form.get('dueDate')!.setValue('2026-09-05');
    component.submit();

    httpMock.expectOne(patchUrl).flush(
      {
        type: 'about:blank',
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'This proposed invoice can no longer be edited: money has been recorded against it.'
      },
      { status: 422, statusText: 'Unprocessable Entity' }
    );
    fixture.detectChanges();

    expect(component.submitError()).toBe(
      'This proposed invoice can no longer be edited: money has been recorded against it.'
    );
    expect(component.form.get('dueDate')!.value).toBe('2026-09-05');
    expect(component.lines.length).toBe(2);
    expect(component.updatedProposal()).toBeNull();
  });

  it('re-seeds the form from the returned proposal, so a second correction starts from the new truth', () => {
    loadInvoice();

    component.lines.at(0).get('rate')!.setValue(1100);
    component.submit();
    httpMock.expectOne(patchUrl).flush(correctedProposal);
    fixture.detectChanges();

    expect(component.updatedProposal()?.amount).toBe(1100);
    expect(component.form.get('dueDate')!.value).toBe('2026-09-05');
    expect(component.lines.length).withContext('re-seeded from the response, not the load').toBe(1);
    expect(component.lines.at(0).get('rate')!.value).toBe(1100);

    // And the baseline moved with it: submitting again with no further change sends nothing.
    component.submit();
    expect(component.submitNotice()).toContain('Nothing has changed');
    httpMock.expectNone(patchUrl);
  });

  it('blocks submission when a line is missing a description or has a zero quantity', () => {
    loadInvoice();

    component.lines.at(0).get('description')!.setValue('');
    component.submit();

    expect(component.submitNotice()).toContain('description');
    httpMock.expectNone(patchUrl);

    component.lines.at(0).get('description')!.setValue('Rent — cycle 1');
    component.lines.at(0).get('quantity')!.setValue(0);
    component.submit();

    expect(component.submitNotice()).toContain('above zero');
    httpMock.expectNone(patchUrl);
  });

  it('does not submit twice while a request is in flight', () => {
    loadInvoice();

    component.form.get('dueDate')!.setValue('2026-09-05');
    component.submit();
    component.submit();

    httpMock.expectOne(patchUrl).flush(correctedProposal);
  });

  it('computes a row amount and the running total from quantity x rate', () => {
    loadInvoice();

    expect(component.lineAmount(0)).toBe(1000);
    expect(component.linesTotal).toBe(1200);

    component.lines.at(0).get('quantity')!.setValue(2);
    expect(component.lineAmount(0)).toBe(2000);
    expect(component.linesTotal).toBe(2200);
  });

  it('clears the previous invoice before a second lookup', () => {
    loadInvoice();
    component.lines.at(0).get('rate')!.setValue(1100);
    component.submit();
    httpMock.expectOne(patchUrl).flush(correctedProposal);

    component.invoiceIdInput.setValue('cccccccc-cccc-cccc-cccc-cccccccccccc');
    component.load();

    expect(component.invoice()).toBeNull();
    expect(component.updatedProposal()).toBeNull();
    expect(component.lines.length).toBe(0);

    httpMock.expectOne(`${invoicesUrl}/cccccccc-cccc-cccc-cccc-cccccccccccc`).flush(invoice);
  });
});
