/**
 * The wire shapes of the Record Payment endpoints — Billing spec `18-record-payment.md` v2.
 *
 * Specified for this client in `docs/specs/rent-agreements/11-record-payment-ui.md`.
 *
 * JSON is camelCase. Billing's typed ids travel as plain GUID strings, its `DateOnly` as `yyyy-MM-dd`, and
 * its enums in snake_case.
 */

/** How the tenant paid (backend `OfflinePaymentMethod`). */
export type OfflinePaymentMethod = 'cash' | 'check' | 'money_order';

/** One tenant of the invoice (backend BR-29, BR-30). */
export interface OfflinePaymentTenantResponse {
  tenantId: string;
  /** From Identity; empty when unknown. */
  name: string;
  /** The tenant's share of the invoice total. */
  share: number;
  /** What Finance holds from this tenant against the invoice. */
  paid: number;
  /** What to pre-fill: the unpaid share, within the invoice's payable. */
  suggestedAmount: number;
}

/** `GET /api/v1/invoices/{id}/offline-payment` — what the panel opens with. */
export interface OfflinePaymentContextResponse {
  invoiceId: string;
  invoiceNumber: string;
  /** The invoice total, net of credits. */
  total: number;
  /** Finance's `TotalPaidAmount`. */
  paid: number;
  /** What the invoice can still take (BR-31). */
  payable: number;
  tenants: OfflinePaymentTenantResponse[];
  methods: OfflinePaymentMethod[];
}

/** One payment line (backend BR-33). */
export interface OfflinePaymentLineRequest {
  method: OfflinePaymentMethod;
  /** Above zero, at most two decimals. */
  amount: number;
  /** `yyyy-MM-dd`, on or before today. */
  paidOn: string;
  /** Check or money-order number, 1–24 characters. Absent for cash and when blank. */
  checkNumber?: string;
}

/** `POST /api/v1/invoices/{id}/offline-payments/preview`. */
export interface PreviewOfflinePaymentRequest {
  tenantId: string;
  payments: OfflinePaymentLineRequest[];
}

/** `POST /api/v1/invoices/{id}/offline-payments`. */
export interface RecordOfflinePaymentRequest extends PreviewOfflinePaymentRequest {
  /** One per opening of the panel, reused on a retry (backend D9, BR-39). */
  submissionId: string;
}

/** The part of one payment line an invoice receives. */
export interface OfflinePaymentSliceResponse {
  /** The 1-based request line. */
  lineIndex: number;
  method: OfflinePaymentMethod;
  amount: number;
}

/** What one invoice receives, in allocation order — the current invoice first (BR-35). */
export interface OfflinePaymentAllocationResponse {
  invoiceId: string;
  invoiceNumber: string;
  /** `yyyy-MM-dd`. */
  dueDate: string;
  /** What it could take before this payment. */
  payableBefore: number;
  /** What it receives. */
  applied: number;
  /** What it could still take after. */
  payableAfter: number;
  slices: OfflinePaymentSliceResponse[];
}

/** How a payment would divide, or why it cannot (BR-35, BR-36). */
export interface OfflinePaymentPreviewResponse {
  totalEntered: number;
  /** What the current invoice can still take. */
  payable: number;
  /** max(0, totalEntered − payable). */
  excess: number;
  /** The most the tenant's candidate invoices can take. */
  maxPayable: number;
  exceedsPayable: boolean;
  /** BR-36's sentence when `exceedsPayable`; otherwise `null`. */
  message: string | null;
  /** Empty when `exceedsPayable`. */
  allocations: OfflinePaymentAllocationResponse[];
}

/** The `202` body: queued at Finance, not yet reflected in Billing's figures. */
export interface OfflinePaymentSubmittedResponse {
  invoiceId: string;
  submissionId: string;
  status: 'accepted';
  allocations: OfflinePaymentAllocationResponse[];
}
