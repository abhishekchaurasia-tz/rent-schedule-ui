**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v2

> **Part 2 of this plan (`excludedScheduleDates`) reverted in full by
> [2026-08-13T1900-01-rent-agreement-edit-ui-schedule-row-cancel-flag](2026-08-13T1900-01-rent-agreement-edit-ui-schedule-row-cancel-flag.md)
> (spec v3) — kept for history.** Part 1 (the `generatePreview()` same-anchor fix) stands unchanged.

# Preserve a row deletion across an unrelated re-preview, and declare it to the backend

Two related defects in the create ("Add Lease") page's row-delete workflow, found and fixed in the
same investigation:

1. **A client bug**: deleting a previewed row, then changing an unrelated field (e.g. the rent
   amount), could silently un-delete it. The debounced auto-preview re-fires on *any*
   schedule-signature change — including one that cannot move a single date — and
   `generatePreview()`'s success handler unconditionally cleared `deletedRowDates`, on the
   (usually-true-but-not-always) assumption that a fresh preview means entirely new row identities.
2. **A server gap**, exposed once (1) was fixed: `POST /rent-agreements` had no way to distinguish
   "the client deliberately deleted this row" from "the client accidentally dropped it" — both look
   identical, an expected anchor absent from `scheduleRows`. The backend (`innago-rent-accounting`
   spec `01-rent-agreement.md` v39/v40) added a cross-check for the second case and a way to declare
   the first; this plan is the client side of declaring it.

## Checklist

- [x] **(1) is a real, independently reproducible bug**, verified live in a browser: generate a
      5-row preview, delete one row, change the rent amount, observe the deleted row silently
      reappear after the debounced re-preview.
- [x] **The first fix attempt for (1) had its own bug**: `generatePreview()` read
      `this.previewResult()` *inside* the HTTP success callback to compute "did the dates change",
      but `previewResult` had already been reset to `null` synchronously at the top of the same
      method (to drive the loading state) — so the comparison was always against an empty set and
      never actually preserved anything. Caught only by re-verifying live in the browser after the
      first patch, not by the unit tests (none exercised "delete, then trigger exactly one more
      re-preview, then check"). Fixed by capturing the previous dates *before* the reset.
- [x] **(2)'s backend companion validation only covers fixed-term leases** — see
      `innago-rent-accounting`'s v39 plan for why (month-to-month's row count has no
      server-derivable expectation). This plan's `excludedScheduleDates` field is accepted by the
      backend regardless of lease term type, but only changes behaviour for fixed-term requests.
- [x] **(2)'s first design had its own gap, found live**: shipping the backend's schedule-anchor
      check (v39) without also declaring intentional deletions immediately regressed the "delete a
      row before saving" feature — a legitimate, pre-existing workflow — for every fixed-term lease
      with any deleted row. `excludedScheduleDates` (v40 on the backend, this plan on the client) is
      the fix, not an enhancement.

## Technical Approach

### (1) `generatePreview()`'s same-anchor check

Capture `previousDates` as a local variable at the very start of `generatePreview()`, before
`this.previewResult.set(null)` runs:

```ts
const previousDates = new Set(this.previewResult()?.rows.map((row) => row.scheduledDate) ?? []);
this.previewLoading.set(true);
// ... existing resets ...
```

In the HTTP success handler, compare the fresh response's dates against that captured snapshot
(not against `this.previewResult()`, which is `null` by then):

```ts
const sameAnchors =
  response.rows.length === previousDates.size &&
  response.rows.every((row) => previousDates.has(row.scheduledDate));
// ...
if (!sameAnchors) {
  this.deletedRowDates.set(new Set());
}
// manuallyChangedRowDates is still unconditionally cleared — the preview is stateless and always
// recomputes every row's rent from scratch, so a hand-edited amount is superseded regardless of
// anchor overlap.
this.manuallyChangedRowDates.set(new Set());
```

### (2) `excludedScheduleDates` on the create request

`CreateRentAgreementRequest` (`rent-agreement.models.ts`) gains `excludedScheduleDates?: string[]`.
`save()` sends `Array.from(this.deletedRowDates())` — the exact set already used one line above to
filter `scheduleRows` — so no new client-side tracking is introduced, only a new wire field
exposing what already existed.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | How to detect "the re-preview didn't actually move any dates" | Compare the new response's row dates against a snapshot of the previous preview's dates, captured before the reset | Compare against `lastPreviewSignature` | The signature includes schedule-*amount* fields (`rent`) alongside date-shape fields, so it changes even when dates don't — comparing actual dates is the only way to know row identities are unchanged |
| 2 | Where to source `excludedScheduleDates`'s value | Reuse `deletedRowDates` as-is | Track a separate "declared exclusions" set | `deletedRowDates` already is exactly the set of deliberately-removed anchors — a second set would be redundant and could drift from the first |

## Data Model & Schema Changes

**None.** Client-side signal and outbound request field only.

## Task Checklist

- [x] **1. `rent-agreement-create.component.ts` — `generatePreview()`**: move the `previousDates`
      capture above the `previewLoading`/`previewResult` reset; use the captured value (not
      `this.previewResult()`) in the success handler's `sameAnchors` check.
- [x] **2. `rent-agreement.models.ts`**: add `CreateRentAgreementRequest.excludedScheduleDates?: string[]`.
- [x] **3. `rent-agreement-create.component.ts` — `save()`**: add
      `excludedScheduleDates: Array.from(this.deletedRowDates())` to the `CreateRentAgreementRequest`
      literal.
- [x] **4. New test (create-mode spec)**: `keeps a deleted row deleted when a same-anchor re-preview
      fires (e.g. rent-only change)` — deletes a row, changes rent, flushes a same-dates preview
      response, asserts the deletion survives and the saved request still omits that row.
- [x] **5. New test (create-mode spec)**: `names a pre-save deleted row in excludedScheduleDates,
      distinct from a client bug (spec v40)` — deletes a row, saves, asserts `scheduleRows` excludes
      it (unchanged) and `excludedScheduleDates` now names it.
- [x] **6. Verify.** `tsc --noEmit` clean; full `rent-agreement*` Angular test suite green; live
      browser re-verification of the original bug scenario (delete row → change rent → confirm it
      stays deleted).

## Test Plan

**New — `rent-agreement-create.component.spec.ts`**, two tests (see Task Checklist 4–5 above).

**Manual/live verification** (Playwright-driven headless Chrome against the real dev server and
API, screenshots captured): generated a 4-row preview (Aug–Nov 2026), deleted the Nov row, changed
rent 100 → 250, waited for the debounced re-preview — the Nov row remained visibly greyed out/
struck-through after the change, proving fix (1) holds against the actual running app, not just
the mocked `HttpTestingController` suite.

**Unchanged and re-verified — the full Angular `rent-agreement*` suite (28 tests)** and `tsc
--noEmit` — proof neither fix altered any other documented behaviour.

**Commands and expected results:**

```bash
npx tsc --noEmit -p tsconfig.json
npx ng test --watch=false --include='**/rent-agreement*.spec.ts'  # 28/28 green
```

Spec verification: FR-7 and FR-8 (this document) are exercised end-to-end by the new tests and the
live browser verification above.
