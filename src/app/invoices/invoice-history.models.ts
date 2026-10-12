/**
 * The wire shapes of `GET /api/v1/invoices/{id}/history` — one invoice's activity timeline, derived
 * from its Marten event stream on every request (backend spec `12-invoice-history.md` v4).
 *
 * Specified in `docs/specs/rent-agreements/08-invoice-activity-timeline-ui.md`.
 *
 * **Every enum here crosses the wire PascalCase**, unlike the `snake_case` of `InvoiceStatus` and its
 * neighbours in `invoice.models.ts`. That is not an inconsistency to normalise: the backend maps each
 * one to a `string` before serialization — `card.ActivityType.ToString()` — so
 * `JsonStringEnumConverter(SnakeCaseLower)`, which rewrites C# `enum` properties, never sees them.
 */

/** Who a card is attributed to. `System` is a sweep or a machine, not a person. */
export type HistoryActorType = 'System' | 'PropertyOwner' | 'Tenant';

/**
 * The badge on a card.
 *
 * **There is no creation member.** A raise renders no card at all (backend **BR-04**): it seeds the
 * replay the old values are diffed against and nothing else, matching the monolith, whose own
 * `InvoiceActivityType` enum has no creation member either. A timeline's oldest card is the first
 * *change*.
 *
 * The last five are **specified and unproduced**. Late fees, reminders and deposit activity happen in
 * services that announce nothing Billing can fold (backend **D7**, **BR-25**); their badges are fixed
 * now so the response shape does not change when those services are ready. A renderer therefore needs
 * a default branch rather than an exhaustive match — a member can start arriving with no client
 * change at all.
 */
export type InvoiceHistoryActivityType =
  | 'InvoiceEdited'
  | 'PaymentReceived'
  | 'PaymentReversed'
  | 'MarkedOverdue'
  | 'InvoiceVoided'
  | 'InvoiceDeleted'
  | 'LateFeeApplied'
  | 'LateFeeRemoved'
  | 'ReminderSent'
  | 'DepositReturned'
  | 'DepositApplied';

/**
 * Which sentence template produced an entry's {@link InvoiceHistoryEntry.text}.
 *
 * Sent so a client can style or filter **without parsing the prose** — the text is English, composed
 * for people, and reading meaning back out of it would break the first time a word changed.
 */
export type InvoiceHistoryEntryType =
  | 'ItemAdded'
  | 'ItemRemoved'
  | 'RateUpdated'
  | 'QuantityUpdated'
  | 'DescriptionUpdated'
  | 'ItemRenamed'
  | 'DueDateChanged'
  | 'TenantSplitUpdated'
  | 'PaymentReceived'
  | 'PaymentReversed'
  | 'MarkedOverdue'
  | 'InvoiceVoided'
  | 'InvoiceDeleted'
  | 'LateFeeApplied'
  | 'LateFeeRemoved'
  | 'ReminderSent'
  | 'DepositReturned'
  | 'DepositApplied';

/** Who made the change a card records. */
export interface HistoryActor {
  type: HistoryActorType;

  /** The acting principal. `null` only for `System`, matching the backend's `EventActor`. */
  id?: string | null;

  /**
   * The display name, or `null` when there is none.
   *
   * `null` for a `System` actor, which is never looked up, and for any actor the server's Identity
   * lookup could not resolve — that lookup is uncached, made once per render, and **degrades rather
   * than fails** (backend **BR-21**, **BR-31**). So the same invoice can answer named sentences on one
   * read and unnamed ones on the next with nothing wrong anywhere.
   *
   * **Put nothing in its place.** When the name is absent the sentence beside it has already dropped
   * its trailing `by …` clause, so a placeholder here would contradict the text it sits next to.
   */
  name?: string | null;
}

/** One change inside one event — one sentence. */
export interface InvoiceHistoryEntry {
  /**
   * The entry's 0-based position on its card.
   *
   * The order is the server's: when one line changes several fields in one correction the sentences
   * come back as name → description → quantity → rate (backend **BR-11**), regardless of how the event
   * serialised. Read it; do not re-sort by it.
   */
  sequence: number;

  type: InvoiceHistoryEntryType;

  /**
   * The finished sentence, always ending in a full stop.
   *
   * **Plain text, and unescaped.** The server interpolates owner-supplied values verbatim with no
   * markup (backend **BR-09**) — the monolith emits `<strong>$130.00</strong>` and Billing
   * deliberately does not — so a line item somebody named `<b>Rent</b>` arrives with those characters
   * in it. Rendered through interpolation that reads back exactly as typed; rendered through
   * `[innerHTML]` it is stored XSS with an owner-controlled payload.
   */
  text: string;
}

/** One appended event, as one card on the timeline (backend **BR-14**). */
export interface InvoiceHistoryCard {
  /**
   * The Marten event id that produced this card.
   *
   * Stable across renders — nothing about the timeline is stored, so this is the only identity a card
   * has — which makes it the `@for` track key.
   */
  groupId: string;

  /**
   * The event's version on the invoice's stream, and the timeline's **descending sort key**
   * (backend **BR-15**).
   *
   * Cards are ordered by this and not by time, because two events appended in one transaction share an
   * instant but have a strict version order. Re-sorting by {@link occurredAt} would shuffle exactly the
   * pairs this ordering exists to separate.
   */
  streamVersion: number;

  activityType: InvoiceHistoryActivityType;

  /**
   * The badge's text, e.g. `Invoice Edited`.
   *
   * Rendered as sent rather than derived from {@link activityType}, so one wording serves every
   * consumer — the same argument that puts the sentences on the server.
   */
  subject: string;

  /**
   * When this happened, ISO-8601 carrying the **property's** offset rather than the server's.
   *
   * **Not for display** — {@link occurredAtDisplay} is. This exists for ordering and for machines.
   */
  occurredAt: string;

  /**
   * What a person reads: `Sep 29, 2026 at 2:15 PM`, already in the property's time zone
   * (backend **BR-17**, from `InvoiceRaised.PropertyTimeZone`).
   *
   * **Render this, never {@link occurredAt} through a `DatePipe`**, which would silently render the
   * *viewer's* zone — most often a manager at a desk in a different state from the unit.
   */
  occurredAtDisplay: string;

  actor: HistoryActor;

  /**
   * One sentence per change inside the event. **Never empty** — an event that produces no sentence
   * produces no card at all (backend **BR-18**), so the timeline never shows an empty one.
   */
  entries: InvoiceHistoryEntry[];
}

/**
 * The paging window `GET /api/v1/invoices/{id}/history` accepts.
 *
 * Both members are optional and **omitted from the request when absent**: the endpoint's own defaults
 * are page `1` and page size `50`, which for every invoice this application has seen is the whole
 * history.
 */
export interface InvoiceHistoryQuery {
  /** 1-based. The endpoint refuses anything below `1` with a `400`. */
  page?: number;

  /** `1..200` (backend **BR-24**). Outside that range the endpoint answers `400`. */
  pageSize?: number;
}
