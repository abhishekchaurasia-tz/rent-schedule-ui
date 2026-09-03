import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import {
  AdditionalChargeCreationRequest,
  RentAgreementDetailResponse
} from '../rent-agreements/rent-agreement.models';
import { InvoiceListComponent } from './invoice-list.component';
import { InvoiceSummaryResponse, PagedResult } from './invoice.models';

describe('InvoiceListComponent', () => {
  let fixture: ComponentFixture<InvoiceListComponent>;
  let component: InvoiceListComponent;
  let httpMock: HttpTestingController;

  const invoicesUrl = `${environment.apiBaseUrl}/api/v1/invoices`;
  const ownerId = '55555555-5555-5555-5555-555555555555';
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';

  const overdueRow: InvoiceSummaryResponse = {
    invoiceId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    invoiceNumber: 'INV-082026-000002',
    invoiceType: 'rent',
    status: 'overdue',
    generatedOn: '2026-08-01',
    dueDate: '2026-08-27',
    total: 400,
    amountPaid: 0,
    balance: 400,
    propertyId: '66666666-6666-6666-6666-666666666666',
    propertyUnitId: '77777777-7777-7777-7777-777777777777',
    tenantId: null,
    rentAgreementId: '88888888-8888-8888-8888-888888888888',
    leaseId: '88888888-8888-8888-8888-888888888888',
    paidOn: null,
    tenantIds: [tenantA, tenantB]
  };

  const paidRow: InvoiceSummaryResponse = {
    ...overdueRow,
    invoiceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    invoiceNumber: 'INV-082026-000001',
    status: 'received',
    dueDate: '2026-08-14',
    total: 400,
    amountPaid: 400,
    balance: 0,
    tenantId: tenantA,
    paidOn: '2026-08-24',
    tenantIds: []
  };

  function page(
    items: InvoiceSummaryResponse[],
    overrides: Partial<PagedResult<InvoiceSummaryResponse>> = {}
  ): PagedResult<InvoiceSummaryResponse> {
    return {
      items,
      totalCount: items.length,
      pageNumber: 1,
      pageSize: 50,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      ...overrides
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvoiceListComponent, HttpClientTestingModule],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceListComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Runs a search for the standard owner and flushes `body`. */
  function search(body: PagedResult<InvoiceSummaryResponse> = page([paidRow, overdueRow])) {
    component.filters.get('propertyOwnerId')!.setValue(ownerId);
    component.search();
    const request = httpMock.expectOne((r) => r.url === invoicesUrl);
    request.flush(body);
    fixture.detectChanges();
    return request;
  }

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('refuses a malformed owner id inline and issues no request', () => {
    component.filters.get('propertyOwnerId')!.setValue('not-a-guid');
    component.search();

    expect(component.idError()).toContain('valid id');
    expect(component.result()).toBeNull();
  });

  it('refuses an empty owner id, since the endpoint is always owner-scoped', () => {
    component.search();

    expect(component.idError()).toContain('property owner id');
  });

  it('searches with the owner scope and renders one row per invoice with the showing counter', () => {
    const request = search(page([paidRow, overdueRow], { totalCount: 12 }));

    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('propertyOwnerId')).toBe(ownerId);

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('2 of 12');
  });

  it('omits every filter the user did not set', () => {
    const request = search();

    expect(request.request.params.has('invoiceNumber')).toBeFalse();
    expect(request.request.params.has('dueDateFrom')).toBeFalse();
    expect(request.request.params.has('outstandingOnly')).toBeFalse();
    expect(request.request.params.has('includeDeleted')).toBeFalse();
    expect(request.request.params.has('status')).toBeFalse();
  });

  it('sends the filters the user did set', () => {
    component.filters.patchValue({
      propertyOwnerId: ownerId,
      invoiceNumber: 'INV-082026-000002',
      dueDateFrom: '2026-08-01',
      dueDateTo: '2026-08-31',
      outstandingOnly: true,
      includeDeleted: true,
      pageSize: 25
    });
    component.search();

    const request = httpMock.expectOne((r) => r.url === invoicesUrl);
    expect(request.request.params.get('invoiceNumber')).toBe('INV-082026-000002');
    expect(request.request.params.get('dueDateFrom')).toBe('2026-08-01');
    expect(request.request.params.get('dueDateTo')).toBe('2026-08-31');
    expect(request.request.params.get('outstandingOnly')).toBe('true');
    expect(request.request.params.get('includeDeleted')).toBe('true');
    expect(request.request.params.get('pageSize')).toBe('25');

    request.flush(page([]));
  });

  it('sends two selected statuses as two repeated parameters, which the endpoint unions', () => {
    component.filters.get('propertyOwnerId')!.setValue(ownerId);
    component.toggleStatus('overdue');
    component.toggleStatus('partial_paid');
    component.search();

    const request = httpMock.expectOne((r) => r.url === invoicesUrl);
    expect(request.request.params.getAll('status')).toEqual(['overdue', 'partial_paid']);

    request.flush(page([]));
  });

  it('toggles a status off again', () => {
    component.toggleStatus('overdue');
    expect(component.isStatusSelected('overdue')).toBeTrue();

    component.toggleStatus('overdue');
    expect(component.isStatusSelected('overdue')).toBeFalse();
  });

  it('resets to page 1 when a filter changes after paging forward', () => {
    search(page([paidRow], { pageNumber: 1, totalPages: 3, hasNextPage: true }));

    component.goToPage(2);
    httpMock
      .expectOne((r) => r.url === invoicesUrl && r.params.get('page') === '2')
      .flush(page([overdueRow], { pageNumber: 2, totalPages: 3, hasNextPage: true, hasPreviousPage: true }));
    fixture.detectChanges();

    // A filter change makes page 2 of the old result set meaningless, so the next search restarts.
    component.filters.get('outstandingOnly')!.setValue(true);
    component.onFilterChanged();
    component.refresh();

    const request = httpMock.expectOne((r) => r.url === invoicesUrl);
    expect(request.request.params.get('page')).toBe('1');
    request.flush(page([]));
  });

  it('labels `received` as Fully Paid and `overdue` as Overdue, each with its badge class', () => {
    search();

    expect(component.statusPresentation('received')).toEqual({ label: 'Fully Paid', className: 'paid' });
    expect(component.statusPresentation('overdue')).toEqual({ label: 'Overdue', className: 'overdue' });
    expect(fixture.nativeElement.textContent).toContain('Fully Paid');
    expect(fixture.nativeElement.querySelector('.status-badge.paid')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.status-badge.overdue')).toBeTruthy();
  });

  it('shows the invoice type, labelled the way the backend\'s own display names read (v6)', () => {
    expect(component.typeLabel('rent')).toBe('Rent');
    expect(component.typeLabel('deposit')).toBe('Security Deposit');
    // An unrecognised token passes through rather than blanking the cell, same as statusPresentation.
    expect(component.typeLabel('some_future_type')).toBe('some_future_type');

    search(page([{ ...overdueRow, invoiceType: 'deposit' }]));
    expect(fixture.nativeElement.textContent).toContain('Security Deposit');
  });

  it('no longer shows a Unit column (v6)', () => {
    search();
    expect(fixture.nativeElement.textContent).not.toContain('Unit');
  });

  it('marks a row with a balance as outstanding, driven by the balance and not the status', () => {
    expect(component.isOutstanding(overdueRow)).toBeTrue();
    expect(component.isOutstanding(paidRow)).toBeFalse();

    // A partially-paid invoice still owes money, and must not read as settled.
    expect(component.isOutstanding({ ...paidRow, status: 'partial_paid', amountPaid: 100, balance: 300 }))
      .toBeTrue();

    search();
    expect(fixture.nativeElement.querySelectorAll('tbody tr.outstanding').length).toBe(1);
  });

  it('names the payers from tenantIds, falls back to the tenant lane, and shows a dash for neither', () => {
    const both = component.payerLabel(overdueRow);
    expect(both).toContain(',');

    // A group invoice has a null lane — reading `tenantId` alone would answer this backwards.
    expect(component.payerLabel({ ...paidRow, tenantIds: [], tenantId: tenantA }))
      .toBe(component.payerLabel({ ...paidRow, tenantIds: [tenantA], tenantId: null }));

    expect(component.payerLabel({ ...paidRow, tenantIds: [], tenantId: null })).toBe('—');
  });

  it('shows shortened property and unit references, never invented names', () => {
    expect(component.shortReference(overdueRow.propertyId)).toBe('66666666');
    expect(component.shortReference(null)).toBe('—');

    search();
    const firstRow = fixture.nativeElement.querySelector('tbody tr');
    expect(firstRow.querySelector('.property-ref').getAttribute('title')).toBe(overdueRow.propertyId);
  });

  it('renders N/A when an invoice has never been paid, and the date when it has', () => {
    search();

    const cells = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(cells[0].textContent).toContain('2026-08-24');
    expect(cells[1].textContent).toContain('N/A');
  });

  it('pages with the server-reported values and stops at the ends', () => {
    search(page([paidRow], { pageNumber: 2, totalPages: 3, hasNextPage: true, hasPreviousPage: true }));

    component.goToPage(3);
    httpMock
      .expectOne((r) => r.url === invoicesUrl && r.params.get('page') === '3')
      .flush(page([overdueRow], { pageNumber: 3, totalPages: 3, hasNextPage: false, hasPreviousPage: true }));
    fixture.detectChanges();

    // Past the last page the server reported: no request at all.
    component.goToPage(4);
    httpMock.expectNone((r) => r.url === invoicesUrl);

    component.goToPage(0);
    httpMock.expectNone((r) => r.url === invoicesUrl);
  });

  it('refresh re-issues the identical query and re-stamps the timestamp', () => {
    search();
    const firstStamp = component.lastRefreshedAt();
    expect(firstStamp).not.toBeNull();

    component.refresh();
    const request = httpMock.expectOne((r) => r.url === invoicesUrl);
    expect(request.request.params.get('propertyOwnerId')).toBe(ownerId);
    request.flush(page([paidRow]));

    expect(component.lastRefreshedAt()!.getTime()).toBeGreaterThanOrEqual(firstStamp!.getTime());
  });

  it('renders an empty result as "no invoices matched", distinct from not having searched', () => {
    expect(component.hasSearched()).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Enter a property owner id');

    search(page([]));

    expect(component.hasSearched()).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('No invoices matched');
  });

  it('renders a failed search detail verbatim', () => {
    component.filters.get('propertyOwnerId')!.setValue(ownerId);
    component.search();

    httpMock.expectOne((r) => r.url === invoicesUrl).flush(
      {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'PageSize must not exceed 200.'
      },
      { status: 400, statusText: 'Bad Request' }
    );
    fixture.detectChanges();

    expect(component.searchError()).toBe('PageSize must not exceed 200.');
    expect(component.loading()).toBeFalse();
  });

  /** Clicks row `rowIndex`'s ⋮ button, opening its menu (Correct, and Delete/Void when offered). */
  function openRowMenu(rowIndex: number): void {
    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    (rows[rowIndex].querySelector('.row-menu-btn') as HTMLElement).click();
    fixture.detectChanges();
  }

  it('links each row to the correction page carrying its invoice id, from its ⋮ menu', () => {
    search();
    openRowMenu(0);

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.row-menu a');
    expect(link.getAttribute('href')).toBe(`/invoices/update?invoiceId=${paidRow.invoiceId}`);
  });

  describe('the "Add Invoice" side panel', () => {
    const agreementId = '99999999-9999-9999-9999-999999999999';
    const agreementUrl = `${environment.apiBaseUrl}/api/v1/rent/agreements/${agreementId}`;
    const chargeUrl = `${agreementUrl}/additional-charges`;
    const lineItemsUrl = `${environment.apiBaseUrl}/api/v1/line-items`;

    const agreement = {
      agreementId,
      propertyOwnerId: ownerId,
      startDate: '2026-09-01',
      endDate: '2027-08-31',
      scheduleRows: []
    } as unknown as RentAgreementDetailResponse;

    /** The shape the fee panel emits — a minimal, valid one-time charge. */
    const emittedCharge: AdditionalChargeCreationRequest = {
      notes: null,
      alreadyPaid: 0,
      attachedWithRentalInvoice: false,
      isRecurring: false,
      dueDate: '2026-10-01',
      frequency: null,
      frequencyConfig: null,
      startDate: null,
      endDate: null,
      hasNoEndDate: false,
      items: [
        {
          lineItemId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          itemType: 'Parking',
          description: 'Reserved bay',
          quantity: 1,
          rate: 50,
          amount: 50
        }
      ]
    };

    const createdCharge = {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      category: 'Rent',
      items: [{ id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', amount: 50 }]
    } as never;

    /** Opens the panel and gets past its first step onto the fee form. */
    function openToFeeStep(): void {
      component.openAddInvoice();
      component.addInvoiceAgreementId.setValue(agreementId);
      component.loadAgreementForCharge();
      httpMock.expectOne(agreementUrl).flush(agreement);
      fixture.detectChanges();
      // The fee panel fetches the catalog as soon as it renders.
      httpMock.expectOne((r) => r.url === lineItemsUrl).flush([]);
    }

    it('opens on the agreement step, with the id typed rather than taken from the rows', () => {
      search();
      component.openAddInvoice();
      fixture.detectChanges();

      expect(component.addInvoiceStep()).toBe('agreement');
      expect(component.addInvoiceAgreementId.value).toBe('');
      expect(fixture.nativeElement.textContent).toContain('Which lease is this for?');
    });

    it('is available before any search has been run — adding does not depend on the list', () => {
      expect(component.result()).toBeNull();

      component.openAddInvoice();

      expect(component.addInvoiceStep()).toBe('agreement');
    });

    it('refuses a malformed or empty agreement id without calling the API', () => {
      component.openAddInvoice();
      component.loadAgreementForCharge();
      expect(component.addInvoiceIdError()).toBe('Enter a rent agreement id.');

      component.addInvoiceAgreementId.setValue('not-a-guid');
      component.loadAgreementForCharge();
      expect(component.addInvoiceIdError()).toContain('valid id');
      expect(component.addInvoiceStep()).toBe('agreement');
    });

    it('reports an unknown lease on the first step instead of advancing', () => {
      component.openAddInvoice();
      component.addInvoiceAgreementId.setValue(agreementId);
      component.loadAgreementForCharge();

      httpMock.expectOne(agreementUrl).flush(
        { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Rent agreement not found.' },
        { status: 404, statusText: 'Not Found' }
      );

      expect(component.addInvoiceIdError()).toBe('Rent agreement not found.');
      expect(component.addInvoiceStep()).toBe('agreement');
    });

    it('loads the lease, advances to the fee panel, and passes the lease through to it', () => {
      openToFeeStep();

      expect(component.addInvoiceStep()).toBe('fee');
      expect(component.chargePropertyOwnerId).toBe(ownerId);
      expect(component.chargeLeaseStartDate).toBe('2026-09-01');
      expect(component.chargeLeaseEndDate).toBe('2027-08-31');
      expect(fixture.nativeElement.querySelector('app-additional-charge-panel')).toBeTruthy();
    });

    it('derives the month-to-month invoice count only for an open-ended lease', () => {
      openToFeeStep();
      expect(component.chargeMonthToMonthInvoiceCount).toBeNull();

      component.chargeAgreement.set({
        ...agreement,
        endDate: null,
        scheduleRows: [{}, {}]
      } as unknown as RentAgreementDetailResponse);

      expect(component.chargeMonthToMonthInvoiceCount).toBe(2);
    });

    it('posts the fee to the typed lease, closes, and refreshes the list underneath', () => {
      search();
      openToFeeStep();

      component.onChargeCreated(emittedCharge);

      const post = httpMock.expectOne(chargeUrl);
      expect(post.request.method).toBe('POST');
      expect(post.request.body.items.length).toBe(1);
      expect(component.addInvoiceStep()).withContext('panel closed before the response').toBe('fee');

      post.flush(createdCharge);

      expect(component.addInvoiceStep()).toBeNull();
      expect(component.chargeSuccess()).toContain(agreementId);

      // The whole point of adding from this screen: a standalone one-off fee on an active lease raises
      // its own invoice, so the list behind the panel is stale the moment the POST returns.
      const refresh = httpMock.expectOne((r) => r.url === invoicesUrl);
      expect(refresh.request.params.get('propertyOwnerId')).toBe(ownerId);
      refresh.flush(page([paidRow, overdueRow]));
    });

    it('does not refresh when no search has been run — there is no owner scope to search with', () => {
      openToFeeStep();

      component.onChargeCreated(emittedCharge);
      httpMock.expectOne(chargeUrl).flush(createdCharge);

      expect(component.chargeSuccess()).not.toBeNull();
      httpMock.expectNone((r) => r.url === invoicesUrl);
    });

    it('keeps the fee panel open on a 422 and renders the detail', () => {
      openToFeeStep();

      component.onChargeCreated(emittedCharge);
      httpMock.expectOne(chargeUrl).flush(
        {
          type: 'about:blank',
          title: 'Unprocessable Entity',
          status: 422,
          detail: 'A deposit item cannot be mixed with rent items.'
        },
        { status: 422, statusText: 'Unprocessable Entity' }
      );
      fixture.detectChanges();

      expect(component.chargeError()).toBe('A deposit item cannot be mixed with rent items.');
      expect(component.submittingCharge()).toBeFalse();

      // Still mounted — so the authored fee, and everything typed into it, survived the refusal.
      expect(component.addInvoiceStep()).toBe('fee');
      expect(fixture.nativeElement.querySelector('app-additional-charge-panel')).toBeTruthy();
    });

    it('drops a second submission while one is in flight', () => {
      openToFeeStep();

      component.onChargeCreated(emittedCharge);
      component.onChargeCreated(emittedCharge);

      httpMock.expectOne(chargeUrl).flush(createdCharge);
    });

    it('closing the panel discards the loaded lease', () => {
      openToFeeStep();

      component.closeAddInvoice();

      expect(component.addInvoiceStep()).toBeNull();
      expect(component.chargeAgreement()).toBeNull();
    });
  });

  describe('row-level Delete and Void (spec v5, FR 21-25)', () => {
    const votedRow: InvoiceSummaryResponse = { ...overdueRow, status: 'voided' };
    const deletedRow: InvoiceSummaryResponse = { ...paidRow, status: 'deleted' };

    /** The open ⋮ menu's panel, or `null` when none is open. */
    function openMenuPanel(): HTMLElement | null {
      return fixture.nativeElement.querySelector('.row-menu');
    }

    it('gates the actions in: offered on a live row', () => {
      expect(component.canManageInvoice(overdueRow)).toBeTrue();
      expect(component.canManageInvoice(paidRow)).toBeTrue();
    });

    it('gates the actions out once a row is already voided or deleted', () => {
      expect(component.canManageInvoice(votedRow)).toBeFalse();
      expect(component.canManageInvoice(deletedRow)).toBeFalse();

      search(page([votedRow, deletedRow]));

      openRowMenu(0);
      let menu = openMenuPanel()!;
      expect(menu.textContent).not.toContain('Delete');
      expect(menu.textContent).not.toContain('Void');
      // Correct is unaffected by this gating.
      expect(menu.querySelector('a')).toBeTruthy();

      openRowMenu(1);
      menu = openMenuPanel()!;
      expect(menu.textContent).not.toContain('Delete');
      expect(menu.textContent).not.toContain('Void');
    });

    it('renders Delete and Void in a manageable row\'s ⋮ menu', () => {
      search(page([overdueRow]));
      openRowMenu(0);

      const menu = openMenuPanel()!;
      expect(menu.textContent).toContain('Delete');
      expect(menu.textContent).toContain('Void');
    });

    it('does not call the API until the inline confirmation is accepted', () => {
      search(page([overdueRow]));

      component.beginRowAction(overdueRow, 'delete');
      fixture.detectChanges();

      expect(component.pendingRowAction()).toEqual({ invoiceId: overdueRow.invoiceId, action: 'delete' });
      httpMock.expectNone(`${invoicesUrl}/${overdueRow.invoiceId}`);

      component.cancelRowAction();
      fixture.detectChanges();

      expect(component.pendingRowAction()).toBeNull();
      httpMock.expectNone(`${invoicesUrl}/${overdueRow.invoiceId}`);
    });

    it('confirming Delete calls DELETE, banners success, and re-runs the current search', () => {
      search(page([overdueRow]));

      component.beginRowAction(overdueRow, 'delete');
      component.confirmRowAction(overdueRow);

      const request = httpMock.expectOne(`${invoicesUrl}/${overdueRow.invoiceId}`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();

      expect(component.actionSuccess()).toContain(overdueRow.invoiceNumber);
      expect(component.actionSuccess()).toContain('deleted');
      expect(component.pendingRowAction()).toBeNull();
      expect(component.workingInvoiceId()).toBeNull();

      // The point of FR 24: the list is re-searched rather than the row patched locally.
      const refresh = httpMock.expectOne((r) => r.url === invoicesUrl);
      expect(refresh.request.params.get('propertyOwnerId')).toBe(ownerId);
      refresh.flush(page([]));
    });

    it('confirming Void calls POST …/void, banners success, and re-runs the current search', () => {
      search(page([overdueRow]));

      component.beginRowAction(overdueRow, 'void');
      component.confirmRowAction(overdueRow);

      const request = httpMock.expectOne(`${invoicesUrl}/${overdueRow.invoiceId}/void`);
      expect(request.request.method).toBe('POST');
      request.flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();

      expect(component.actionSuccess()).toContain(overdueRow.invoiceNumber);
      expect(component.actionSuccess()).toContain('voided');

      const refresh = httpMock.expectOne((r) => r.url === invoicesUrl);
      refresh.flush(page([{ ...overdueRow, status: 'voided' }]));
    });

    it('treats an idempotent repeat (204 again) as success, same as a first-time delete', () => {
      search(page([overdueRow]));

      component.beginRowAction(overdueRow, 'delete');
      component.confirmRowAction(overdueRow);
      httpMock
        .expectOne(`${invoicesUrl}/${overdueRow.invoiceId}`)
        .flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === invoicesUrl).flush(page([]));

      expect(component.actionSuccess()).toContain('deleted');
    });

    it('guards against a second confirm while one is already in flight for that row', () => {
      search(page([overdueRow]));

      component.beginRowAction(overdueRow, 'delete');
      component.confirmRowAction(overdueRow);
      component.confirmRowAction(overdueRow);

      // Exactly one DELETE was issued, not two — a second `expectOne` here would fail otherwise.
      const request = httpMock.expectOne(`${invoicesUrl}/${overdueRow.invoiceId}`);
      request.flush(null, { status: 204, statusText: 'No Content' });
      httpMock.expectOne((r) => r.url === invoicesUrl).flush(page([]));

      expect(request.request.method).toBe('DELETE');
    });

    it('renders a 404 detail verbatim in the acting row, and does not refresh the list', () => {
      search(page([overdueRow]));

      openRowMenu(0);
      component.beginRowAction(overdueRow, 'delete');
      component.confirmRowAction(overdueRow);

      httpMock.expectOne(`${invoicesUrl}/${overdueRow.invoiceId}`).flush(
        { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Invoice not found.' },
        { status: 404, statusText: 'Not Found' }
      );
      fixture.detectChanges();

      expect(component.actionError()).toEqual({
        invoiceId: overdueRow.invoiceId,
        message: 'Invoice not found.'
      });
      expect(fixture.nativeElement.textContent).toContain('Invoice not found.');
      expect(component.workingInvoiceId()).toBeNull();
      httpMock.expectNone((r) => r.url === invoicesUrl);
    });

    it('renders a 422 (invoice.has_received_payment) detail verbatim on void', () => {
      search(page([overdueRow]));

      component.beginRowAction(overdueRow, 'void');
      component.confirmRowAction(overdueRow);

      httpMock.expectOne(`${invoicesUrl}/${overdueRow.invoiceId}/void`).flush(
        {
          type: 'about:blank',
          title: 'Unprocessable Entity',
          status: 422,
          detail: 'A payment has been applied to this invoice; it cannot be removed.'
        },
        { status: 422, statusText: 'Unprocessable Entity' }
      );
      fixture.detectChanges();

      expect(component.actionError()?.message).toBe(
        'A payment has been applied to this invoice; it cannot be removed.'
      );
      httpMock.expectNone((r) => r.url === invoicesUrl);
    });
  });
});
