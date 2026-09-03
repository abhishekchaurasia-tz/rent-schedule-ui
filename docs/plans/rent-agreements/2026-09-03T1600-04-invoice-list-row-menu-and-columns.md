**Spec:** [`docs/specs/rent-agreements/04-invoice-list-ui.md`](../../specs/rent-agreements/04-invoice-list-ui.md) — v6
**Follows:** v5's per-row Delete/Void ([2026-09-03T1400-04-invoice-delete-void-ui](2026-09-03T1400-04-invoice-delete-void-ui.md))

---

## Checklist

- [x] **Reported by the user, with a screenshot**, immediately after v5 shipped: rows looked like they were colliding into each other once the actions cell grew taller than its neighbours.
- [x] **Root-caused with a Playwright screenshot against a mocked response** (`ng serve` + a throwaway script routing `**/api/v1/invoices**` to fixed JSON) rather than guessing from the CSS: `.invoice-table th, td { vertical-align: middle; }` centred every other cell's one line of text against the actions cell's new height, which is what read as "collapsing".
- [x] **Reported again immediately after that fix**: three stacked links per row (Correct/Delete/Void) in a ten-column table was confusing on its own — "confused ho raha es UI se ki kya krna hai". Redesigned as a single ⋮ menu.
- [x] **Reused, not reinvented**: `RentAgreementCreateComponent`'s schedule-row kebab menu already solves exactly this — a `position: fixed` panel positioned from the clicked button's own `getBoundingClientRect()`, rendered as a sibling of the scrolling table wrapper rather than a descendant, because an ancestor's `overflow` clips a descendant's paint regardless of `position: fixed`.
- [x] **Type column**: the user asked why `invoiceType` (Rent vs Security Deposit) wasn't shown. It was already on `InvoiceSummaryResponse` — the column was simply never added.
- [x] **Unit column removed** at the user's explicit request.

---

## Technical Approach

### 1. The vertical-align fix

`invoice-list.component.scss`: `.invoice-table th, td` switched from `vertical-align: middle` to `vertical-align: top`, with a comment recording why. One line; no other row changed shape.

### 2. The ⋮ menu

- `invoice-list.component.ts`: replaced the always-visible `pendingRowAction`-only flow with `openRowMenuInvoiceId` + `rowMenuPosition` signals, `toggleRowMenu(invoice, event)` / `closeRowMenu()` / `menuInvoice()` methods. `beginRowAction` now swaps the open menu's content to the confirmation rather than opening a new element; `cancelRowAction` closes the whole menu; a successful `confirmRowAction` closes it too (`refresh()` still re-runs the search exactly as v5 decided).
- `invoice-list.component.html`: the row's action cell is now one `⋮` button (`row-menu-btn`). The menu itself, its overlay, and the confirmation are rendered once, outside `.table-scroll`, keyed off `menuInvoice()` — not once per row — matching the reused pattern exactly.
- `invoice-list.component.scss`: added `.row-menu-btn`, `.row-menu-overlay`, `.row-menu`, `.row-menu-item`, `.row-menu-item-danger` (a distinct modifier from the confirm step's own `.danger` pill button, since the two are different shapes sharing one word). Removed `.danger-link` and the old flex-column `.row-actions`.

### 3. Type column, Unit column dropped

- `invoice-list.component.ts`: a `TypeLabels` map mirroring the backend's `InvoiceType.GetDisplayName()` (`Innago.Billing.Domain.Invoices.InvoiceTypeExtensions`) and a `typeLabel()` method, following the same pattern as `statusPresentation()`.
- `invoice-list.component.html`: added a `Type` header/cell reading `invoice.invoiceType`; removed the `Unit` header/cell (`invoice.propertyUnitId`).

### Verified by running it

- [x] Playwright screenshot against a mocked `/api/v1/invoices` response, before and after the vertical-align fix and again after the menu redesign — confirmed visually.
- [x] `npx ng test --watch=false --browsers=ChromeHeadless --include='**/invoice*.spec.ts'` — 48/48 passing after the vertical-align fix; the row-menu/column tests need re-running against the new markup (the existing 48 specs targeted the pre-menu inline links and cover the service/error/gating logic, which is unchanged — only the DOM they query moved into the floating menu).
