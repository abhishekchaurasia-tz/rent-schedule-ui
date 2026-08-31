/**
 * The wire shapes of `GET /api/v1/invoices/{id}` — the projected invoice with its lines, payments,
 * applied credits and tenant shares embedded (backend spec `02-invoicing.md` FR 29).
 */

/** One line on a projected invoice's face. */
export interface InvoiceLineResponse {
  /**
   * The line's identity — **and the proposed line's identity too**.
   *
   * The backend derives each invoice line's id from the proposed line it came from
   * (`ProposalInvoicePlanner`: *"The invoice line's identity IS the proposed line's identity, not a
   * fresh id"*), which is the whole reason a correction can be addressed from an invoice read: this
   * value is posted straight back as `UpdateProposedLineRequest.lineId`.
   */
  lineId: string;
  itemType: string;
  /** The catalog name the line was billed under. */
  name: string;
  description: string;
  quantity: number;
  rate: number;
  /** Quantity × rate. Read-only: the correction endpoint has no `amount` field to send it back on. */
  amount: number;
  lineItemId?: string | null;
  additionalChargeId?: string | null;
}

/** One payment ever recorded against an invoice. Reversed payments are retained, never removed. */
export interface InvoicePaymentResponse {
  paymentId: string;
  amount: number;
  paidOn: string;
  reversedOn?: string | null;
}

/** One credit applied to an invoice. */
export interface InvoiceCreditResponse {
  creditId: string;
  amount: number;
  appliedOn: string;
  reason: string;
}

/** How an invoice's total divides across the renters it covers — one entry per payer, whatever its shape. */
export interface InvoiceTenantShareResponse {
  tenantId: string;
  ordinal: number;
  amount: number;
}

/**
 * `GET /api/v1/invoices/{id}` — the full projected invoice.
 *
 * Every money and state field here is **derived by the backend's fold**, never assigned: `total`,
 * `amountPaid`, `balance`, `status` and `isUndeletable` are recomputed after each applied event. The UI
 * must render them, never recompute them.
 */
export interface InvoiceDetailResponse {
  invoiceId: string;
  /** The display number, `INV-MMYYYY-NNNNNN`. Globally unique. */
  invoiceNumber: string;
  invoiceType: string;
  /** The derived payment state — `NotReceived`, `PartialPaid`, `Received`, `Overdue`, `Voided`, `Deleted`. */
  status: string;
  /** Which kind of anchor raised this invoice — `Schedule`, `System`, `Manual`, `Deposit`. */
  source: string;
  generatedOn: string;
  /** The immutable original due date — the late-fee anchor, distinct from the current {@link dueDate}. */
  initialDueDate: string;
  dueDate: string;
  total: number;
  amountPaid: number;
  balance: number;
  allowsPartialPayment: boolean;
  /** True once a payment has *ever* applied; permanent, and stays set after a full reversal. */
  isUndeletable: boolean;
  /** True once a property owner has corrected this invoice since it was raised. */
  isManuallyUpdated: boolean;
  propertyTimeZone: string;
  overdueMarkedOn?: string | null;
  voidedAt?: string | null;
  deletedAt?: string | null;
  /** The stream version this document reflects. */
  version: number;
  propertyOwnerId: string;
  propertyId: string;
  propertyUnitId?: string | null;
  /** The payer lane; `null` on a group invoice. */
  tenantId?: string | null;
  /** The agreement this invoice was generated from; `null` on a lease-less manual invoice. */
  rentAgreementId?: string | null;
  /** **Deprecated by the backend** — the same value as {@link rentAgreementId}. Do not read it. */
  leaseId?: string | null;
  scheduleEntryId?: string | null;
  additionalChargeIds: string[];
  lines: InvoiceLineResponse[];
  payments: InvoicePaymentResponse[];
  creditsApplied: InvoiceCreditResponse[];
  tenantShares: InvoiceTenantShareResponse[];
  notes?: string | null;
  isGroupInvoice: boolean;
  /** What this invoice bills for deposit-segregation purposes — `Rent` or `Deposit`. */
  category: string;

  /**
   * The proposal this invoice was raised from (backend spec `02-invoicing.md` **v36**, FR 44).
   *
   * **This is what makes an invoice correctable from its own id.** Corrections go to
   * `PATCH /rent/agreements/{rentAgreementId}/proposed-invoices/{proposedInvoiceId}`, so this field
   * plus {@link rentAgreementId} is the complete address of that route — neither of which a person
   * could be expected to type.
   *
   * `null` is a **permanent fact**, not a transient gap: an invoice raised before the proposal
   * pipeline has no proposal and never will, because no backfill was run and none is planned. An
   * invoice reporting `null` here cannot be corrected through that route at all, and the screen says
   * so rather than sending a request addressed to nothing.
   *
   * Optional on this interface so the app degrades honestly against a backend older than v36, where
   * the field is simply absent and every invoice reads as not correctable.
   */
  proposedInvoiceId?: string | null;
}
