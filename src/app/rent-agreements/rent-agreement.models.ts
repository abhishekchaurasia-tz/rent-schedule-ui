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
  /**
   * This row's per-tenant edits (backend spec v49/v50, FR-068). Omitted or `[]` when the lease bills as
   * a group, or when the user has not touched a tenant row.
   *
   * Nested under the row rather than sent as a parallel list keyed by `scheduledDate`, matching the
   * backend contract: the screen shows the tenants underneath their row, and a parallel list is one more
   * thing that can fall out of alignment with the rows it describes.
   *
   * **Only `PUT …/terms` accepts this.** `POST /rent/agreements` rejects a non-empty list with `422`,
   * because no tenant rows exist until the later "add tenants" call.
   */
  tenants?: TenantRowEditRequest[];
}

/**
 * One tenant's row inside a submitted schedule row (backend spec v49/v50, FR-068).
 *
 * **Two asymmetries here are load-bearing, and getting either backwards corrupts data silently.**
 *
 * `amount` absent means *"return this tenant to the computed share"* — **not** "leave it unchanged". The
 * screen submits the complete per-tenant set on every save, so absence is a positive statement and is the
 * only way to clear an override. A caller that sends a partial set will wipe the property owner's edits.
 *
 * `dueDate` absent **does** mean unchanged, because a tenant's date has no computed value to fall back
 * to — it simply defaults to the cycle's own at generation and then stays where it was put.
 */
export interface TenantRowEditRequest {
  tenantId: string;
  /** This tenant's own due date, or omitted to leave it unchanged. */
  dueDate?: string;
  /** The authored amount (`>= 0`), or omitted to clear any override and return to the computed share. */
  amount?: number;
  /**
   * Whether the tenant is excluded from this cycle. Decisive in **both** directions: `true` cancels or
   * keeps cancelled (idempotent), and its **absence** restores a cancelled tenant — the same rule the
   * schedule row itself uses, so there is one rule to learn rather than two.
   */
  isCancelled?: boolean;
}

/**
 * One tenant's row underneath a schedule row, as returned by `GET /rent/agreements/{id}` and
 * `PUT …/terms` (backend spec v49/v50, FR-079).
 */
export interface RentAgreementTenantRowResponse {
  tenantId: string;
  /** Starts as the cycle's own date and moves independently, so it may differ from the parent's. */
  dueDate: string;
  amount: number;
  /** `null` for a **fixed-amount** share, which has no percentage — hence nullable on a tenant row. */
  sharePercent: number | null;
  status: 'Planned' | 'Cancelled';
  /** Whether a person authored `amount`; the screen marks the override and offers to clear it. */
  isAmountManuallyEdited: boolean;
  /** Derived per tenant — one tenant paying late does not freeze another's row. */
  isFrozen: boolean;
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
  /**
   * The tenants this fee is charged to (backend spec v37 FR-058).
   *
   * **An empty array — or an omitted field — means every active tenant shares the fee.** That is the
   * backend's own encoding, not a client convention, which is why there is no way to express "charge
   * nobody" and none is needed: a fee nobody owes is not a fee.
   *
   * Only the Add Additional Fee page fills this in. The lease create/edit screens leave it absent and
   * so keep their pre-existing shared-fee behaviour unchanged.
   */
  tenantIds?: string[];
  items: AdditionalChargeItemCreationRequest[];
}

/**
 * The body of `POST /rent-agreements/{id}/additional-charges` — appending **one** fee to a lease that
 * is already saved.
 *
 * **The charge's own fields sit at the body root**, which is why this is the charge itself rather than
 * a wrapper around it. The backend's `AddAdditionalChargeCommandJsonConverter` reads the charge from
 * `document.RootElement`; a body nested under a `charge` member would deserialize to a charge with
 * every required field missing and come back as a `400`.
 *
 * `isManualInvoice` is deliberately **not** modelled. The endpoint still accepts it and documents it
 * as ignored — every invoice this route raises is `Manual` regardless — so sending it would assert a
 * decision the client does not get to make.
 *
 * `id` is this endpoint's **idempotency key** rather than an edit selector: repeating a body that
 * carries one returns the stored charge and writes nothing. The fee panel emits no id, so this app
 * never sends one and instead blocks its own submit while a request is in flight.
 */
export type AddAdditionalChargeRequest = AdditionalChargeCreationRequest;

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
  /**
   * This cycle's per-tenant rows (backend spec v49/v50, FR-079). `[]` when the cycle bills as a group.
   *
   * **Decided per cycle, not per lease.** After a group/non-group switch a protected cycle keeps its old
   * shape, so one agreement can carry children on some cycles and none on others. The UI must read this
   * array rather than inferring the shape from the lease's group-invoice setting, which after a switch
   * describes only how *future* cycles bill.
   */
  tenants?: RentAgreementTenantRowResponse[];
  /**
   * The sum of {@link tenants}, or `null` when the cycle has none (FR-080).
   *
   * Shown **alongside** {@link rent}, never instead of it: once a tenant's amount is authored the two
   * legitimately differ, and a screen that renders only one of them misreports either what the lease says
   * or what the tenants owe. `null` rather than `0`, because zero would read as "the tenants owe nothing".
   */
  tenantAmountTotal?: number | null;
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
  frequencyConfig?: FrequencyConfig | null;
  startDate?: string | null;
  endDate?: string | null;
  hasNoEndDate: boolean;
  /**
   * Who the fee is charged to, echoed back on every path that returns a charge — **empty meaning
   * every active tenant shares it** (backend spec v37 FR-058). Optional on this interface only
   * because it cannot be re-derived client-side and older responses this app was written against
   * predate the field; when the server sends it, it is authoritative.
   */
  tenantIds?: string[];
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
  /**
   * Server-computed: whether `PUT …/terms` would currently accept a deposit change — true only while the
   * lease is an unactivated draft (backend spec v48). Lets the UI disable the fields instead of letting
   * the user edit them and discover the 409 on save. Same convention as the per-row `isFrozen` and
   * per-charge `isApplied` capability flags.
   */
  isDepositEditable: boolean;
  /**
   * Server-computed: whether the first rental due date may currently be re-picked — true only while
   * the lease's status is `Active` or `Expiring` (backend spec v61). Confirmed by the user 2026-08-20:
   * an unactivated draft (`InProcess`) behaves like create (the picker always resolves against fresh
   * candidates); once active, an edit must not silently clear the saved value out from under the user
   * just because it no longer appears in the forward-looking candidate list.
   */
  isFirstRentalDueDateEditable: boolean;
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
    frequencyConfig: charge.frequencyConfig,
    startDate: charge.startDate,
    endDate: charge.endDate,
    hasNoEndDate: charge.hasNoEndDate,
    // Carried across for the same reason as every other field: `PUT …/terms` resubmits the complete
    // charge, so a fee charged to two of four tenants — which only the Add Additional Fee page can
    // create — would silently become a fee shared by all four the next time the lease screen saved.
    tenantIds: charge.tenantIds,
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

/**
 * One tenant's rent/deposit split, as sent to `PUT /rent-agreements/{id}/tenants` (lease wizard
 * step 2). `tenantId` identifies a tenant *within this demo app only* — there is no tenant-profile
 * service wired up yet (mirroring `propertyId`/`propertyUnitId`/`propertyOwnerId`, which are also
 * client-generated placeholders), so the UI mints a `crypto.randomUUID()` per tenant row and never
 * resolves it against anything real.
 */
export interface AgreementTenantShareRequest {
  tenantId: string;
  rentAmount: number;
  rentPercent: number | null;
  deposit: number;
  depositPercent: number | null;
}

/**
 * The whole-set replace body for Step 2 of the lease wizard. Re-openable and idempotent by design:
 * submitting the same body twice converges on the same state, and a tenant dropped from the set is
 * deactivated server-side rather than deleted, so invoices already raised against them survive.
 */
export interface SaveAgreementTenantsRequest {
  isGroupInvoice: boolean;
  partialPaymentAllowed: boolean;
  tenants: AgreementTenantShareRequest[];
}

export interface SaveAgreementTenantsResponse {
  agreementId: string;
  isGroupInvoice: boolean;
  partialPaymentAllowed: boolean;
  /** The submitted tenant set, echoed back in submission order — a tenant deactivated by omission is absent. */
  tenantIds: string[];
}

/**
 * One saved tenant's shares, read back from `GET /rent-agreements/{id}/tenants` **exactly as they
 * were entered**.
 *
 * `rentPercent`/`depositPercent` are `null` when the owner typed a fixed dollar amount rather than a
 * percentage — which is what lets the screen re-open on the input mode they actually chose, instead
 * of guessing one. `rentAmount`/`deposit` are always present, because a percentage share resolves to
 * an amount server-side.
 */
export interface AgreementTenantShareResponse {
  tenantId: string;
  rentAmount: number;
  rentPercent: number | null;
  deposit: number;
  depositPercent: number | null;
}

/**
 * The saved state of lease-wizard step 2, as `GET /rent-agreements/{id}/tenants` returns it.
 *
 * Mirrors {@link SaveAgreementTenantsRequest} field for field, so the screen round-trips what it
 * submitted rather than having to reconstruct it. The per-tenant rows are present in **group** mode
 * too: group invoicing changes how the lease is billed, not whether a share was recorded per tenant.
 *
 * Only **active** tenants come back. A tenant dropped from an earlier save was deactivated rather
 * than deleted and stays out of this list — their historical split lives on the invoices already
 * raised against them.
 *
 * The service maps the endpoint's `204 No Content` — the lease exists but step 2 was never saved —
 * to `null`, which is deliberately *not* the same as a saved set that happens to be empty.
 */
export interface AgreementTenantsResponse {
  isGroupInvoice: boolean;
  partialPaymentAllowed: boolean;
  tenants: AgreementTenantShareResponse[];
}

/**
 * `POST /rent-agreements/{id}/activate` — opens the lease's billing gate and generates the invoices
 * that bring it up to its unpaid-cycle target, in one transaction.
 *
 * In production this call is made by the Lease service when a lease activates, which is where the three
 * fields below come from. This app has no Lease service, so:
 *
 * - **`leaseId` is the rent agreement's own id.** Confirmed by the user 2026-08-26. A minted placeholder
 *   would be one more meaningless GUID to reconcile; reusing the agreement id keeps the two sides of the
 *   demo obviously paired.
 * - **`version` is the caller's ordering fence.** A call carrying a version *below* the stored one is
 *   rejected as out of order (`409`), which is what stops a delayed retry from overwriting newer state.
 *   Nothing here issues versions, so the first activation sends `1`.
 * - **`activatedAt` is now**, converted server-side to a date in the property's own time zone before the
 *   begin-date gate judges it.
 */
export interface ActivateRentAgreementRequest {
  leaseId: string;
  version: number;
  activatedAt: string;
}

/**
 * What activation did — enough to tell a genuine activation from a harmless retry without re-reading
 * the agreement.
 */
export interface ActivateRentAgreementResponse {
  rentAgreementId: string;
  leaseId: string;
  /** The **original** instant on a repeat, not the retry's. */
  activatedAt: string;
  /**
   * `true` when the agreement was already active and this call changed nothing. Still a `200`: the
   * endpoint is idempotent by contract, so a repeat is a success rather than a conflict.
   */
  alreadyActive: boolean;
  /** How many invoices this call raised — always `0` on a repeat, which generates nothing. */
  invoicesGenerated: number;
}

export interface UpdateRentAgreementTermsRequest {
  endDate?: string | null;
  fullRent: number;
  frequency: RentFrequency;
  frequencyConfig: FrequencyConfig;
  firstRentalDueDate: string;
  /**
   * Deposit fields — send **only** when the agreement's `isDepositEditable` is true (backend spec v48).
   * Supplying any of them once the deposit is locked is a `409 rent_agreement.deposit_not_editable` that
   * fails the entire edit; omitting them leaves the stored deposit untouched.
   */
  deposit?: number | null;
  depositDueDate?: string | null;
  depositCollected?: boolean;
  scheduleRows: ScheduleRowCreationRequest[];
  additionalCharges: AdditionalChargeCreationRequest[];
}

/**
 * One submitted line of a proposed-invoice correction —
 * `PATCH /rent/agreements/{id}/proposed-invoices/{proposedInvoiceId}`.
 *
 * **There is no `amount`.** The amount is `quantity × rate`, derived server-side; a client-supplied
 * total that disagreed with its own factors would be one nobody could reconcile, so the contract gives
 * it nowhere to go.
 */
export interface UpdateProposedLineRequest {
  /**
   * The existing line this entry revises, or omitted to **add** a new line.
   *
   * Post back the `lineId` that came off the invoice read: the backend derives each invoice line's id
   * from the proposed line it was raised from, so the two are the same value. Dropping it on a line
   * the user merely edited would soft-delete that line and add a stranger in its place.
   */
  lineId?: string;
  /** The catalog row, or `null` for a free-form line. **Required** when the proposal's category is deposit. */
  lineItemId?: string | null;
  /** Parsed case-insensitively server-side, and subject to the deposit allowlist. */
  itemType: string;
  description: string;
  /** Must be greater than zero. */
  quantity: number;
  /** Must be greater than zero. */
  rate: number;
}

/**
 * The body of `PATCH /rent/agreements/{id}/proposed-invoices/{proposedInvoiceId}` — a correction to
 * one invoice's due date, its line set, or both.
 *
 * **`PATCH` semantics: an absent member means "leave unchanged".** Omit `dueDate` to keep the current
 * date; omit `lines` to keep the current line set.
 *
 * **A present `lines` is the COMPLETE new set** — each entry may carry the `lineId` it revises, an
 * entry without one adds a line, and a live line the array omits is **soft-deleted**. That is the only
 * shape in which a removal can be expressed, and it is also why a partial array is a data-loss bug
 * rather than a smaller request.
 */
export interface UpdateProposedInvoiceRequest {
  dueDate?: string;
  lines?: UpdateProposedLineRequest[];
}

/** One live line of a corrected proposal, as returned by the PATCH. */
export interface ProposedLineResponse {
  /** The line's identity, to be posted back on a subsequent correction. */
  lineId: string;
  /** Where the line came from — `Rent` or `Manual`. */
  source: string;
  lineItemId?: string | null;
  itemType: string;
  description: string;
  quantity: number;
  rate: number;
  /** The share percentage the line was derived from, or `null`. */
  appliedSharePercent?: number | null;
  amount: number;
  /** Whether a person authored this line's figure. */
  isAuthored: boolean;
}

/** One tenant who owes part of a corrected proposal, and what they owe. */
export interface ProposedInvoicePayerResponse {
  tenantId: string;
  amount: number;
  sharePercent?: number | null;
  /** Display position within the proposal, starting at one. */
  order: number;
}

/**
 * A proposed invoice as returned after a successful correction.
 *
 * **Deliberately not the invoice shape.** Seventeen of `InvoiceDetailResponse`'s members — invoice
 * number, generated-on, timezone, property ids, payments, credits, tenant shares, stream version,
 * void/delete stamps — do not exist on a proposal, and returning them null would misstate what a
 * proposal is. The **lines** are the part that genuinely is shared, and their field names are aligned
 * with `InvoiceLineResponse` on purpose so one table component can render both.
 */
export interface ProposedInvoiceDetailResponse {
  id: string;
  occurrenceId: string;
  /** The cycle billed, or `null` for a manual, charge, or deposit proposal. */
  rentScheduleId?: string | null;
  /** What anchored this proposal — `Schedule`, `System`, `Manual`, `Deposit`. */
  source: string;
  /** What it bills for — `Rent` or `Deposit`. */
  category: string;
  status: string;
  dueDate: string;
  /** The derived total — the sum of the live lines. */
  amount: number;
  amountPaid: number;
  isGroupProposal: boolean;
  payers: ProposedInvoicePayerResponse[];
  /** Always `true` on a successful correction. */
  isManuallyUpdated: boolean;
  /** The live lines; soft-deleted ones are excluded. */
  lines: ProposedLineResponse[];
}
