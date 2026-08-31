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

## Test Plan

The existing suites are the test: every date-carrying assertion in
`rent-schedule-preview.component.spec.ts` checks the **request body**, which must still be
`"YYYY-MM-DD"` — so those eight tests failing on the type change, and passing once the seeds became
`Date`s, is exactly the round-trip proof wanted. `invoice-list.component.spec.ts`'s filter cases assert
`dueDateFrom`/`dueDateTo` reach the query string unchanged.

Run: `npx ng test --watch=false --browsers=ChromeHeadless`.
