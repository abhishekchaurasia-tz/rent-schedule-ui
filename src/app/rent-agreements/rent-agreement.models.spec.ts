import { RentAgreementAdditionalChargeResponse, toChargeCreationRequest } from './rent-agreement.models';

describe('toChargeCreationRequest', () => {
  function chargeResponse(
    overrides: Partial<RentAgreementAdditionalChargeResponse> = {}
  ): RentAgreementAdditionalChargeResponse {
    return {
      id: 'charge-1',
      category: 'Rent',
      notes: null,
      alreadyPaid: 0,
      attachedWithRentalInvoice: true,
      isRecurring: true,
      dueDate: null,
      frequency: 'monthly',
      frequencyConfig: { dueOnDay: 5 },
      startDate: '2026-08-01',
      endDate: null,
      hasNoEndDate: true,
      items: [],
      isApplied: false,
      ...overrides
    };
  }

  it('carries frequencyConfig through, matching every other field it already round-trips', () => {
    const result = toChargeCreationRequest(chargeResponse());

    expect(result.frequencyConfig).toEqual({ dueOnDay: 5 });
    expect(result.frequency).toBe('monthly');
  });

  it('leaves frequencyConfig undefined for a one-time charge, matching frequency', () => {
    const result = toChargeCreationRequest(
      chargeResponse({ isRecurring: false, frequency: null, frequencyConfig: null, startDate: null, hasNoEndDate: false })
    );

    expect(result.frequencyConfig ?? null).toBeNull();
  });
  describe('the saved split rides through a terms save (FR 22)', () => {
    const tenantA = '11111111-1111-1111-1111-111111111111';
    const tenantB = '22222222-2222-2222-2222-222222222222';
    const tenantC = '33333333-3333-3333-3333-333333333333';

    /**
     * The hazard this exists for.
     *
     * `PUT …/terms` resubmits the **complete** charge, so an omitted field on that route is a removed
     * field, not an unchanged one. The lease editor authors nothing about who pays and is explicitly
     * not getting a renter control — but it does resubmit every charge, so a split it drops is a split
     * deleted by a screen that never showed it. The server refuses that with a `422` rather than
     * resetting silently, which makes it a visible failure on a screen the owner was not editing the
     * fee from; this mapper is what keeps that from firing.
     */
    it('carries a saved split through a terms save untouched', () => {
      const result = toChargeCreationRequest({
        ...chargeResponse(),
        tenantShares: [
          { tenantId: tenantA, amount: 200, sharePercent: null, alreadyPaid: 0 },
          { tenantId: tenantB, amount: 50, sharePercent: null, alreadyPaid: 0 },
          { tenantId: tenantC, amount: 50, sharePercent: 16.67, alreadyPaid: 25 }
        ]
      });

      expect(result.tenantShares).toEqual([
        { tenantId: tenantA, amount: 200 },
        { tenantId: tenantB, amount: 50 },
        { tenantId: tenantC, amount: 50, sharePercent: 16.67 }
      ]);
    });

    it('carries no split for a charge that has none', () => {
      // The shared-by-all case is unchanged: absent going in, absent coming out. Sending `[]` here
      // would turn "not specified" into "specified as nobody" on a route that replaces the charge.
      expect(toChargeCreationRequest(chargeResponse()).tenantShares).toBeUndefined();

      const empty = toChargeCreationRequest({ ...chargeResponse(), tenantShares: [] });
      expect(empty.tenantShares).toEqual([]);
    });

    it('drops sharePercent when the saved row carries none, rather than sending null', () => {
      // The absence of `sharePercent` is what records that the owner typed an amount. A null would
      // assert a percentage of nothing, and the two are not interchangeable.
      const result = toChargeCreationRequest({
        ...chargeResponse(),
        tenantShares: [{ tenantId: tenantA, amount: 100, sharePercent: null }]
      });

      expect('sharePercent' in result.tenantShares![0]).toBeFalse();
    });
  });
});
