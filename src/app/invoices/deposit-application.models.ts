/**
 * The wire shapes of the deposit application endpoints — backend spec `16-deposit-application.md` v1.
 *
 * Specified for this client in `docs/specs/rent-agreements/10-deposit-application-ui.md`.
 *
 * JSON is camelCase. Billing's typed ids travel as plain GUID strings and its `DateOnly` as `yyyy-MM-dd`.
 */

/** One invoice of the lease the deposit can be applied to (backend BR-05), in due-date order. */
export interface ApplyCandidateResponse {
  invoiceId: string;
  invoiceNumber: string;
  /** Billing's invoice type name, e.g. `Rent`. */
  invoiceType: string;
  /** `yyyy-MM-dd`. */
  dueDate: string;
  total: number;
  /** What the invoice still owes, from Billing's write model — the most that can be applied to it (BR-06). */
  balanceDue: number;
}

/** One live *Funds Applied to Other Invoices* row (backend BR-26). */
export interface FundsAppliedRowResponse {
  /** What *Remove* addresses. */
  allocationId: string;
  /** `null` while a maintenance invoice has not been raised yet. */
  appliedToInvoiceId: string | null;
  appliedToInvoiceNumber: string | null;
  /** `yyyy-MM-dd`, in the property's time zone. */
  appliedOn: string;
  amount: number;
  isMaintenance: boolean;
  /** False while a maintenance invoice is still being raised, or once money has been paid on it. */
  canRemove: boolean;
}

/** `GET /api/v1/invoices/{id}/deposit-application` — the *Apply Deposit* panel's context. */
export interface DepositApplicationContextResponse {
  invoiceId: string;
  invoiceNumber: string;
  /** A deposit invoice, fully paid, with something still held (BR-01 – BR-03). */
  canApplyDeposit: boolean;
  depositAmount: number;
  totalReturned: number;
  totalApplied: number;
  /** What may still be applied: max(0, deposit − returned − applied). The cap for BR-09. */
  available: number;
  openInvoices: ApplyCandidateResponse[];
  fundsApplied: FundsAppliedRowResponse[];
}

/** One open invoice and the amount applied to it. */
export interface DepositAllocationRequest {
  invoiceId: string;
  amount: number;
}

/** One move-out maintenance or repair charge paid from the deposit (BR-18). */
export interface MaintenanceItemRequest {
  description: string;
  amount: number;
}

/** `POST /api/v1/invoices/{id}/deposit-applications`. */
export interface ApplyDepositRequest {
  /** One per opening of the panel: a second press is the same submission (BR-13). */
  applicationId: string;
  allocations: DepositAllocationRequest[];
  maintenanceItems: MaintenanceItemRequest[];
}

/** One allocation the apply recorded. A maintenance one names its charge and has no invoice yet. */
export interface AppliedAllocationResponse {
  allocationId: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  additionalChargeId: string | null;
  amount: number;
}

/** The `201` (new) or `200` (replay) body. */
export interface ApplyDepositResponse {
  applicationId: string;
  allocations: AppliedAllocationResponse[];
  isReplay: boolean;
}
