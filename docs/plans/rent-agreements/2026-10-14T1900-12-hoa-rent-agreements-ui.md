**Spec:** [`docs/specs/rent-agreements/12-hoa-rent-agreements-ui.md`](../../specs/rent-agreements/12-hoa-rent-agreements-ui.md) — v1 · [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v27 · [`docs/specs/rent-agreements/03-update-proposed-invoice-ui.md`](../../specs/rent-agreements/03-update-proposed-invoice-ui.md) — v9 · [`docs/specs/rent-agreements/08-invoice-activity-timeline-ui.md`](../../specs/rent-agreements/08-invoice-activity-timeline-ui.md) — v3

# HOA rent agreements — the checkbox, the protected HOA Fee line, and the new history entry

```
Create form ──☑ HOA agreement──► POST …/rent/agreements {isHoa:true}
Edit form   ◄── GET …/rent/agreements/{id} {isHoa} ── box ticked, disabled; PUT …/terms never sends it
Correct (invoiceType = hoa_fee) ── main line = HOAFee (last one cannot be removed)
                                └─ picker: GET …/line-items?…&isHOATerm=true
Timeline ── entry type InvoiceTypeChanged ── "Changed from HOA Fee to Rent by the system."
```

## Setup & Environment

- Angular 19, `rent-schedule-ui`, branch `abhishek/hoa-rent-agreements` (cut from `origin/main` on
  2026-10-14).
- No packages added. Backend: Billing `abhishek/hoa-rent-agreement-scenarios` (spec
  `19-hoa-rent-agreements.md` v2, commit `663b4fd2`).
- Commands: `npx ng build` · `npm run build:qa` · `npx ng test --watch=false --browsers=ChromeHeadless`.
- **Made before this plan existed:** the `isHoa` form control, the checkbox in the template and `isHoa` on
  `CreateRentAgreementRequest`. M1 completed them; nothing else was touched before the plan.

### Prerequisites & Open Questions

- None open. Billing spec 19 G1–G16 are answered; FR 6 is a technical decision recorded below.
- Tests are run once at the end, not after every milestone (the user's request, 2026-10-14).

## Milestone-Based Implementation

### M1 — Create and edit (spec FR 1–4)

- [x] `src/app/rent-agreements/rent-agreement.models.ts`: `isHoa?: boolean` on `CreateRentAgreementRequest`
  and on `RentAgreementDetailResponse`.
- [x] `src/app/rent-agreements/rent-agreement-create.component.ts`: `isHoa: [false]`; the create body sends
  `isHoa: Boolean(value.isHoa)`; the edit load patches `isHoa: agreement.isHoa ?? false` and disables the
  control; `saveEdit` does not send it.
- [x] `src/app/rent-agreements/rent-agreement-create.component.html`: the checkbox under *Lease Term Type*.
- [x] `src/app/rent-agreements/rent-agreement-create.component.spec.ts`: create sends `isHoa` true and false;
  edit ticks and disables the box from the response; a response without `isHoa` reads as a rental.

### M2 — Update proposed invoice (spec FR 5, 6)

- [x] `src/app/invoices/update-proposed-invoice.component.ts`: new `isHoaFeeInvoice` getter
  (`invoiceType` is `hoa_fee`); `isLastSubjectLine` subject kinds are `['deposit', 'petdeposit']` on a
  deposit invoice, `['hoafee']` on an HOA Fee invoice, otherwise `['rent']`; the refusal says *"An HOA Fee
  invoice must keep its HOA Fee line…"* on an HOA Fee invoice.
- [x] Same file, `loadLineItems`: `{ isFromIncomeList: true, isHOATerm: true }` on an HOA Fee invoice;
  unchanged otherwise. The comment explaining why `isHOATerm` is withheld is rewritten: it is still
  withheld where the screen cannot know, and an HOA Fee invoice lets it know.
- [x] `src/app/invoices/update-proposed-invoice.component.spec.ts`: removing the last HOA Fee line on an
  `hoa_fee` invoice is refused, removing a Rent line there is allowed, and the picker request carries
  `isHOATerm=true` on `hoa_fee` (the existing test still pins its absence elsewhere).

### M3 — Timeline (spec FR 7)

- [x] `src/app/invoices/invoice-history.models.ts`: `'InvoiceTypeChanged'` added to `InvoiceHistoryEntryType`.
- [x] `src/app/invoices/invoice-activity-timeline.component.spec.ts`: an `InvoiceTypeChanged` entry renders
  its text.

### M4 — Docs

- [x] Changelog rows linking this plan in `01-rent-agreement-edit-ui.md` (v27),
  `03-update-proposed-invoice-ui.md` (v9) and `08-invoice-activity-timeline-ui.md` (v3); each added to
  this plan's `**Spec:**` line.

## Scope & Context Rules

- **May modify:** the files named above and their specs.
- **Must not modify:** the invoice list (spec 04 already labels `hoa_fee`), the additional charge panel, the
  interceptor, environments and proxy files.
- Do not add packages or restructure components.

### Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | One spec or edits to 01, 03, 08 | New spec 12 with changelog rows in 01, 03, 08 | Only edit the three specs | Mirrors Billing spec 19; one place states the feature, each screen's spec records its change |
| 2 | The checkbox on edit | Shown ticked and disabled | Hidden; editable | The terms update ignores it (Billing BR-02); a disabled box says the agreement is HOA without offering a change that would do nothing |
| 3 | `isHOATerm` on the Correct screen | Sent only when `invoiceType` is `hoa_fee` | Never (until now); always | The screen withheld it because it could not know the term is HOA. An HOA Fee invoice says so, and legacy offers HOA Fee only on HOA terms |
| 4 | Where the checkbox sits | *Lease Dates* panel, under *Lease Term Type* | A panel of its own | It describes the kind of agreement, like the term type beside it |
| 5 | The refusal sentence on an HOA Fee invoice | Its own: *"An HOA Fee invoice must keep its HOA Fee line…"* | Reuse the rent sentence | "must keep its rent line" would name a line the invoice does not have |

## Verification

**Do not continue to the next milestone if any check fails.** Tests run once at the end (user, 2026-10-14).

- `npx ng build` and `npm run build:qa` clean, no new budget warning.
- `npx ng test --watch=false --browsers=ChromeHeadless` green.
- Against a running Billing on `abhishek/hoa-rent-agreement-scenarios` (manual): create with the box
  ticked, reopen it, activate it and see *HOA Fee* invoices; on *Correct*, removing the HOA Fee line is
  refused.

## Git & Rollback

- Work on `abhishek/hoa-rent-agreements`, uncommitted until the user confirms.
- Rollback: additive — one form control, one request field, two branches on the Correct screen and one
  union member; reverting the commit removes them and nothing else changes.

## Final Validation

- [x] Spec ↔ plan links resolve both ways (spec 12 v1, 01 v27, 03 v9 and 08 v3 link this plan; this plan
  links each).
- [x] Build and tests green (2026-10-14): `ng build` succeeds with the two budget warnings that were already
  there (`invoice-list` and `rent-agreement-create` styles, untouched); `ng test` 823 of 823.
- [x] Create and edit of a rental agreement behave as before (the existing create and edit specs pass unedited).
