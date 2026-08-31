import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import { LineItemResponse } from '../rent-agreements/line-item.models';
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
  const lineItemsUrl = `${environment.apiBaseUrl}/api/v1/line-items`;
  const patchUrl =
    `${environment.apiBaseUrl}/api/v1/rent/agreements/${agreementId}` +
    `/proposed-invoices/${proposedInvoiceId}`;

  const rentCatalogItem: LineItemResponse = {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    name: 'Monthly Rent',
    itemType: 'Rent',
    isDepositType: false
  };

  const lateFeeCatalogItem: LineItemResponse = {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    name: 'Late Fee',
    itemType: 'LateFee',
    isDepositType: false
  };

  const lineItems: LineItemResponse[] = [rentCatalogItem, lateFeeCatalogItem];

  /** A local-time `Date` for the Material datepicker, matching how `parseIsoDate` builds one. */
  function localDate(iso: string): Date {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

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
      imports: [UpdateProposedInvoiceComponent, HttpClientTestingModule],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(UpdateProposedInvoiceComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  /**
   * Loads `body` (the standard invoice unless overridden) and leaves the form seeded from it, with the
   * item catalog answered too — the load fetches it so the type picker has something to offer.
   */
  function loadInvoice(body: InvoiceDetailResponse = invoice, catalog: LineItemResponse[] = lineItems): void {
    component.invoiceIdInput.setValue(invoiceId);
    component.load();
    httpMock.expectOne(`${invoicesUrl}/${invoiceId}`).flush(body);
    httpMock.expectOne((request) => request.url === lineItemsUrl).flush(catalog);
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
    expect(component.form.get('dueDate')!.value).toEqual(localDate('2026-09-01'));
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

    component.form.get('dueDate')!.setValue(localDate('2026-09-05'));
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
    // Typed through the catalog picker, the way the screen actually does it.
    component.selectLineItem(2, lateFeeCatalogItem);
    component.lines.at(2).patchValue({
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

    component.form.get('dueDate')!.setValue(localDate('2026-09-05'));
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

    component.form.get('dueDate')!.setValue(localDate('2026-09-05'));
    component.submit();

    expect(component.submitNotice()).toContain('no proposal behind it');
    httpMock.expectNone(patchUrl);
  });

  it('renders a 422 detail and keeps the edits on screen for a retry', () => {
    loadInvoice();

    component.form.get('dueDate')!.setValue(localDate('2026-09-05'));
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
    expect(component.form.get('dueDate')!.value).toEqual(localDate('2026-09-05'));
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
    expect(component.form.get('dueDate')!.value).toEqual(localDate('2026-09-05'));
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

    component.form.get('dueDate')!.setValue(localDate('2026-09-05'));
    component.submit();
    component.submit();

    httpMock.expectOne(patchUrl).flush(correctedProposal);
  });

  it('fetches the owner catalog on load, scoped to the invoice category', () => {
    component.invoiceIdInput.setValue(invoiceId);
    component.load();
    httpMock.expectOne(`${invoicesUrl}/${invoiceId}`).flush(invoice);

    const catalogRequest = httpMock.expectOne((request) => request.url === lineItemsUrl);
    expect(catalogRequest.request.method).toBe('GET');
    expect(catalogRequest.request.params.get('propertyOwnerId')).toBe(invoice.propertyOwnerId);
    expect(catalogRequest.request.params.get('scope')).toBe('AllExcludingCredit');

    catalogRequest.flush(lineItems);
    expect(component.lineItems().length).toBe(2);
  });

  it('asks for deposit-only items when the invoice is a deposit invoice', () => {
    component.invoiceIdInput.setValue(invoiceId);
    component.load();
    httpMock.expectOne(`${invoicesUrl}/${invoiceId}`).flush({ ...invoice, category: 'Deposit' });

    const catalogRequest = httpMock.expectOne((request) => request.url === lineItemsUrl);
    expect(catalogRequest.request.params.get('scope')).toBe('DepositOnly');

    catalogRequest.flush([]);
  });

  it('leaves the invoice usable when the catalog fetch fails — only the picker is empty', () => {
    component.invoiceIdInput.setValue(invoiceId);
    component.load();
    httpMock.expectOne(`${invoicesUrl}/${invoiceId}`).flush(invoice);
    httpMock
      .expectOne((request) => request.url === lineItemsUrl)
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(component.invoice()).not.toBeNull();
    expect(component.lineItems()).toEqual([]);
    expect(component.loadError()).toBeNull();
  });

  it('picking a catalog item sets BOTH the catalog id and the item type on that row', () => {
    loadInvoice();

    component.selectLineItem(0, lateFeeCatalogItem);

    expect(component.lines.at(0).get('lineItemId')!.value).toBe(lateFeeCatalogItem.id);
    expect(component.lines.at(0).get('itemType')!.value).toBe('LateFee');

    component.submit();

    const request = httpMock.expectOne(patchUrl);
    expect(request.request.body.lines[0].lineItemId).toBe(lateFeeCatalogItem.id);
    expect(request.request.body.lines[0].itemType).toBe('LateFee');

    request.flush(correctedProposal);
  });

  it('labels a row by its catalog name, falling back to the item type when it has no catalog id', () => {
    loadInvoice();

    // The rent line comes back with lineItemId null — its type is still known, so the button must not
    // read "Select Type" as though nothing had been chosen.
    expect(component.itemDisplayLabel(0)).toBe('Rent');
    expect(component.isItemUnset(0)).toBeFalse();

    component.selectLineItem(0, rentCatalogItem);
    expect(component.itemDisplayLabel(0)).toBe('Monthly Rent');

    component.addLine();
    expect(component.itemDisplayLabel(2)).toBe('Select Type');
    expect(component.isItemUnset(2)).toBeTrue();
  });

  it('opens the picker at the clicked row, toggles it shut, and closes it when a row is removed', () => {
    loadInvoice();

    const event = {
      currentTarget: { getBoundingClientRect: () => ({ bottom: 120, left: 40 }) }
    } as unknown as MouseEvent;

    component.toggleItemPicker(1, event);
    expect(component.openItemPickerIndex()).toBe(1);
    expect(component.itemPickerPosition()).toEqual({ top: 120, left: 40 });

    component.toggleItemPicker(1, event);
    expect(component.openItemPickerIndex()).toBeNull();

    component.toggleItemPicker(1, event);
    component.removeLine(1);
    expect(component.openItemPickerIndex())
      .withContext('every row after the removed one shifted up, so an open menu now points elsewhere')
      .toBeNull();
  });

  it('blocks submission when an added row has no item type picked', () => {
    loadInvoice();

    component.addLine();
    component.lines.at(2).patchValue({ description: 'Something', quantity: 1, rate: 10 });
    component.submit();

    expect(component.submitNotice()).toContain('item type');
    httpMock.expectNone(patchUrl);
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
    httpMock.expectOne((request) => request.url === lineItemsUrl).flush(lineItems);
  });
});

describe('UpdateProposedInvoiceComponent reached from the invoice list', () => {
  const invoiceId = '8f14e45f-ceea-467e-bd9f-000000000001';
  const invoicesUrl = `${environment.apiBaseUrl}/api/v1/invoices`;
  const lineItemsUrl = `${environment.apiBaseUrl}/api/v1/line-items`;

  /** The narrowest invoice the component will accept — this suite only cares that it was fetched. */
  const minimalInvoice = {
    invoiceId,
    invoiceNumber: 'INV-092026-000042',
    dueDate: '2026-09-01',
    propertyOwnerId: '55555555-5555-5555-5555-555555555555',
    rentAgreementId: '11111111-1111-1111-1111-111111111111',
    proposedInvoiceId: '22222222-2222-2222-2222-222222222222',
    category: 'Rent',
    lines: []
  } as unknown as InvoiceDetailResponse;

  /** Builds the fixture with `?invoiceId=` already on the route, as a row link leaves it. */
  async function createWith(queryParams: Record<string, string>) {
    await TestBed.configureTestingModule({
      imports: [UpdateProposedInvoiceComponent, HttpClientTestingModule],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } }
        }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(UpdateProposedInvoiceComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the invoice named by ?invoiceId= without it being retyped', async () => {
    const fixture = await createWith({ invoiceId });
    const httpMock = TestBed.inject(HttpTestingController);

    expect(fixture.componentInstance.invoiceIdInput.value).toBe(invoiceId);

    httpMock.expectOne(`${invoicesUrl}/${invoiceId}`).flush(minimalInvoice);
    httpMock.expectOne((request) => request.url === lineItemsUrl).flush([]);

    expect(fixture.componentInstance.invoice()?.invoiceId).toBe(invoiceId);
    httpMock.verify();
  });

  it('puts a hand-edited parameter through the same GUID check as a typed id', async () => {
    const fixture = await createWith({ invoiceId: 'not-a-guid' });
    const httpMock = TestBed.inject(HttpTestingController);

    expect(fixture.componentInstance.idError()).toContain('valid id');
    httpMock.verify();
  });

  it('stays idle when no parameter is present', async () => {
    const fixture = await createWith({});
    const httpMock = TestBed.inject(HttpTestingController);

    expect(fixture.componentInstance.invoice()).toBeNull();
    expect(fixture.componentInstance.idError()).toBeNull();
    httpMock.verify();
  });
});
