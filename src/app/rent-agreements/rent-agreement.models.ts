import { FrequencyConfig, RentFrequency } from '../rent-schedule/rent-schedule.models';

export interface ScheduleRowCreationRequest {
  scheduledDate: string;
  dueDate: string;
  rent: number;
}

export interface AdditionalChargeItemCreationRequest {
  /**
   * The catalog entry (`LineItem`) this line was picked from. `newItemCategory` no longer exists on
   * the backend (removed 2026-08-05, spec 02-invoicing.md v6 / 01-rent-agreement.md v19) — a brand
   * new catalog entry is now get-or-created server-side from `itemType`/`description` when this is
   * omitted, but this UI only ever offers picking from the fetched catalog (`LineItemsService`), so
   * it is always set here.
   */
  lineItemId?: string | null;
  itemType: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface AdditionalChargeCreationRequest {
  notes?: string | null;
  alreadyPaid: number;
  attachedWithRentalInvoice: boolean;
  isRecurring: boolean;
  dueDate?: string | null;
  frequency?: RentFrequency | null;
  /** Required iff isRecurring; same per-frequency shapes as CreateRentAgreementRequest.frequencyConfig. */
  frequencyConfig?: FrequencyConfig | null;
  startDate?: string | null;
  endDate?: string | null;
  hasNoEndDate: boolean;
  isGrouped: boolean;
  isSharedByAll: boolean;
  items: AdditionalChargeItemCreationRequest[];
}

/**
 * Bound directly to `POST /rent-agreements`. Unlike {@link import('../rent-schedule/rent-schedule.models').PreviewRentScheduleRequest},
 * there is no `leaseTermType` field — the backend derives it from whether `endDate` is present.
 */
export interface CreateRentAgreementRequest {
  propertyUnitId: string;
  propertyId: string;
  propertyOwnerId: string;
  startDate: string;
  endDate?: string | null;
  fullRent: number;
  frequency: RentFrequency;
  frequencyConfig: FrequencyConfig;
  firstRentalDueDate: string;
  deposit?: number | null;
  depositDueDate?: string | null;
  depositCollected?: boolean;
  scheduleRows: ScheduleRowCreationRequest[];
  additionalCharges?: AdditionalChargeCreationRequest[];
}

export interface RentAgreementScheduleRowResponse {
  id: string;
  scheduledDate: string;
  dueDate: string;
  rent: number;
}

export interface RentAgreementAdditionalChargeItemResponse {
  id: string;
  itemType: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface RentAgreementAdditionalChargeResponse {
  id: string;
  /** Server-derived — "Rent" or "Deposit" — resolved from the charge's items. */
  category: 'Rent' | 'Deposit';
  notes?: string | null;
  alreadyPaid: number;
  attachedWithRentalInvoice: boolean;
  isRecurring: boolean;
  dueDate?: string | null;
  frequency?: RentFrequency | null;
  startDate?: string | null;
  endDate?: string | null;
  hasNoEndDate: boolean;
  isGrouped: boolean;
  isSharedByAll: boolean;
  items: RentAgreementAdditionalChargeItemResponse[];
}

export interface CreateRentAgreementResponse {
  agreementId: string;
  status: string;
  depositCollected: boolean;
  scheduleRows: RentAgreementScheduleRowResponse[];
  additionalCharges: RentAgreementAdditionalChargeResponse[];
}
