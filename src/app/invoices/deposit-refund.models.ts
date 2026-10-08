/**
 * The wire shapes of the deposit refund endpoints — backend spec `15-deposit-refund.md` v2.
 *
 * Specified for this client in `docs/specs/rent-agreements/09-deposit-refund-ui.md`.
 *
 * JSON is camelCase and every enum is a **snake_case** string: the API serializes enums with
 * `JsonStringEnumConverter(SnakeCaseLower)`, so `MoneyOrder` arrives as `money_order`.
 */

/** How one *Funds Returned* row reads — derived by the backend from Finance's refund status (BR-08). */
export type FundsReturnedStatus = 'initiated' | 'processing' | 'refunded' | 'issued';

/** The instrument a deposit went back by, as Finance records it. */
export type DepositReturnMethod =
  | 'unknown'
  | 'credit_card'
  | 'check'
  | 'ach'
  | 'cash'
  | 'money_order'
  | 'innago_paper_check'
  | 'livble';

/** The three instruments an owner may record a return by offline (BR-17). */
export type OfflineReturnMethod = 'cash' | 'check' | 'money_order';

/** Whether the owner handed the money over themselves, or Innago moves it from their bank. */
export type DepositRefundMode = 'offline' | 'online';

/**
 * The deposit's figures, every one derived by the backend on each request from the invoice projection
 * and a live Finance read (BR-06). Render them; never recompute them.
 */
export interface DepositRefundTotalsResponse {
  /** Σ of the invoice's deposit lines — the panel's *Total Held* (BR-05). */
  depositAmount: number;
  totalPaid: number;
  /** Σ principal of live returns. Interest is reported separately and never counted here. */
  totalReturned: number;
  depositInterest: number;
  /** Always 0 on a Billing invoice until Apply It exists (BR-13). */
  totalApplied: number;
  /** What may still be returned: max(0, deposit − returned − applied). The cap for BR-19. */
  remaining: number;
}

/** One tenant who paid the deposit (BR-07). A tenant who never paid has no row and cannot be refunded. */
export interface DepositRefundTenantResponse {
  tenantId: string;
  /** From Identity; `null` when Identity has no name for this tenant (BR-09). */
  name: string | null;
  paid: number;
  returned: number;
  interestReturned: number;
  /** `paid − returned` — the panel's *Deposit Held*. */
  held: number;
}

/** One live return, newest first (BR-08). */
export interface FundsReturnedRowResponse {
  /** Finance's id for the return — what cancel and remove address. */
  refundId: string;
  tenantId: string;
  /** Identity's name, else Finance's payee name, else `null` (BR-09). */
  payerName: string | null;
  /** The tenant's first deposit payment; `null` when there is none. A date-time. */
  receivedOn: string | null;
  /** A date-time. */
  returnedOn: string;
  status: FundsReturnedStatus;
  method: DepositReturnMethod;
  /** The check or money-order number; `null` for every other method. */
  checkNumber: string | null;
  /** Principal + interest. */
  amountReturned: number;
  /** An online (ACH) return still inside Finance's cancellation window. */
  canCancel: boolean;
  /** A return recorded offline — cash, check or money order. */
  canRemove: boolean;
}

/** `GET /api/v1/invoices/{id}/deposit-refund` — one invoice's refund view. */
export interface DepositRefundResponse {
  invoiceId: string;
  invoiceNumber: string;
  /** BR-01 — the invoice's type is Deposit. `false` means every figure is 0 and every list empty (BR-12). */
  isDepositInvoice: boolean;
  /** BR-02 — status `received` with a total above 0. */
  isFullyPaid: boolean;
  /** BR-03 — deposit, fully paid, and not fully refunded. */
  canRefundDeposit: boolean;
  /** BR-15 — at least one live return exists. */
  isDepositRefundStarted: boolean;
  /** BR-06 — everything that could be returned has been. */
  isDepositFullyRefunded: boolean;
  totals: DepositRefundTotalsResponse;
  tenants: DepositRefundTenantResponse[];
  fundsReturned: FundsReturnedRowResponse[];
}

/**
 * One tenant's share of a return.
 *
 * **`method` and `checkNumber` are offline-only, and absent rather than empty when they do not apply** —
 * the backend refuses `method` on an online return, and a `checkNumber` on cash (BR-17).
 */
export interface DepositReturnRequest {
  tenantId: string;
  method?: OfflineReturnMethod;
  /** Required, 1–25 characters, for check and money order; absent for cash. */
  checkNumber?: string;
  amount: number;
  interest: number;
}

/**
 * The owner's bank account an online return is pulled from.
 *
 * **`accountNumber`, `routingNumber` and `fundingSource` arrive already encrypted** — the owner's bank
 * list (merlin's) hands them out that way, and the backend passes them to Finance unread (BR-22).
 */
export interface OwnerBankRequest {
  bankId: string;
  bankName: string;
  accountHolder: string;
  /** An `int` on the wire. */
  accountTypeId: number;
  accountNumber: string;
  routingNumber: string;
  fundingSource: string;
}

/** Where a paper check can be mailed if the tenant never confirms a bank account. Online only. */
export interface BackupAddressRequest {
  line1: string;
  line2?: string;
  /** Letters and spaces only (BR-17). */
  city: string;
  state: string;
  /** Five digits. */
  zip: string;
}

/** `POST /api/v1/invoices/{id}/deposit-refunds`. */
export interface CreateDepositRefundRequest {
  mode: DepositRefundMode;
  /** Offline: one entry per tenant being paid. Online: exactly one. */
  returns: DepositReturnRequest[];
  /** Online only. */
  ownerBank?: OwnerBankRequest;
  /** Online only, and optional there. */
  backupAddress?: BackupAddressRequest;
}

/**
 * The `202 Accepted` body.
 *
 * **Accepted means queued at Finance, not refunded** (BR-24). The return appears under *Funds Returned*
 * once Finance's consumer has run.
 */
export interface DepositRefundSubmittedResponse {
  invoiceId: string;
  status: string;
}
