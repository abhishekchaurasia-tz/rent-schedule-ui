/**
 * Shared request builders for the rent-schedule / rent-agreement API suites. Centralizing a single
 * "known good" payload per endpoint means each validation test only needs to override the one field
 * it's exercising — see `docs/ui-automation-test-matrix.md` for the rule each override maps to.
 */

export function minimalPreviewRequest() {
  return {
    startDate: '2026-09-01',
    endDate: '2027-09-01',
    leaseTermType: 'fixed',
    rent: 1000,
    frequency: 'monthly',
    firstRentalDueDate: '2026-09-01',
    frequencyConfig: { dueOnDay: 1 }
  };
}

export function minimalOptionsRequest() {
  const { firstRentalDueDate, ...rest } = minimalPreviewRequest();
  return rest;
}

export function minimalCreateAgreementRequest(scheduleRows: unknown[] = []) {
  return {
    propertyUnitId: crypto.randomUUID(),
    propertyId: crypto.randomUUID(),
    propertyOwnerId: crypto.randomUUID(),
    ...minimalPreviewRequest(),
    fullRent: 1000,
    scheduleRows,
    additionalCharges: []
  };
}

/** A single valid rent-category, one-time additional charge with one item. */
export function minimalOneTimeCharge(overrides: Record<string, unknown> = {}) {
  return {
    notes: null,
    alreadyPaid: 0,
    attachedWithRentalInvoice: false,
    isRecurring: false,
    dueDate: '2026-09-15',
    frequency: null,
    frequencyConfig: null,
    startDate: null,
    endDate: null,
    hasNoEndDate: false,
    isGrouped: false,
    isSharedByAll: true,
    items: [
      {
        lineItemId: null,
        newItemCategory: 'rent',
        itemType: 'Late Fee',
        description: 'Late fee',
        quantity: 1,
        rate: 50,
        amount: 50
      }
    ],
    ...overrides
  };
}

/** A single valid recurring additional charge (monthly), one item. */
export function minimalRecurringCharge(overrides: Record<string, unknown> = {}) {
  return {
    notes: null,
    alreadyPaid: 0,
    attachedWithRentalInvoice: false,
    isRecurring: true,
    dueDate: null,
    frequency: 'monthly',
    frequencyConfig: { dueOnDay: 1 },
    startDate: '2026-09-01',
    endDate: null,
    hasNoEndDate: true,
    isGrouped: false,
    isSharedByAll: true,
    items: [
      {
        lineItemId: null,
        newItemCategory: 'rent',
        itemType: 'Parking',
        description: 'Parking space',
        quantity: 1,
        rate: 25,
        amount: 25
      }
    ],
    ...overrides
  };
}
