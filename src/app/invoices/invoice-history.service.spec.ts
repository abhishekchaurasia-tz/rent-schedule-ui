import { HttpErrorResponse } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { InvoiceHistoryCard } from './invoice-history.models';
import { InvoiceHistoryService } from './invoice-history.service';
import { PagedResult } from './invoice.models';

describe('InvoiceHistoryService', () => {
  let service: InvoiceHistoryService;
  let httpMock: HttpTestingController;

  const invoiceId = '3c7b1e08-92a4-4f57-a0d3-16b8e5c4907a';
  const historyUrl = `${environment.apiBaseUrl}/api/v1/invoices/${invoiceId}/history`;

  /**
   * The backend spec's worked example: the 2:14 PM edit that added a line *and* moved the due date —
   * one event, one card, two sentences — with the 2:15 PM payment above it.
   */
  const payment: InvoiceHistoryCard = {
    groupId: '8f1c02a6-7b44-4f0e-9a51-2d3e6c1b5074',
    streamVersion: 3,
    activityType: 'PaymentReceived',
    subject: 'Payment Received',
    occurredAt: '2026-09-29T14:15:00-04:00',
    occurredAtDisplay: 'Sep 29, 2026 at 2:15 PM',
    actor: { type: 'PropertyOwner', id: 'b7e2c1d4-0000-4000-8000-000000000001', name: 'Kount Testing' },
    entries: [
      {
        sequence: 0,
        type: 'PaymentReceived',
        text: 'Payment of $20.00 received on September 29, 2026 through Cash from Hritik Tt recorded by Kount Testing.'
      }
    ]
  };

  const edit: InvoiceHistoryCard = {
    groupId: '2a90b31d-55c7-4e18-8b6f-90a4d7e2c113',
    streamVersion: 2,
    activityType: 'InvoiceEdited',
    subject: 'Invoice Edited',
    occurredAt: '2026-09-29T14:14:00-04:00',
    occurredAtDisplay: 'Sep 29, 2026 at 2:14 PM',
    actor: { type: 'PropertyOwner', id: 'b7e2c1d4-0000-4000-8000-000000000001', name: 'Kount Testing' },
    entries: [
      { sequence: 0, type: 'ItemAdded', text: 'Pet Deposit item of $130.00 added to the invoice by Kount Testing.' },
      {
        sequence: 1,
        type: 'DueDateChanged',
        text: 'Payment due date updated from Sep 24, 2026 to Sep 30, 2026 by Kount Testing.'
      }
    ]
  };

  const page = (items: InvoiceHistoryCard[]): PagedResult<InvoiceHistoryCard> => ({
    items,
    totalCount: items.length,
    pageNumber: 1,
    pageSize: 50,
    totalPages: items.length ? 1 : 0,
    hasNextPage: false,
    hasPreviousPage: false
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });

    service = TestBed.inject(InvoiceHistoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Requirements 1, 2 and 5.
  it('asks for the timeline with no paging parameters and no scope of its own', () => {
    service.getHistory(invoiceId).subscribe();

    const request = httpMock.expectOne(historyUrl);

    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.headers.has('PropertyOwnerUid')).toBeFalse();

    request.flush(page([]));
  });

  // Requirement 3.
  it('sends page and pageSize when the caller names them', () => {
    service.getHistory(invoiceId, { page: 2, pageSize: 25 }).subscribe();

    const request = httpMock.expectOne((candidate) => candidate.url === historyUrl);

    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('25');

    request.flush(page([]));
  });

  // Requirement 3 — an omitted member is omitted, never sent blank. `pageSize=` is an invalid page
  // size rather than the absence of one, and the endpoint answers 400 to it.
  it('omits the member the caller did not name', () => {
    service.getHistory(invoiceId, { page: 3 }).subscribe();

    const request = httpMock.expectOne((candidate) => candidate.url === historyUrl);

    expect(request.request.params.get('page')).toBe('3');
    expect(request.request.params.has('pageSize')).toBeFalse();

    request.flush(page([]));
  });

  // Requirement 4. The order is the server's: newest first by `streamVersion`, not by time.
  it('answers the cards in the order they arrived', () => {
    let actual: PagedResult<InvoiceHistoryCard> | undefined;
    service.getHistory(invoiceId).subscribe((result) => (actual = result));

    httpMock.expectOne(historyUrl).flush(page([payment, edit]));

    expect(actual!.items.map((card) => card.streamVersion)).toEqual([3, 2]);
  });

  // Requirement 4 — and BR-05: one event is one card, however many things it changed.
  it('keeps both sentences of a single edit on one card, in sequence order', () => {
    let actual: PagedResult<InvoiceHistoryCard> | undefined;
    service.getHistory(invoiceId).subscribe((result) => (actual = result));

    httpMock.expectOne(historyUrl).flush(page([payment, edit]));

    const entries = actual!.items[1].entries;

    expect(entries.map((entry) => entry.sequence)).toEqual([0, 1]);
    expect(entries.map((entry) => entry.type)).toEqual(['ItemAdded', 'DueDateChanged']);
  });

  // Requirement 8 — the envelope is read, never recomputed.
  it('reports the paging envelope the server sent', () => {
    let actual: PagedResult<InvoiceHistoryCard> | undefined;
    service.getHistory(invoiceId).subscribe((result) => (actual = result));

    httpMock.expectOne(historyUrl).flush({
      ...page([payment]),
      totalCount: 60,
      totalPages: 2,
      hasNextPage: true
    });

    expect(actual!.totalCount).toBe(60);
    expect(actual!.hasNextPage).toBeTrue();
    expect(actual!.items.length).toBe(1);
  });

  // Requirement 9. A raise renders no card (BR-04), so a freshly raised invoice has an empty timeline
  // by design — a success, not a failure.
  it('treats an empty page as a success', () => {
    let actual: PagedResult<InvoiceHistoryCard> | undefined;
    let failed = false;

    service.getHistory(invoiceId).subscribe({
      next: (result) => (actual = result),
      error: () => (failed = true)
    });

    httpMock.expectOne(historyUrl).flush(page([]));

    expect(failed).toBeFalse();
    expect(actual!.items).toEqual([]);
    expect(actual!.totalCount).toBe(0);
  });

  // Requirement 7. The Identity lookup is uncached and degrades rather than fails (BR-21, BR-31), so a
  // card whose actor has no name is an ordinary 200 — and the sentence has already dropped its `by …`
  // clause, which is why nothing may be substituted for it.
  it('accepts a card whose actor has no id and no name', () => {
    const sweep: InvoiceHistoryCard = {
      ...edit,
      groupId: 'd1f0a7c2-1111-4000-8000-000000000002',
      streamVersion: 4,
      activityType: 'MarkedOverdue',
      subject: 'Marked Overdue',
      actor: { type: 'System', id: null, name: null },
      entries: [{ sequence: 0, type: 'MarkedOverdue', text: 'Invoice marked overdue on Sep 30, 2026.' }]
    };

    let actual: PagedResult<InvoiceHistoryCard> | undefined;
    service.getHistory(invoiceId).subscribe((result) => (actual = result));

    httpMock.expectOne(historyUrl).flush(page([sweep]));

    expect(actual!.items[0].actor.name).toBeNull();
    expect(actual!.items[0].entries[0].text).not.toContain('by');
  });

  // Requirements 10 and 12. 404 means no stream carries that id (BR-27) — distinct from the empty
  // page above — and the body is ordinary JSON, so the existing RFC 9457 `detail` reading applies.
  it('propagates a 404 with its Problem Details body readable as JSON', () => {
    let error: HttpErrorResponse | undefined;

    service.getHistory(invoiceId).subscribe({
      next: () => fail('expected the request to fail'),
      error: (err: HttpErrorResponse) => (error = err)
    });

    httpMock.expectOne(historyUrl).flush(
      { type: 'about:blank', title: 'Not Found', status: 404, detail: 'No invoice was found with the given id.' },
      { status: 404, statusText: 'Not Found' }
    );

    expect(error!.status).toBe(404);
    expect(error!.error.detail).toBe('No invoice was found with the given id.');
  });

  // Requirement 11. A deleted invoice still answers its whole history, ending with the card that
  // records the deletion — the same rule `GET /invoices/{id}` follows.
  it('reads a deleted invoice history, ending with the deletion card', () => {
    const deleted: InvoiceHistoryCard = {
      ...edit,
      groupId: 'c4b3a2d1-2222-4000-8000-000000000003',
      streamVersion: 5,
      activityType: 'InvoiceDeleted',
      subject: 'Invoice Deleted',
      entries: [
        { sequence: 0, type: 'InvoiceDeleted', text: 'Invoice deleted by Kount Testing. Reason: Duplicate.' }
      ]
    };

    let actual: PagedResult<InvoiceHistoryCard> | undefined;
    service.getHistory(invoiceId).subscribe((result) => (actual = result));

    httpMock.expectOne(historyUrl).flush(page([deleted, payment, edit]));

    expect(actual!.items[0].activityType).toBe('InvoiceDeleted');
    expect(actual!.items.length).toBe(3);
  });
});
