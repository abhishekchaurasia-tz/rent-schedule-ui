import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { InvoiceActivityTimelineComponent } from './invoice-activity-timeline.component';
import { InvoiceHistoryCard } from './invoice-history.models';
import { PagedResult } from './invoice.models';

describe('InvoiceActivityTimelineComponent', () => {
  let fixture: ComponentFixture<InvoiceActivityTimelineComponent>;
  let httpMock: HttpTestingController;

  const invoiceId = '3c7b1e08-92a4-4f57-a0d3-16b8e5c4907a';
  const historyUrl = `${environment.apiBaseUrl}/api/v1/invoices/${invoiceId}/history`;

  /** The backend spec's worked example: a payment at 2:15 PM above the edit at 2:14 PM. */
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

  const page = (items: InvoiceHistoryCard[], over: Partial<PagedResult<InvoiceHistoryCard>> = {}) => ({
    items,
    totalCount: items.length,
    pageNumber: 1,
    pageSize: 50,
    totalPages: items.length ? 1 : 0,
    hasNextPage: false,
    hasPreviousPage: false,
    ...over
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [InvoiceActivityTimelineComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    fixture = TestBed.createComponent(InvoiceActivityTimelineComponent);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Sets the id, lets the effect run, and answers the request it made. */
  function show(cards: InvoiceHistoryCard[], over: Partial<PagedResult<InvoiceHistoryCard>> = {}): void {
    fixture.componentRef.setInput('invoiceId', invoiceId);
    fixture.detectChanges();

    httpMock.expectOne(historyUrl).flush(page(cards, over));
    fixture.detectChanges();
  }

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('asks for nothing until it is given an invoice id', () => {
    fixture.detectChanges();

    httpMock.expectNone(historyUrl);
    expect(fixture.nativeElement.querySelectorAll('.timeline-card').length).toBe(0);
  });

  it('reads the timeline when it is given one', () => {
    show([payment, edit]);

    expect(fixture.nativeElement.querySelectorAll('.timeline-card').length).toBe(2);
  });

  // Requirement 4 / BR-15 — newest first by stream version, in the order the server sent.
  it('renders the cards in the order they arrived', () => {
    show([payment, edit]);

    const badges = Array.from(
      fixture.nativeElement.querySelectorAll('.timeline-badge') as NodeListOf<HTMLElement>
    ).map((badge) => badge.textContent!.trim());

    expect(badges).toEqual(['Payment Received', 'Invoice Edited']);
  });

  // BR-05 — one event is one card, however many things it changed, and BR-11 fixes the order.
  it('keeps both sentences of a single edit on one card, in sequence order', () => {
    show([edit]);

    const entries = Array.from(
      fixture.nativeElement.querySelectorAll('.timeline-entries li') as NodeListOf<HTMLElement>
    ).map((entry) => entry.textContent!.trim());

    expect(entries).toEqual([
      'Pet Deposit item of $130.00 added to the invoice by Kount Testing.',
      'Payment due date updated from Sep 24, 2026 to Sep 30, 2026 by Kount Testing.'
    ]);
  });

  // BR-17 — the string is already in the property's time zone; a DatePipe would render the viewer's.
  it('shows the server-formatted time, not a re-derived one', () => {
    show([payment]);

    expect(fixture.nativeElement.querySelector('.timeline-time').textContent.trim()).toBe(
      'Sep 29, 2026 at 2:15 PM'
    );
  });

  // BR-09 — the sentences are unescaped plain text carrying owner-typed values verbatim. Rendered as
  // markup, a line item named `<b>Rent</b>` would be stored XSS with an owner-controlled payload.
  it('renders an owner-typed value as text and never as markup', () => {
    const nasty: InvoiceHistoryCard = {
      ...edit,
      entries: [
        { sequence: 0, type: 'ItemAdded', text: '<b>Rent</b> item of $900.00 added to the invoice by Kount Testing.' }
      ]
    };

    show([nasty]);

    const entry = fixture.nativeElement.querySelector('.timeline-entries li') as HTMLElement;

    expect(entry.querySelector('b')).toBeNull();
    expect(entry.textContent).toContain('<b>Rent</b>');
  });

  // BR-04 / BR-33 — a raise renders no card, so an untouched invoice legitimately has nothing to show.
  it('says nothing has happened rather than reporting an error on an empty timeline', () => {
    show([]);

    expect(text()).toContain('Nothing has happened to this invoice yet');
    expect(fixture.nativeElement.querySelector('.banner.error')).toBeNull();
  });

  // BR-27 — 404 is "no such invoice", a different answer from the empty page above.
  it('reports a 404 as a failure, distinctly from an empty timeline', () => {
    fixture.componentRef.setInput('invoiceId', invoiceId);
    fixture.detectChanges();

    httpMock.expectOne(historyUrl).flush(
      { detail: 'No invoice was found with the given id.' },
      { status: 404, statusText: 'Not Found' }
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.banner.error')).not.toBeNull();
    expect(text()).toContain('No invoice was found with the given id.');
    expect(text()).not.toContain('Nothing has happened to this invoice yet');
  });

  // BR-25 — five members are specified and unproduced; they must render rather than fall through.
  it('gives a badge it has no rule for the default style', () => {
    const lateFee: InvoiceHistoryCard = {
      ...edit,
      activityType: 'ReminderSent',
      subject: 'Reminder Sent',
      entries: [{ sequence: 0, type: 'ReminderSent', text: 'Payment reminder sent to Hritik Tt by Kount Testing.' }]
    };

    show([lateFee]);

    const badge = fixture.nativeElement.querySelector('.timeline-badge') as HTMLElement;

    expect(badge.textContent!.trim()).toBe('Reminder Sent');
    expect(badge.classList).toContain('badge-other');
  });

  // BR-21/BR-31 — a System actor has no name, and the sentence has already dropped its `by …` clause.
  it('renders a card whose actor has no name without inventing one', () => {
    const sweep: InvoiceHistoryCard = {
      ...edit,
      activityType: 'MarkedOverdue',
      subject: 'Marked Overdue',
      actor: { type: 'System', id: null, name: null },
      entries: [{ sequence: 0, type: 'MarkedOverdue', text: 'Invoice marked overdue on Sep 30, 2026.' }]
    };

    show([sweep]);

    expect(text()).toContain('Invoice marked overdue on Sep 30, 2026.');
    expect(text()).not.toContain('null');
  });

  // Requirement 8 — the envelope is read, not recomputed, and what is missing is said out loud.
  it('says how much it is not showing when the server holds more', () => {
    show([payment], { totalCount: 60, totalPages: 2, hasNextPage: true });

    expect(text()).toContain('Showing the 1 most recent of 60 activities.');
  });

  it('clears the previous invoice timeline when the id changes', () => {
    show([payment, edit]);

    const second = '11111111-2222-4333-8444-555555555555';
    fixture.componentRef.setInput('invoiceId', second);
    fixture.detectChanges();

    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/v1/invoices/${second}/history`)
      .flush(page([]));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.timeline-card').length).toBe(0);
    expect(text()).toContain('Nothing has happened to this invoice yet');
  });

  // The page calls this after a correction saves: a correction appends an event, so the card exists
  // the moment the server answers. A re-read, never an optimistic insert (BR-01).
  it('re-reads on reload, showing the card the correction just created', () => {
    show([edit]);

    fixture.componentInstance.reload();
    fixture.detectChanges();

    httpMock.expectOne(historyUrl).flush(page([payment, edit]));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.timeline-card').length).toBe(2);
  });
});
