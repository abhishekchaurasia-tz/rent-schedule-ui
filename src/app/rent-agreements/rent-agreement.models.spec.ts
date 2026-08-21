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
      isGrouped: false,
      isSharedByAll: true,
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
});
