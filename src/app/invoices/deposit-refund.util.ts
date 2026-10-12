import { HttpErrorResponse } from '@angular/common/http';

import { placeholderTenantIdentity } from '../shared/tenant-identity.util';

/**
 * A refusal, as the screen shows it: the sentence to read and the code to branch on.
 *
 * The code is rendered beside the sentence because this application is a test harness — a tester
 * comparing what the screen said with what the backend spec promised needs the stable code, not just
 * the prose that may be reworded.
 */
export interface DepositRefundProblem {
  message: string;
  /** `deposit_refund.*`, `invoice.not_found`, …; `null` when the body was not Problem Details. */
  code: string | null;
}

/**
 * Reads an RFC 9457 Problem Details failure (spec `09-deposit-refund-ui.md` FR 2, 13).
 *
 * `detail` is rendered **verbatim** — for `rejected_by_payment_service` it is Finance's own message, and
 * for `submission_unconfirmed` it already tells the owner to check *Funds Returned* — with the status
 * line as the fallback when the body carries none.
 *
 * **The code is read from `errorCode` first.** `Innago.BuildingBlocks.Api` writes `Error.Code` to an
 * `errorCode` extension member, and the Billing API's own tests assert on that name; the backend's
 * handoff note calls it `code`. Reading both means neither spelling is a guess.
 */
export function describeProblem(err: HttpErrorResponse): DepositRefundProblem {
  const body: unknown = err.error;
  const problem = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

  const detail = problem['detail'];
  const code = problem['errorCode'] ?? problem['code'];

  return {
    message:
      typeof detail === 'string' && detail.trim() ? detail : `Request failed: ${err.status} ${err.statusText}`,
    code: typeof code === 'string' && code ? code : null
  };
}

/**
 * Whether `value` is an amount the backend accepts: finite, 0 or more, and at most two decimals
 * (backend BR-17's `amount >= 0 && Round(amount, 2) == amount`).
 *
 * **Compared with an epsilon, not exactly.** `0.29 * 100` is `28.999999999999996` in binary floating
 * point, so an exact integer test would refuse a perfectly ordinary amount the backend's `decimal`
 * accepts.
 */
export function isMoney(value: number): boolean {
  if (!Number.isFinite(value) || value < 0) {
    return false;
  }

  const cents = value * 100;
  return Math.abs(cents - Math.round(cents)) < 1e-6;
}

/**
 * Rounds to cents. Applied to every sum the panel shows or compares, so that `0.1 + 0.2` is `0.3` and a
 * principal exactly equal to *Remaining* is never refused by a stray `…0004`.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The name a tenant is shown under (FR 18).
 *
 * The server's name when it has one — `payerName` or `name`, which Billing resolves through Identity and
 * then Finance (backend BR-09). Only when both are missing does this fall back to the stand-in person
 * derived from the id, the same one the Invoices list and ADD TENANTS show, so a tenant reads as one
 * person wherever they appear in this application.
 */
export function tenantDisplayName(tenantId: string, name: string | null | undefined): string {
  if (name && name.trim()) {
    return name;
  }

  const identity = placeholderTenantIdentity(tenantId);
  return `${identity.firstName} ${identity.lastName}`;
}
