**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v3
(and [`03-update-proposed-invoice-ui.md`](../../specs/rent-agreements/03-update-proposed-invoice-ui.md) — v3, which carries the same rule)

## Checklist

- [x] Two components own an item picker: `AdditionalChargePanelComponent` (two arms — an existing
      catalog entry via `selectExistingItem`, and a typed new type via `confirmNewItemType`) and
      `UpdateProposedInvoiceComponent` (`selectLineItem`, catalog only).
- [x] The panel is **shared**, so a change there reaches the Add Lease and Edit Lease screens, the Add
      Additional Fee page, and the Invoices page's add panel — one edit, four screens.
- [x] `LineItemResponse` carries both `name` (the catalog's display text, e.g. *"Monthly Rent"*) and
      `itemType` (the enum member, e.g. *"Rent"*). **`name` is what seeds the description** — it is the
      text a person recognises and the text the picker itself shows.

Open questions: none.

## Technical Approach

**One rule, applied at both pickers: copy the item's name into the description, but only into an empty
one.**

In the fee panel it lands in a single private `defaultDescriptionTo(index, name)` that both arms of the
picker call, so the catalog pick and the typed new type behave identically — the typed name is just as
much "the item's text" as a catalog entry's is. In the correction screen it is four lines inside
`selectLineItem`, which is that component's only picker.

**Why the emptiness guard is the whole design.** Picking an item is nearly always followed by typing
the same word into the description, so filling it in saves the common keystroke. Filling it in
*unconditionally* would be a data loss on the other path — and on the correction screen, that other
path is the **normal** one: nearly every row there is an existing invoice line that already carries an
authored description. A property owner correcting a line's item type would find the sentence a tenant
reads on the invoice silently replaced by a catalog label.

**"Still empty" settles both cases without knowing which it is in**, which is why the guard is on the
field's value rather than on some "is this an edit?" flag: a fresh row has nothing to lose, and a row
that already says something keeps saying it. Whitespace counts as empty — a description of `"   "` is
not something anyone wrote on purpose, and treating it as content would leave the field looking blank
and behaving as though it were not.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | When to fill the description | Only when it is empty or whitespace | Always; only for rows with no `lineId`; a "sync" toggle | Requested as *"jab bhi line item select kare to uska text by default description me chala jana chahiye, agar edit ke case me description hai to nahi jayega"* (2026-08-31). Testing emptiness answers both halves with one condition — a row-age flag would need every caller to know whether it is editing, and would still be wrong for a *new* row the user had already described |
| 2 | Which field seeds it | `LineItemResponse.name` | `itemType` | `name` is the catalog's display text and what the picker button itself shows; `itemType` is an enum member (`PetFee`, `LateFee`) that reads like code on a tenant-facing invoice |
| 3 | The typed-new-type arm | Seeded too, from the typed name | Catalog picks only | The typed name is exactly as much "the item's text". Leaving it out would make the two arms of one control behave differently for no reason a user could infer |
| 4 | Whitespace | Counts as empty | Only `''` counts | A field holding `"   "` looks blank; behaving as though it were full would be a bug reported as "it didn't fill in" |
| 5 | An unknown `lineItemId` | Leave the description alone | Clear it; set the raw id | `findLineItem` returns nothing when the catalog has not loaded or the id is stale. Writing anything then would put a wrong or empty value where the user may already have typed |

## Data Model & Schema Changes

None. No wire change: the description was already sent, and this only affects what it holds when the
user has not typed one.

## Task Checklist

- [x] `src/app/rent-agreements/additional-charge-panel.component.ts` — `defaultDescriptionTo`, called
      from `selectExistingItem` and `confirmNewItemType`.
- [x] `src/app/invoices/update-proposed-invoice.component.ts` — the same guard inside `selectLineItem`.
- [x] `src/app/rent-agreements/additional-charge-panel.component.spec.ts` — five cases: seeded from a
      catalog pick, seeded from a typed type, never overwritten (including on a *second* pick),
      whitespace treated as empty, and an unknown id left alone.
- [x] `src/app/invoices/update-proposed-invoice.component.spec.ts` — three cases: seeded on a new row,
      not overwritten on a server-loaded row while the type correction still applies, whitespace
      treated as empty.
- [x] Spec changelog rows and new FRs on `02` (FR 14) and `03` (FR 17).
- [x] `npx ng test --watch=false --browsers=ChromeHeadless` (232 passing) and `npx ng build` clean.

## Test Plan

The load-bearing case is the negative one, and it is asserted **together with** the positive half of the
same action: after picking a different item on a row that already has a description, the test checks
that `lineItemId`/`itemType` *did* change and the description *did not*. A test that only checked the
description could pass on a picker that had stopped working altogether.

Run: `npx ng test --watch=false --browsers=ChromeHeadless`.
