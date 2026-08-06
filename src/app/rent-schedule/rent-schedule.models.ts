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
}

export interface ScheduleRow {
  scheduledDate: string;
  dueDate: string;
  rent: number;
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
