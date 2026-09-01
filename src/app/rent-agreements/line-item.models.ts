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
 * never sees. Send {@link ItemTypeOption.wire}; read {@link LineItemResponse.itemType}.
 */
export interface CreateLineItemRequest {
  propertyOwnerId: string;
  name: string;
  itemType: string;
}

/** One classification a user may file a new catalog entry under. */
export interface ItemTypeOption {
  /** The PascalCase member name, as it comes back on `LineItemResponse.itemType`. */
  value: string;
  /** The snake_case form the create request must send. */
  wire: string;
  label: string;
}

/**
 * The classifications offerable when creating a catalog entry for a **non-deposit** invoice.
 *
 * Mirrors what `GET /line-items` would return under the `AllExcludingCredit` scope: every
 * `InvoiceItemType` less the ten `StaticallyExcludedTypes` (always system-generated and never
 * persistable as a catalog row), less the two deposit-shaped ones, less `Credit`.
 *
 * Deposit entries are deliberately absent and no deposit invoice offers this at all — the backend
 * refuses a non-system deposit catalog row (`DepositItemMustBeSystemDefined`), so a deposit invoice
 * picks from the system-defined list or not at all.
 */
export const PICKABLE_ITEM_TYPES: readonly ItemTypeOption[] = [
  { value: 'Rent', wire: 'rent', label: 'Rent' },
  { value: 'Maintenance', wire: 'maintenance', label: 'Maintenance' },
  { value: 'Water', wire: 'water', label: 'Water' },
  { value: 'Internet', wire: 'internet', label: 'Internet' },
  { value: 'Electricity', wire: 'electricity', label: 'Electricity' },
  { value: 'Parking', wire: 'parking', label: 'Parking' },
  { value: 'PetFee', wire: 'pet_fee', label: 'Pet Fee' },
  { value: 'HOAFee', wire: 'hoa_fee', label: 'HOA Fee' },
  { value: 'CustomRent', wire: 'custom_rent', label: 'Custom Rent' },
  { value: 'CustomHoa', wire: 'custom_hoa', label: 'Custom HOA' },
  { value: 'RecurringInvoiceCharge', wire: 'recurring_invoice_charge', label: 'Recurring Charge' }
];
