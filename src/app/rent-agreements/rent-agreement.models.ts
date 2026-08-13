import { FrequencyConfig, LeaseTermType, RentFrequency } from '../rent-schedule/rent-schedule.models';

export interface ScheduleRowCreationRequest {
  scheduledDate: string;
  dueDate: string;
  rent: number;
  /**
   * Whether the user hand-edited this row's `rent` before saving (backend spec v20 / part1 schema
   * §10.1). Optional on the wire — the backend defaults it to `false` — and persisted verbatim so a
   * later terms regeneration leaves the edited amount alone.
   *
   * Tracks the **amount only**. A row whose due date was moved is not flagged: the backend proves a
   * manual date edit by comparing `dueDate` against the immutable `scheduledDate` anchor.
   */
  isManualChanged?: boolean;
  /**
   * Whether the user deleted this row (kebab menu → Delete) before ever saving (spec v39). The row
   * is still submitted — never simply omitted — so the backend persists it directly with a
   * `Cancelled` status instead of `Planned`. Optional; the backend defaults an omitted flag to
   * `false`.
   */
  isCancelled?: boolean;
}

export interface AdditionalChargeItemCreationRequest {
  /**
   * Identity of an existing line, on an edit save only. Present ⇒ update that line, absent ⇒ insert
   * a new one, stored-but-not-sent ⇒ delete (decision E2). Always omitted when creating.
   */
  id?: string | null;
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
  /**
   * Identity of an existing fee, on an edit save only. Present ⇒ update that fee, absent ⇒ insert a
   * new one, stored-but-not-sent ⇒ delete (decision E2). Charges have no natural key — unlike
   * schedule rows, which match on their immutable `scheduledDate` — so without this an edit cannot
   * tell "changed" from "removed and re-added". Always omitted when creating.
   */
  id?: string | null;
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

/** A schedule row's lifecycle status. Only `planned` rows are freely editable. */
export type ScheduleRowStatus = 'planned' | 'invoiced' | 'skipped' | 'cancelled';

export interface RentAgreementScheduleRowResponse {
  id: string;
  scheduledDate: string;
  dueDate: string;
  rent: number;
  /** Echoes the persisted {@link ScheduleRowCreationRequest.isManualChanged} (backend spec v20). */
  isManualChanged: boolean;
  /**
   * Present on both the create response and `GET /rent-agreements/{id}` — `'planned'` unless the
   * client marked the submitted row `isCancelled` (spec v39), in which case it is `'cancelled'` from
   * the moment it is created. An `'invoiced'` row may be frozen — see {@link isFrozen}.
   */
  status?: ScheduleRowStatus;
  /**
   * Server-computed: the row's invoice is paid, partially paid, voided **or overdue**, so neither
   * the row nor its invoice may be changed and the row cannot be removed. Derived rather than
   * stored — the UI must not try to recompute it, since "overdue" depends on the server's clock.
   */
  isFrozen?: boolean;
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
  /**
   * Server-computed: this charge has already been attached to an invoice, so it may no longer be
   * edited or removed — same rationale as {@link RentAgreementScheduleRowResponse.isFrozen}.
   */
  isApplied: boolean;
}

export interface CreateRentAgreementResponse {
  agreementId: string;
  status: string;
  depositCollected: boolean;
  scheduleRows: RentAgreementScheduleRowResponse[];
  additionalCharges: RentAgreementAdditionalChargeResponse[];
}

/**
 * `GET /rent-agreements/{id}` — the saved agreement with its schedule rows and additional charges
 * embedded (decision D1: there is no separate `/rent-schedule` resource).
 */
export interface RentAgreementDetailResponse {
  agreementId: string;
  propertyUnitId: string;
  propertyId: string;
  propertyOwnerId: string;
  leaseTermType: LeaseTermType;
  startDate: string;
  endDate?: string | null;
  fullRent: number;
  frequency: RentFrequency;
  frequencyConfig: FrequencyConfig;
  firstRentalDueDate: string;
  deposit?: number | null;
  depositDueDate?: string | null;
  depositCollected: boolean;
  /** `draft` before activation, then the lease's rental status. */
  status: string;
  /** The server's current UTC date — used to derive "overdue" without trusting the client's clock. */
  todayUtc: string;
  scheduleRows: RentAgreementScheduleRowResponse[];
  additionalCharges: RentAgreementAdditionalChargeResponse[];
}

/**
 * `PUT /rent-agreements/{id}/terms` — the edit save.
 *
 * Carries the **complete** set of both collections, not a patch (decisions D8 / E1): rows and
 * charges that did not change are still sent, and anything the user removed is simply **absent**,
 * which is how a deletion is expressed. Only the schedule-affecting terms may be changed (D3) —
 * `startDate`, the property/owner ids and the deposit fields are not part of this contract.
 */
/**
 * Turns a loaded charge back into the shape the save sends, **preserving the ids** so the server
 * updates the existing fee and its lines rather than replacing them (decision E2).
 *
 * `category` is dropped deliberately: it is server-derived from the items, so echoing it back would
 * assert something the client is not entitled to decide.
 */
export function toChargeCreationRequest(
  charge: RentAgreementAdditionalChargeResponse
): AdditionalChargeCreationRequest {
  return {
    id: charge.id,
    notes: charge.notes,
    alreadyPaid: charge.alreadyPaid,
    attachedWithRentalInvoice: charge.attachedWithRentalInvoice,
    isRecurring: charge.isRecurring,
    dueDate: charge.dueDate,
    frequency: charge.frequency,
    startDate: charge.startDate,
    endDate: charge.endDate,
    hasNoEndDate: charge.hasNoEndDate,
    isGrouped: charge.isGrouped,
    isSharedByAll: charge.isSharedByAll,
    items: charge.items.map((item) => ({
      id: item.id,
      itemType: item.itemType,
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      amount: item.amount
    }))
  };
}

export interface UpdateRentAgreementTermsRequest {
  endDate?: string | null;
  fullRent: number;
  frequency: RentFrequency;
  frequencyConfig: FrequencyConfig;
  firstRentalDueDate: string;
  scheduleRows: ScheduleRowCreationRequest[];
  additionalCharges: AdditionalChargeCreationRequest[];
}
