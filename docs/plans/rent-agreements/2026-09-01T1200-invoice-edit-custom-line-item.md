**Spec:** [`docs/specs/rent-agreements/03-update-proposed-invoice-ui.md`](../../specs/rent-agreements/03-update-proposed-invoice-ui.md) — v4

## Checklist

- [x] Re-examined v2's conclusion that a custom item type is impossible here. The premise held —
      `ProposedInvoiceEditFactory` does `Enum.TryParse<InvoiceItemType>(submitted.ItemType, …)` and
      answers `invoice.unrecognized_charge_item_type` otherwise — but the conclusion did not: a custom
      item can be created in the **catalog** and referenced by id.
- [x] `POST /api/v1/line-items` is an **idempotent get-or-create by name**
      (`CreateLineItemCommand(PropertyOwnerId, Name, InvoiceItemType)`), returning the resolved entry.
      A repeat of an existing name returns that entry rather than failing or duplicating.
- [x] **Casing is asymmetric and both halves are load-bearing.** The create body binds to a C# enum, so
      the API's `JsonStringEnumConverter(SnakeCaseLower)` reads it — `pet_fee`. `LineItemResponse.ItemType`
      is a plain `string` built with `item.ItemType.ToString()`, which the converter never sees —
      `PetFee`. The PascalCase form is what `Enum.TryParse(ignoreCase: true)` on the correction endpoint
      accepts, so the round trip works.
- [x] Deposit catalog rows must be system-defined (`DepositItemMustBeSystemDefined`), which is why the
      fee panel hides its own add affordance in `depositOnly` mode.
- [x] `isFromIncomeList` is consulted **only** under `AllExcludingCredit`, and `HOAFee` is admitted only
      when `isHOATerm` is true **as well** — so either flag alone changes nothing.

Open questions: none.

## Technical Approach

**A custom item here is a custom *name* filed under an existing classification.** That is what the
catalog models, and it is the shape both endpoints accept: the line carries the new entry's
`lineItemId` plus its classification, and the correction endpoint parses the latter into its enum
happily.

So the picker's "+ Add Item Type" asks for the two things the catalog needs — a **name** and a **kind
of charge** — rather than the fee panel's single free-text box. The fee panel can take one field
because *its* endpoint get-or-creates a catalog row from whatever it is handed; this one cannot, and
pretending otherwise is what v2 got wrong by omission.

On confirm the component posts to `/line-items`, adds the resolved entry to its local `lineItems`
signal, and then calls the existing `selectLineItem` — so the row is typed exactly as a catalog pick
is, including the description seeding added in v3, and the new entry is immediately available to the
invoice's other lines without a refetch.

**The catalog fetch moves to the income-list payload**, sending `isFromIncomeList: true` *and*
`isHOATerm: true`. The pair is deliberate: the backend consults the first only under
`AllExcludingCredit` and admits `HOAFee` only when both hold, so sending `isFromIncomeList` alone would
have been a no-op dressed up as a change.

**The shared `.item-picker-*` chrome moves to `src/styles.scss`.** Two screens now offer this control,
and an item should look and behave the same wherever it is chosen; each keeps only what genuinely
differs — the panel's inline free-text row, this page's name + classification form.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | How a custom item is created | A **catalog** entry via `POST /line-items`, referenced by id | Free-text `itemType` on the line, as the fee panel sends; a backend change to accept unknown types | The correction endpoint parses a fixed enum; free text could only ever be refused. Widening the enum would mean the invoice line no longer classifies against anything, which is what the enum is for. Requested by the user 2026-09-01 |
| 2 | What the add form asks for | Name **and** classification | Name only, like the fee panel | The catalog needs both, and the correction endpoint needs the classification separately from the id. A name-only form would have to guess the type, and guessing wrong is a `400` the user cannot interpret |
| 3 | `itemType` casing | snake_case on the create body, PascalCase read back; both modelled explicitly on `ItemTypeOption` | Derive one from the other; send PascalCase and hope the converter falls back | The asymmetry is real and the two sides are read by different mechanisms. Deriving would encode an assumption about `JsonNamingPolicy` internals in the client; an explicit pair of ~11 entries cannot silently drift |
| 4 | Which classifications are offered | Everything `AllExcludingCredit` would return: all types less the ten statically excluded, less the two deposit-shaped, less `Credit` | A short curated list | Offering fewer than the backend permits is a narrowing nobody recorded. The list mirrors a rule that already exists rather than inventing a second one |
| 5 | Deposit invoices | No add affordance at all, guarded in the component as well as the template | Offer it and let the `400` explain | A deposit catalog row must be system-defined, so it is refused every time. Guarding only in the template would leave the method reachable from a test or a future caller |
| 6 | Income-list flags | Both `isFromIncomeList` and `isHOATerm` | `isFromIncomeList` alone | The backend admits `HOAFee` only when both are true; sending one would have looked like the requested change while doing nothing |
| 7 | `.item-picker-*` styles | Extracted to `src/styles.scss` | Leave the second copy; raise the budget | Third block to hit this (`.banner`, then the panel chrome, now this one). The duplication is also what put this file over the 6 kB budget — extracting cleared it *and* the fee panel's |

## Data Model & Schema Changes

None. No backend change: this uses `POST /api/v1/line-items` and the `isFromIncomeList`/`isHOATerm`
parameters of `GET /api/v1/line-items`, both of which already exist. The TypeScript delta is
`CreateLineItemRequest`, `ItemTypeOption` and `PICKABLE_ITEM_TYPES`.

## Task Checklist

- [x] `src/app/rent-agreements/line-item.models.ts` — `CreateLineItemRequest`, `ItemTypeOption`,
      `PICKABLE_ITEM_TYPES`, with the casing asymmetry documented.
- [x] `src/app/rent-agreements/line-items.service.ts` — `create()`.
- [x] `src/app/invoices/update-proposed-invoice.component.ts` — income-list flags on the fetch;
      `isDepositInvoice`/`canAddItemType`; the add-form state; `startAddingNewItemType`,
      `cancelAddingNewItemType`, `createItemType`.
- [x] `src/app/invoices/update-proposed-invoice.component.html` / `.scss` — the add row and its form.
- [x] `src/styles.scss` — the shared `.item-picker-*` chrome; removed from both components.
- [x] `src/app/invoices/update-proposed-invoice.component.spec.ts` — eight cases (below).
- [x] Spec `03` v4 changelog row and FR 18–20.
- [x] `npx ng test --watch=false --browsers=ChromeHeadless` (248 passing) and `npx ng build` clean —
      and one fewer budget warning than before this pass.

## Test Plan

1. The catalog fetch carries `isFromIncomeList=true` and `isHOATerm=true`.
2. Creating an item posts the trimmed name, the owner id, and the **snake_case** classification.
3. The resolved entry lands in the local catalog and is selected on the row — id, classification, and
   the seeded description.
4. **The round trip**: after creating, a submit sends the line with the **PascalCase** `itemType` and
   the new `lineItemId`. This is the case the whole change turns on, so it is asserted end to end
   rather than inferred from step 2.
5. An unnamed type is refused locally with no request.
6. A `400` renders its detail and leaves the add form open.
7. A deposit invoice offers no add affordance, guarded in the component and not only in the template.
8. A second confirm while one is in flight is dropped.

Run: `npx ng test --watch=false --browsers=ChromeHeadless`.
