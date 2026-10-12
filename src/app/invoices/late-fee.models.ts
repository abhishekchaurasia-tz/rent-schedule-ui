/**
 * The late fee routes' wire shapes, as Billing spec `16-late-fee-consumer.md` v13 defines them.
 *
 * Specified in `docs/specs/rent-agreements/07-late-fee-ui.md` — API Endpoints & Server Operations.
 */

/** One live late fee line, as `GET …/late-fee` lists it. It carries no publisher `lineKey`. */
export interface LateFeeLineResponse {
  lineId: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

/**
 * `GET /api/v1/invoices/{id}/late-fee`: the invoice's late fee, what part of it is paid, what a removal
 * would take off, and the two marks that stop further late fees.
 *
 * **The marks and the figures move at different times.** The marks are read from the billing plan and
 * change as soon as a change commits; the amounts and lines are the issued invoice's and change only once
 * the reconcile has run.
 */
export interface LateFeeSummaryResponse {
  invoiceId: string;
  dueDate: string;
  invoiceType: string;
  /** The invoice total, late fee lines included. */
  invoiceAmount: number;
  /** Paid plus processing. */
  paidAmount: number;
  lateFeeAmount: number;
  /** The part of the late fee a removal keeps (backend BR-11). */
  paidLateFeeAmount: number;
  /** What a removal takes off. */
  remainingLateFeeAmount: number;
  /** "Late fee removed": no further late fee is applied. */
  isLateFeeRemoved: boolean;
  /** "Late fee edited": an owner changed a late fee line, which also sets the removed mark. */
  isLateFeeEdited: boolean;
  lines: LateFeeLineResponse[];
}

/** One line of a late fee list, as the late fee event carries it. */
export interface LateFeeLineInput {
  lineKey: string;
  description: string;
  /** A whole number of intervals (backend BR-37). */
  quantity: number;
  rate: number;
  /** Exactly `quantity × rate` (backend BR-38). */
  amount: number;
}

/** The body of `PUT /api/v1/invoices/{id}/late-fee`: the event's body without its invoice id. */
export interface ApplyLateFeesRequest {
  /** ISO 8601. Only a calculation later than the last one applied changes anything (backend BR-04). */
  calculatedAtUtc: string;
  /** Every late fee line the invoice should carry; empty for none. */
  lines: LateFeeLineInput[];
}

/** What `PUT …/late-fee` did. A skip is a `200`, not an error (backend A13). */
export interface ApplyLateFeesResponse {
  outcome: 'applied' | 'skipped';
  skipReason: string | null;
  linesChanged: boolean;
}

/** The late fee block on `GET /api/v1/invoices/{id}` (backend D31). */
export interface InvoiceLateFeeResponse {
  lateFeeAmount: number;
  paidLateFeeAmount: number;
  remainingLateFeeAmount: number;
  isLateFeeRemoved: boolean;
  isLateFeeEdited: boolean;
}
