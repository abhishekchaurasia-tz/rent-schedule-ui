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
  /**
   * The derived payment state, **snake_case on the wire** — `not_received`, `partial_paid`,
   * `received`, `overdue`, `voided`, `deleted`. The API serializes every enum with
   * `JsonStringEnumConverter(SnakeCaseLower)`; only the non-enum `string` fields stay PascalCase.
   */
  status: string;
  /** Which kind of anchor raised this invoice — `schedule`, `system`, `manual`, `deposit` (snake_case). */
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
  /**
   * What this invoice bills for deposit-segregation purposes — `Rent` or `Deposit`.
   *
   * PascalCase, unlike its neighbours: the backend carries this as a smart enum's `Name` rather than a
   * C# `enum`, so the snake_case converter never sees it. Compare case-insensitively.
   */
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

/**
 * The payment states an invoice can be in, as they appear **on the wire** — `snake_case`, because the
 * API serializes every enum with `JsonStringEnumConverter(SnakeCaseLower)`.
 *
 * Derived by the backend's fold from the stored facts (`voidedAt`, `deletedAt`, `balance`,
 * `overdueMarkedOn`, `amountPaid`) and never stored independently, so a client must render it and never
 * recompute it.
 */
export type InvoiceStatus =
  | 'not_received'
  | 'partial_paid'
  | 'received'
  | 'overdue'
  | 'voided'
  | 'deleted';

/** One row of `GET /api/v1/invoices`. */
export interface InvoiceSummaryResponse {
  invoiceId: string;
  invoiceNumber: string;
  invoiceType: string;
  status: InvoiceStatus;
  generatedOn: string;
  dueDate: string;
  total: number;
  amountPaid: number;
  balance: number;
  propertyId: string;
  propertyUnitId?: string | null;
  /** The payer **lane** — `null` on a group invoice. For "who pays", read {@link tenantIds}. */
  tenantId?: string | null;
  rentAgreementId?: string | null;
  /** **Deprecated by the backend** — the same value as {@link rentAgreementId}. */
  leaseId?: string | null;

  /**
   * The date the invoice was last settled — the **latest** of the payments counting toward
   * {@link amountPaid} (backend spec `02-invoicing.md` **v37**, FR 45).
   *
   * `null` when nothing has been paid, and a **reversed** payment sets nothing, so this and
   * `amountPaid` never contradict each other on the same row.
   *
   * Optional here so the app degrades honestly against a backend older than v37, where it is absent and
   * the column reads "—".
   */
  paidOn?: string | null;

  /**
   * Every payer this invoice divides between, in display order (backend **v37**, FR 46).
   *
   * **Not interchangeable with {@link tenantId}**, which is `null` on exactly the group invoices that
   * have several payers. Empty when the invoice records no shares.
   */
  tenantIds?: string[];
}

/**
 * The paging envelope every list endpoint returns (`Innago.BuildingBlocks.Application.PagedResult<T>`).
 *
 * `totalPages`, `hasNextPage` and `hasPreviousPage` are computed **server-side** and must be read rather
 * than recomputed: the endpoint caps `pageSize`, so client arithmetic over `totalCount` can disagree
 * with the page actually served.
 */
export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  /** 1-based. */
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * The criteria `GET /api/v1/invoices` accepts.
 *
 * **Only `propertyOwnerId` is required**, and that is a security control rather than a convenience: no
 * authentication scheme is registered on the API, so an unscoped list would page through every owner's
 * billing data. "All invoices" means all of one owner's.
 *
 * Every other member is omitted from the query string when absent — an empty `invoiceNumber` sent as
 * `""` would be an exact-match filter for the empty string, not the absence of a filter.
 */
export interface InvoiceSearchQuery {
  propertyOwnerId: string;
  page?: number;
  /** Defaults to 50 server-side; the endpoint rejects anything above 200. */
  pageSize?: number;
  invoiceNumber?: string;
  /** Repeated once per value on the wire, and **unioned** by the endpoint. */
  status?: InvoiceStatus[];
  invoiceType?: string;
  outstandingOnly?: boolean;
  dueDateFrom?: string;
  dueDateTo?: string;
  generatedOnFrom?: string;
  generatedOnTo?: string;
  includeDeleted?: boolean;
  propertyId?: string;
  propertyUnitId?: string;
  tenantId?: string;
  rentAgreementId?: string;
}
