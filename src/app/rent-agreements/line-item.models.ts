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

/**
 * The body of `POST /api/v1/line-items` — an idempotent **get-or-create by name**, scoped to the
 * owner: an existing entry with that name comes back as-is, otherwise a new one is created.
 *
 * **`itemType` is snake_case on the wire**, unlike the PascalCase `LineItemResponse.itemType` that
 * comes back. The asymmetry is the backend's and is not a mistake to correct here: the request binds
 * to a C# `InvoiceItemType` enum, so the API's `JsonStringEnumConverter(SnakeCaseLower)` applies,
 * while the response carries a plain `string` built with `ItemType.ToString()`, which the converter
 * never sees. Send the snake_case member name; read {@link LineItemResponse.itemType} back.
 */
export interface CreateLineItemRequest {
  propertyOwnerId: string;
  name: string;
  itemType: string;
}
