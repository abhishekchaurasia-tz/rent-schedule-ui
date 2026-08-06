/**
 * The four picker shapes `GET /api/v1/line-items` can return
 * (`docs/rent-schedule-requirements/line-item.md` §7, backend `LineItemScope`).
 */
export type LineItemScope = 'DepositOnly' | 'NonDepositOnly' | 'AllExcludingCredit' | 'AllIncludingCredit';

/**
 * A single `LineItem` catalog entry, as returned by `GET /api/v1/line-items`.
 */
export interface LineItemResponse {
  id: string;
  name: string;
  itemType: string;
  isDepositType: boolean;
}
