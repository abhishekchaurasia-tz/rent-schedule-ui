**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v15

## Checklist

- [x] Reported by the user: on the edit screen, changing anything on the agreement can silently
  clear the "On which date should the first rental invoice be due?" selection, forcing the user to
  re-pick it even when nothing about that intended to happen.
- [x] Root cause confirmed by direct code reading (an earlier, less careful pass had wrongly assumed
  the control was disabled outright in edit mode — it never was): `refreshCandidateDates()` fires on
  every form change, in both create and edit mode, and its success handler unconditionally clears
  `firstRentalDueDate` to `null` whenever the fresh, forward-looking candidate list from
  `POST .../first-rental-due-date-options` no longer contains the currently selected value — which
  is routine for an edit of a lease that already started, since that endpoint only ever returns
  dates from today forward.
- [x] Confirmed with the user, after being asked which lease statuses should be exempt: an
  unactivated draft (`InProcess`) should keep today's behavior exactly (it behaves like create — the
  value always resolves against the fresh list); once the lease is `Active` or `Expiring`, the saved
  value must be preserved and never silently cleared just because it fell out of the list.
- [x] Backend companion change already shipped (`innago-rent-accounting` spec `01-rent-agreement.md`
  v61): `GET`/`PUT .../terms` now return `isFirstRentalDueDateEditable`, computed from the lease's
  status — the client reads this flag rather than deciding from the raw `status` string itself
  (matching the "API decides, UI just renders" principle already behind `isDepositEditable`, v48/v12).
- [x] No open questions.

## Technical Approach

`RentAgreementDetailResponse` gains `isFirstRentalDueDateEditable: boolean` (mirroring
`isDepositEditable`'s existing shape and doc-comment convention).

`refreshCandidateDates()`'s success handler gains one guard,
`canAutoClearFirstRentalDueDate` (a private getter): `!this.isEditMode ||
this.loadedAgreement()?.isFirstRentalDueDateEditable !== true`. The existing auto-clear (`dates.length
> 0 && !dates.includes(currentSelection)`) now also requires this guard before it actually clears the
control — create mode and an edit-mode `InProcess` draft keep exactly today's behavior; an edit-mode
`Active`/`Expiring` lease no longer has its value cleared.

A new `firstRentalDueDateSelectOptions()` method (the `<select>`'s actual option source, replacing a
direct read of `candidateDates()`) injects the current form value into the rendered list when it is
missing — otherwise, once the value is preserved rather than cleared, the `<select>` would render as
"nothing chosen" purely because no `<option>` exists for it, even though the underlying `FormControl`
still holds it. The `[attr.disabled]`/placeholder-text conditions that read `candidateDates().length
=== 0` are updated to read `firstRentalDueDateSelectOptions().length === 0` instead, so injecting the
preserved value doesn't leave the control looking disabled/empty when it actually has one valid,
selectable option.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|------------------------|-----|
| 1 | Which statuses exempt the value from auto-clear | `Active`/`Expiring`, via the server's `isFirstRentalDueDateEditable` flag | Comparing the raw `status` string client-side (`status === 'active' \|\| status === 'expiring'`) | Confirmed directly by the user; matches the already-established `isDepositEditable` precedent — the client should never re-derive a business rule the server already computed and can change independently of the client's knowledge. |
| 2 | How the preserved value stays visible in the `<select>` | A dedicated `firstRentalDueDateSelectOptions()` injecting the current value | Switching the control to a free-text/datepicker input once preserved | Keeps one control type for the non-custom-frequency path; the injection pattern is a small, local, well-contained addition rather than a mode-dependent UI switch. |

## Data Model & Schema Changes

N/A — this is a UI-only, purely client-side change beyond the backend's already-shipped
`isFirstRentalDueDateEditable` field (`innago-rent-accounting` spec v61), which this plan only
consumes.

## Task Checklist

- [x] **`src/app/rent-agreements/rent-agreement.models.ts`**: added `isFirstRentalDueDateEditable:
  boolean` to `RentAgreementDetailResponse`.
- [x] **`src/app/rent-agreements/rent-agreement-create.component.ts`**: added the
  `canAutoClearFirstRentalDueDate` getter, gated the existing auto-clear in
  `refreshCandidateDates()`'s success handler on it, and added `firstRentalDueDateSelectOptions()`.
- [x] **`src/app/rent-agreements/rent-agreement-create.component.html`**: swapped the `@for` loop and
  the `[attr.disabled]`/placeholder conditions from `candidateDates()` to
  `firstRentalDueDateSelectOptions()`.
- [x] **`src/app/rent-agreements/add-tenants.component.spec.ts`**,
  **`src/app/rent-agreements/rent-agreement-edit.component.spec.ts`**: added the new required field
  to each fixture's `RentAgreementDetailResponse` literal (`isFirstRentalDueDateEditable: false`,
  matching each fixture's default draft-like status).
- [x] **`src/app/rent-agreements/rent-agreement-edit.component.spec.ts`**: added
  `clears the first rental due date when the lease is not yet reselection-eligible…` (draft — value
  still clears, unchanged behavior) and
  `preserves the first rental due date on an active lease even when it falls out of the fresh
  candidate list…` (active — value survives, and stays a selectable option).
- [x] Ran `npx tsc -p tsconfig.spec.json --noEmit` (clean) and `npx ng build` (clean) and
  `npx ng test --watch=false --browsers=ChromeHeadless` — full suite, 103/103 green.
- [x] Updated `docs/specs/rent-agreements/01-rent-agreement-edit-ui.md` with the `v15` row.

## Test Plan

1. **Draft lease (`isFirstRentalDueDateEditable: false`)**: a change that shifts the candidate list
   away from the loaded value still clears `firstRentalDueDate` — proves the create-like path is
   unchanged.
2. **Active lease (`isFirstRentalDueDateEditable: true`)**: the same kind of change no longer clears
   the value, and `firstRentalDueDateSelectOptions()` still contains it — proves the value is both
   preserved in the form model and still rendered as selected in the UI.
3. Full Karma suite (103 specs) green as the regression guard — including the pre-existing
   `does not re-preview after loading` test, which depends on the same debounced valueChanges
   pipeline this change touches.
