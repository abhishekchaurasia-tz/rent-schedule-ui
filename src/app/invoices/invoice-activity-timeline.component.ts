import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, input, signal } from '@angular/core';

import { InvoiceHistoryCard } from './invoice-history.models';
import { InvoiceHistoryService } from './invoice-history.service';

/**
 * The **Invoice Activity** timeline: everything that has ever happened to one invoice, newest first.
 *
 * Specified in `docs/specs/rent-agreements/08-invoice-activity-timeline-ui.md`.
 *
 * **This component renders and does not compose.** The server sends finished plain-English sentences
 * rather than a template id and a bag of values (backend `12-invoice-history.md` **D2**), so that one
 * wording serves every consumer and the money, date and time-zone formatting stays in the one place
 * that knows the invoice's time zone. Everything that arrives is already final; the work here is to
 * not improve any of it. There is no `CurrencyPipe` and no `DatePipe` in this template, deliberately.
 *
 * **Its own component rather than another section of the Update Invoice page** for two reasons that
 * are both about that page: its stylesheet already stands at the 6 kB per-component budget, and its
 * class at 750 lines. A third is about this one — the invoice list's rows are the obvious second
 * caller, and a component that takes an id is reusable where a section of another page is not.
 */
@Component({
  selector: 'app-invoice-activity-timeline',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invoice-activity-timeline.component.html',
  styleUrl: './invoice-activity-timeline.component.scss'
})
export class InvoiceActivityTimelineComponent {
  /**
   * The invoice whose history to show. `null` while the page has nothing loaded.
   *
   * A change re-reads: this is the whole trigger, so a second lookup on the same screen cannot leave
   * the first invoice's timeline underneath the second invoice's figures.
   */
  readonly invoiceId = input<string | null>(null);

  /** The page the server sent, in the order it sent it (requirement 4). Never re-sorted here. */
  readonly cards = signal<InvoiceHistoryCard[]>([]);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Whether a read has completed for the current invoice.
   *
   * Held because an **empty timeline is a real answer**, not a missing one: a raise renders no card
   * (**BR-04**), so an invoice nobody has touched legitimately has nothing to show (**BR-33**).
   * Without this the "nothing has happened yet" message would also appear for the half-second before
   * the first response, and for an invoice whose read failed.
   */
  readonly loaded = signal(false);

  /** The server's total, so the footer can say what is not on screen. */
  readonly totalCount = signal(0);

  /**
   * Whether the server is holding more cards than this page shows.
   *
   * Read from the response rather than computed (requirement 8). Nothing pages yet — the default page
   * of 50 is the whole history for every invoice this application has seen — so this exists to say so
   * honestly rather than to silently truncate.
   */
  readonly hasMore = signal(false);

  constructor(private readonly history: InvoiceHistoryService) {
    effect(() => {
      const invoiceId = this.invoiceId();

      this.reset();

      if (invoiceId) {
        this.fetch(invoiceId);
      }
    });
  }

  /**
   * Re-reads the timeline for the invoice currently shown.
   *
   * Called by the page after a correction saves, because a correction **appends an event** and the
   * timeline is derived from the events — so the card for the edit just made exists the moment the
   * server answers. This is a re-read and not an optimistic insert: nothing is appended here, which is
   * the rule the whole module rests on (**BR-01**). A client-side addition would be a second record,
   * and a second record is exactly what a derived history exists to avoid.
   */
  reload(): void {
    const invoiceId = this.invoiceId();
    if (invoiceId) {
      this.fetch(invoiceId);
    }
  }

  /**
   * The modifier class for a card's badge.
   *
   * **Has a default branch on purpose.** Five members are specified and unproduced — late fees,
   * reminders and deposit activity happen in services that announce nothing Billing can fold
   * (**D7**, **BR-25**) — and their badges were fixed so they can start arriving with no client
   * change. An exhaustive match would make that a rendering bug on the day they do.
   */
  badgeClass(activityType: string): string {
    switch (activityType) {
      case 'PaymentReceived':
      case 'DepositReturned':
      case 'DepositApplied':
        return 'badge-paid';
      case 'PaymentReversed':
      case 'InvoiceVoided':
      case 'InvoiceDeleted':
      case 'LateFeeRemoved':
        return 'badge-removed';
      case 'MarkedOverdue':
      case 'LateFeeApplied':
        return 'badge-overdue';
      case 'InvoiceEdited':
        return 'badge-edited';
      default:
        return 'badge-other';
    }
  }

  /** Reads one page and puts it on screen untouched. */
  private fetch(invoiceId: string): void {
    this.error.set(null);
    this.loading.set(true);

    // No paging window is named, so the endpoint's own page 1 of 50 applies (requirement 2).
    this.history.getHistory(invoiceId).subscribe({
      next: (page) => {
        this.loading.set(false);
        this.loaded.set(true);
        this.cards.set(page.items);
        this.totalCount.set(page.totalCount);
        this.hasMore.set(page.hasNextPage);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loaded.set(false);
        this.cards.set([]);
        this.error.set(InvoiceActivityTimelineComponent.describeError(err));
      }
    });
  }

  /** Clears the previous invoice's timeline so it cannot sit under the next invoice's figures. */
  private reset(): void {
    this.cards.set([]);
    this.error.set(null);
    this.loaded.set(false);
    this.totalCount.set(0);
    this.hasMore.set(false);
  }

  /**
   * The same RFC 9457 reading every JSON screen uses.
   *
   * A `404` here means no stream carries that id (**BR-27**) — which is a different thing from the
   * empty page above, and is why the two are reported separately.
   */
  private static describeError(err: HttpErrorResponse): string {
    const problemDetail = err.error?.detail;
    return typeof problemDetail === 'string' && problemDetail
      ? problemDetail
      : `Request failed: ${err.status} ${err.statusText}`;
  }
}
