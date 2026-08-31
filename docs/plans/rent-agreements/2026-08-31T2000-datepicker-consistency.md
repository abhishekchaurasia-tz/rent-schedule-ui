## Checklist

- [x] Audited every date input in the app: `grep -rn 'type="date"' src/app --include=*.html` found
      **ten** native pickers across three components — two in the invoice list, one in the lease
      create/edit page's per-tenant row, and seven in the rent-schedule preview.
- [x] The lease create/edit page **already** had `MatDatepickerModule`/`MatFormFieldModule`/
      `MatInputModule` + `provideNativeDateAdapter()` and imported `parseIsoDate`/`toIsoDate` — its one
      native input was a straightforward oversight, not a missing capability.
- [x] `buildFrequencyConfig` already maps custom `dueDates` through `toIsoDate`, so it accepts `Date`s
      with no change.
- [x] `toIsoDate` passes a string through unchanged, which is what lets a control hold either a `Date`
      (datepicker) or an ISO string (candidate `<select>`) without branching at the point of use.

No spec change of its own: this is a cross-cutting consistency fix with no behavioural requirement
behind it, so it is recorded as a plan and as a changelog row on each spec whose screen it touches.

## Technical Approach

**One date control in the app: the Angular Material datepicker.** Every remaining
`<input type="date">` is replaced with the `mat-form-field` + `matInput [matDatepicker]` +
`mat-datepicker-toggle` trio the lease form and the fee panel already used.

The substantive part is not the markup, it is the **value type**. A native date input's control holds
a `"YYYY-MM-DD"` string; a Material datepicker's holds a native `Date`. So each converted control's
read sites move to `toIsoDate` and each seed site to `parseIsoDate` — the two helpers already in
`src/app/shared/date.util.ts`, which exist precisely because `Date#toISOString` is UTC and lands a day
early for anyone west of Greenwich.

Per component:

- **`invoice-list`** — two filter controls default to `null`; `buildQuery` reads them through
  `toIsoDate`. `(dateChange)` replaces `(change)` so the page-reset still fires.
- **`rent-agreement-create`** — the per-tenant due-date cell is *not* a form control: it is a
  `[value]`/`(change)` pair over a `Map` of ISO strings, which is the shape the save sends. Two
  template-facing wrappers, `asDate` and `asIso`, do the conversion at the one point the picker and the
  map meet, leaving the stored shape untouched.
- **`rent-schedule-preview`** — seven controls (start, end, next-lease start, custom due dates,
  first-rental due date, and both override dates) plus the module wiring it did not have at all.
  `addOneYear` now works in local `Date`s end to end; it previously round-tripped through
  `toISOString`, which was the same UTC bug in miniature.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Which date control | Material datepicker, everywhere | Native `<input type="date">` everywhere; leave the mix | Requested by the user (*"calendar kyu mat wala nahi kar rahe, har jagah alag calendar laga rahe ho"*, 2026-08-31). The mix was an inconsistency I introduced, not a considered split — a native picker also renders differently per browser and per OS locale, so two screens of the same app looked like two apps |
| 2 | How the value is converted | `parseIsoDate` on seed, `toIsoDate` on read | `Date#toISOString().slice(0,10)`; a custom `DateAdapter` that formats ISO | `toISOString` is UTC: for anyone west of Greenwich a date picked as the 1st is sent as the previous month's 31st. A custom adapter would fix the formatting but leave every existing `toIsoDate` call site as a second convention |
| 3 | The per-tenant cell's stored shape | Still ISO strings in the `Map`; convert at the template boundary | Store `Date`s in the map | The map's contents are what `saveEdit` sends. Changing its element type to satisfy a widget would push the conversion into the save path, which is the one place a date-format mistake is silent and permanent |
| 4 | Mixed-type `firstRentalDueDate` | Left as `Date | string`, read through `toIsoDate` | Normalise to one type | The control genuinely holds two shapes — an ISO string when picked from the candidate `<select>`, a `Date` when the free-form picker is shown instead. `toIsoDate` already passes strings through, so no branch is needed; the candidate comparison is done in ISO for the same reason |
| 5 | `addOneYear` | Rewritten in local `Date`s | Keep the ISO round-trip and convert at the edges | It was already a latent UTC bug: `new Date("2026-08-01T00:00:00")` is local, `toISOString()` is UTC, so the derived end date was a day early west of Greenwich. Converting the signature fixed it rather than preserving it |
| 6 | **Follow-up** — the filter bar's two pickers | `[matDatepicker]` on a **plain** input in a bordered box, no `mat-form-field` | Keep the form field and compact it with density overrides and `subscriptSizing="dynamic"` | Reported by the user with a screenshot: the fields towered over the bar's other controls. A form field is a full-height control with a floating label and a reserved subscript line, and fighting all three with overrides is a losing battle in a compact bar. `[matDatepicker]` is a directive on the input — the form field is optional — so dropping it keeps the identical calendar while the input is styled exactly like its neighbours |
| 7 | **Follow-up** — the filter input | `readonly` | Editable, with the picker as an extra affordance | The value is a `Date` the picker owns; letting someone type into it would need a parser and a per-locale format guess for no gain. `readonly` also removes the caret, so the box reads as one button onto the calendar |
| 8 | **Follow-up** — `.panel-overlay`, `.close-btn`, `.link-btn` | Extracted to `src/styles.scss` | Leave the copies; raise the per-component budget | Each was written out identically in two or three components — the same reason `.banner` moved earlier — and that duplication was what had `invoice-list.component.scss` over the 6 kB budget. Raising the budget would have hidden the cause |

## Data Model & Schema Changes

None. No wire format changes — every request still carries `"YYYY-MM-DD"`, and now does so in local
time on paths that previously did not.

## Task Checklist

- [x] `src/app/invoices/invoice-list.component.ts` / `.html` / `.scss` — Material modules,
      `provideNativeDateAdapter()`, `Date` controls, `toIsoDate` in `buildQuery`, two pickers,
      `.date-field`.
- [x] `src/app/rent-agreements/rent-agreement-create.component.ts` / `.html` / `.scss` — `asDate` /
      `asIso` wrappers, the per-tenant picker, `.tenant-date-field`.
- [x] `src/app/rent-schedule/rent-schedule-preview.component.ts` / `.html` / `.scss` — module wiring,
      `Date` controls, `toIsoDate` at all four read sites, `addOneYear` rewritten, seven pickers,
      `.date-field`.
- [x] `src/app/rent-schedule/rent-schedule-preview.component.spec.ts` — date inputs seeded as local
      `Date`s via a `localDate` helper; the candidate-clear assertion now expects `null`.
- [x] `grep -rn 'type="date"' src/app --include=*.html` returns nothing.
- [x] `npx ng test --watch=false --browsers=ChromeHeadless` (224 passing) and `npx ng build` clean.

**Follow-up — the filter bar's two pickers looked wrong (user screenshot):**

- [x] `invoice-list.component.html` — the two date filters drop `mat-form-field`/`matInput` for a plain
      `readonly` input carrying `[matDatepicker]`, inside the same `.filter` label-above wrapper as the
      other controls, with the toggle beside it in a `.date-input` box.
- [x] `invoice-list.component.ts` — `MatFormFieldModule`/`MatInputModule` dropped; only
      `MatDatepickerModule` is still needed.
- [x] `invoice-list.component.scss` — `.date-input` styled to match the neighbouring inputs;
      `.filter > input` scoped to a direct child so it cannot border the input inside that box; the
      shared text metrics of both shapes merged into one rule.
- [x] `src/styles.scss` — `.panel-overlay`, `.close-btn` and `.link-btn` extracted from the components
      that duplicated them; removed from `invoice-list` and `additional-charge-panel`.
- [x] `rent-agreement-create.component.scss` — the row-edit and per-tenant in-table pickers merged into
      one rule rather than two identical ones.
- [x] Budgets: `invoice-list.component.scss` is back under 6 kB and
      `additional-charge-panel.component.scss`'s pre-existing overage shrank from 394 to 189 bytes.
      `rent-agreement-create.component.scss` remains over — it was already, and this pass leaves it
      ~57 bytes worse for the one selector the per-tenant picker needs.

## Test Plan

The existing suites are the test: every date-carrying assertion in
`rent-schedule-preview.component.spec.ts` checks the **request body**, which must still be
`"YYYY-MM-DD"` — so those eight tests failing on the type change, and passing once the seeds became
`Date`s, is exactly the round-trip proof wanted. `invoice-list.component.spec.ts`'s filter cases assert
`dueDateFrom`/`dueDateTo` reach the query string unchanged.

Run: `npx ng test --watch=false --browsers=ChromeHeadless`.
