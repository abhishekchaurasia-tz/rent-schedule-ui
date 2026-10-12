import { HttpErrorResponse } from '@angular/common/http';

import { placeholderTenantIdentity } from '../shared/tenant-identity.util';
import { describeProblem, isMoney, roundMoney, tenantDisplayName } from './deposit-refund.util';

/** Covers FR 2, 8, 13, 14 and 18 of `09-deposit-refund-ui.md` v1 — the small rules every screen part reads. */
describe('deposit-refund.util', () => {
  describe('describeProblem', () => {
    it('reads detail verbatim and the errorCode extension the API actually sends', () => {
      const err = new HttpErrorResponse({
        status: 422,
        statusText: 'Unprocessable Entity',
        error: {
          status: 422,
          detail: 'Amount to return should be less than remaining amount.',
          errorCode: 'deposit_refund.exceeds_remaining_deposit'
        }
      });

      expect(describeProblem(err)).toEqual({
        message: 'Amount to return should be less than remaining amount.',
        code: 'deposit_refund.exceeds_remaining_deposit'
      });
    });

    // The backend handoff note calls the member `code`; Innago.BuildingBlocks.Api names it `errorCode`.
    // Reading both means neither spelling is a guess.
    it('falls back to code when errorCode is absent', () => {
      const err = new HttpErrorResponse({
        status: 502,
        statusText: 'Bad Gateway',
        error: { detail: 'The payment service did not confirm the request.', code: 'deposit_refund.submission_unconfirmed' }
      });

      expect(describeProblem(err).code).toBe('deposit_refund.submission_unconfirmed');
    });

    it('falls back to the status line, and no code, when the body is not problem details', () => {
      const err = new HttpErrorResponse({ status: 504, statusText: 'Gateway Timeout', error: 'upstream timed out' });

      expect(describeProblem(err)).toEqual({ message: 'Request failed: 504 Gateway Timeout', code: null });
    });

    it('treats a blank detail as no detail', () => {
      const err = new HttpErrorResponse({ status: 500, statusText: 'Server Error', error: { detail: '   ' } });

      expect(describeProblem(err).message).toBe('Request failed: 500 Server Error');
    });
  });

  describe('isMoney', () => {
    it('accepts zero, whole amounts and two decimals', () => {
      expect(isMoney(0)).toBeTrue();
      expect(isMoney(21)).toBeTrue();
      expect(isMoney(9.99)).toBeTrue();
      // Binary floating point stores 0.29 as 0.28999999999999998; an exact ×100 test would refuse it.
      expect(isMoney(0.29)).toBeTrue();
      expect(isMoney(1.1)).toBeTrue();
    });

    it('refuses three decimals, negatives and anything that is not a finite number', () => {
      expect(isMoney(1.005)).toBeFalse();
      expect(isMoney(-1)).toBeFalse();
      expect(isMoney(Number.NaN)).toBeFalse();
      expect(isMoney(Number.POSITIVE_INFINITY)).toBeFalse();
    });
  });

  describe('roundMoney', () => {
    it('removes floating point noise from a sum', () => {
      expect(0.1 + 0.2).not.toBe(0.3);
      expect(roundMoney(0.1 + 0.2)).toBe(0.3);
      expect(roundMoney(21 - 12.1)).toBe(8.9);
    });
  });

  describe('tenantDisplayName', () => {
    const tenantId = '8f14e45f-ceea-467e-bd9f-000000000001';

    it('prefers the name the server sent', () => {
      expect(tenantDisplayName(tenantId, 'Jordan Ellis')).toBe('Jordan Ellis');
    });

    // FR 18 — the stand-in the Invoices list and ADD TENANTS already show for the same id.
    it('falls back to the stand-in person derived from the tenant id', () => {
      const identity = placeholderTenantIdentity(tenantId);

      expect(tenantDisplayName(tenantId, null)).toBe(`${identity.firstName} ${identity.lastName}`);
      expect(tenantDisplayName(tenantId, '  ')).toBe(`${identity.firstName} ${identity.lastName}`);
    });
  });
});
