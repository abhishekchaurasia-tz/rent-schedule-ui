export type LeaseTermType = 'fixed' | 'month_to_month';

export type RentFrequency =
  | 'monthly'
  | 'bi_monthly'
  | 'weekly'
  | 'bi_weekly'
  | 'semesterly'
  | 'custom';

export interface MonthDay {
  month: number;
  day: number;
}

export interface FrequencyConfig {
  dueOnDay?: number;
  dueOnDays?: number[];
  dayOfWeek?: number;
  cycle?: MonthDay[];
  dueDates?: string[];
}

export interface ScheduleOverride {
  scheduledDate: string;
  dueDate?: string;
  rent?: number;
}

/**
 * One row the caller already knows about, sent on every preview call (not only at initial edit-load)
 * so the backend can derive whether a freshly computed row still corresponds to a cancelled one
 * (backend spec v46) — the client no longer decides that itself. Mirrors the backend's
 * `ExistingScheduleRowInput`.
 */
export interface ExistingScheduleRowInput {
  scheduledDate: string;
  dueDate: string;
  rent: number;
  isManualChanged: boolean;
  /** `'Cancelled'` or `'Planned'` — PascalCase, matching the backend's smart-enum naming convention. */
  status: string;
  invoiceStatus: string | null;
  invoiceDueDate: string | null;
}

export interface PreviewRentScheduleRequest {
  startDate: string;
  endDate?: string | null;
  leaseTermType: LeaseTermType;
  rent: number;
  frequency: RentFrequency;
  firstRentalDueDate: string;
  frequencyConfig: FrequencyConfig;
  overrides?: ScheduleOverride[];
  monthToMonthInvoiceCount?: number | null;
  nextLeaseStartDate?: string | null;
  existingRows?: ExistingScheduleRowInput[];
  /**
   * Whether the lease bills as one shared invoice (backend spec v49/v50, FR-083). Omitted is treated as
   * `true` by the backend, which suppresses per-tenant rows entirely — so leaving all three per-tenant
   * fields off keeps the pre-v49 request and response exactly as they were.
   */
  isGroupInvoice?: boolean;
  /**
   * The active tenants' shares, supplied by the caller.
   *
   * The preview reads **nothing** from the database, and that is load-bearing rather than incidental
   * here: this screen holds the roster and every edit in the browser until Save, so a server-side read
   * would preview the state being replaced.
   */
  tenantSplit?: TenantSplitInput[];
  /**
   * Per-tenant edits the user has made but not yet saved, so the preview shows them rather than the
   * computed split. Must be re-sent on **every** preview call, exactly as `existingRows` must be.
   */
  pendingTenantRows?: PendingTenantRowInput[];
}

/** One tenant's share, as supplied to the preview (backend spec v49/v50). */
export interface TenantSplitInput {
  tenantId: string;
  /** Used verbatim when {@link percent} is absent, and does **not** move when the cycle's rent does. */
  amount: number;
  /** The percentage of each cycle's rent, or omitted for a fixed-amount share. */
  percent?: number | null;
}

/**
 * One unsaved per-tenant edit, supplied to the preview so it can show work that exists only in the
 * browser (backend spec v49/v50, FR-083).
 *
 * `amountPaid` and `invoiceDueDate` are the freeze inputs. The preview cannot read them, so omitting them
 * reports the row as editable — correct for a cycle that has never billed, and the caller's job to supply
 * for one that has.
 */
export interface PendingTenantRowInput {
  scheduledDate: string;
  tenantId: string;
  dueDate?: string | null;
  /** Supplied overrides the computed share; omitted shows the computed share, as on save. */
  amount?: number | null;
  isCancelled?: boolean;
  amountPaid?: number | null;
  invoiceDueDate?: string | null;
}

/** One tenant's previewed row underneath a previewed schedule row (backend spec v49/v50, FR-083). */
export interface PreviewTenantRow {
  tenantId: string;
  dueDate: string;
  amount: number;
  sharePercent: number | null;
  status: string;
  isAmountManuallyEdited: boolean;
  isFrozen: boolean;
}

export interface ScheduleRow {
  scheduledDate: string;
  dueDate: string;
  rent: number;
  /**
   * `'Cancelled'` or `'Planned'`, derived server-side (backend spec v46) by correlating this preview's
   * request against the `existingRows` the caller supplied. Optional because rows built directly from
   * an agreement's own GET/PUT response (`loadAgreement()`/`saveEdit()`) don't set it — those already
   * carry their own authoritative `status` on `RentAgreementScheduleRowDetail` instead.
   */
  status?: string;
  /**
   * This cycle's previewed per-tenant rows (backend spec v49/v50). `[]` in group mode and when the caller
   * supplied no split. Optional for the same reason as {@link status}: rows built from an agreement's own
   * GET/PUT response carry `RentAgreementScheduleRowResponse.tenants` instead.
   */
  tenants?: PreviewTenantRow[];
  /**
   * The sum of {@link tenants}, or `null` when there are none — shown alongside {@link rent}, never
   * instead of it, matching the saved read so the screen renders both the same way before and after Save.
   */
  tenantAmountTotal?: number | null;
}

/**
 * The backend never returns validation errors in a 200 response body — a business validation
 * failure is a 400 Bad Request (RFC 9457 Problem Details) instead. Callers should catch that via
 * the HttpClient error channel, not by reading a field off a success response.
 */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
}

export interface PreviewRentScheduleResponse {
  rows: ScheduleRow[];
  totalInvoices: number;
  totalAmount: number;
}

export interface CandidateDateRequest {
  startDate: string;
  endDate?: string | null;
  leaseTermType: LeaseTermType;
  frequency: RentFrequency;
  frequencyConfig: FrequencyConfig;
  monthToMonthInvoiceCount?: number | null;
  nextLeaseStartDate?: string | null;
}

export interface CandidateDateResponse {
  dates: string[];
}
