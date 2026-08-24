**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v16

## Checklist

- [x] Found while the user verified v15 live: on a **fresh** edit-page load of a **draft** lease
  (`isFirstRentalDueDateEditable: false`, so v15's exemption does not apply) — no field touched at
  all — the "On which date should the first rental invoice be due?" `<select>` already showed blank.
  Confirmed directly by the user: this happens on the very first page open, before any edit, and the
  lease is still a draft/`InProcess`.
- [x] Root cause: `loadAgreement()`'s success handler calls `refreshCandidateDates()` once,
  unconditionally, right after patching the form with the saved lease's values. That very first
  candidate fetch is subject to the same auto-clear v15 added a status-based exemption for — but the
  candidate endpoint enumerates dates purely from the recurrence's cadence (`dueOnDay`, etc.), so an
  already-saved anchor that was picked freely at creation (the "verbatim first row" the domain's
  `GenerationWindow.AnchorDate` deliberately allows off-cadence) routinely will not appear in it —
  with **no edit having happened at all**. v15's `isFirstRentalDueDateEditable` guard does not help
  here, because it is deliberately scoped to `Active`/`Expiring`; a draft is correctly exempt from
  it, but was never meant to be exempt from *this* case — no edit occurred, so there is nothing to
  legitimately require a re-pick of.
- [x] No open questions — this is strictly narrower than v15's rule: never auto-clear on the very
  first fetch after load, in every status; v15's status-gated rule continues to govern every fetch
  after that, once the user actually starts editing.

## Technical Approach

`refreshCandidateDates()` gains an `isInitialLoad` parameter (default `false`). `loadAgreement()`'s
one call site passes `true`; every other call site (the debounced `form.valueChanges` subscriber,
and the constructor's create-mode call) keeps the default. The success handler's auto-clear
condition gains `&& !isInitialLoad` alongside v15's existing `canAutoClearFirstRentalDueDate` guard —
so the very first fetch after load never clears the field, regardless of status, and every
subsequent fetch (triggered by an actual change) goes through v15's rule as before.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|------------------------|-----|
| 1 | How to identify "no edit has happened yet" | An explicit `isInitialLoad` parameter on `refreshCandidateDates`, set only by `loadAgreement()`'s own call | A signature/snapshot comparison (a `loadedScheduleSignature` vs. current `scheduleSignature()`) | The one call this must exempt is a single, statically-known call site — `loadAgreement()`'s own, made before any `valueChanges` emission is even possible. A snapshot comparison would work too but adds a second piece of state to keep in sync for a distinction that a plain boolean parameter, threaded through one call, already answers exactly. |

## Data Model & Schema Changes

None — purely client-side.

## Task Checklist

- [x] **`src/app/rent-agreements/rent-agreement-create.component.ts`**: added `isInitialLoad`
  parameter to `refreshCandidateDates`; `loadAgreement()` now calls
  `this.refreshCandidateDates(true)`; the success handler's auto-clear condition gains
  `&& !isInitialLoad`.
- [x] **`src/app/rent-agreements/rent-agreement-edit.component.spec.ts`**: added
  `preserves the loaded first rental due date on the very first candidate fetch, even on a draft
  lease, when the fresh list does not happen to include it (spec v15)` — flushes the detail response
  directly (bypassing the `load()` helper, which always returns a matching candidate list) and
  flushes `optionsUrl` with a list that excludes the loaded value, asserting it survives.
- [x] Ran `npx ng build` (clean) and `npx ng test --watch=false --browsers=ChromeHeadless` — full
  suite, 104/104 green.
- [x] Updated `docs/specs/rent-agreements/01-rent-agreement-edit-ui.md` with the `v16` row.

## Test Plan

1. **Draft lease, fresh load, no edit**: detail response flushed, then the options response flushed
   with a candidate list that excludes the loaded `firstRentalDueDate` — the value must survive and
   remain a selectable option, reproducing and closing the exact reported symptom.
2. Full Karma suite (104 specs) green as the regression guard, including every v15 case (which must
   still behave identically once a real edit follows the initial load).
