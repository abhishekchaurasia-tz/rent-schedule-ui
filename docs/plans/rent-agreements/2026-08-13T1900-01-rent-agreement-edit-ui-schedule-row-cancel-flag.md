**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v3

# Send an explicit per-row cancel flag, and fix a silently-inert status comparison

Two changes, made together after the user found both live:

1. The backend replaced its schedule-anchor cross-check + `excludedScheduleDates`
   (`innago-rent-accounting` spec v39/v40) with a much simpler mechanism: an explicit `isCancelled`
   flag on each submitted schedule row (v41). This plan is the client side of that reversal.
2. **A real, separate bug**, found while re-verifying the above live: the v1 cancelled-row-display
   work (this repo's own v1 plan) compared `row.status === 'cancelled'` — but the backend's
   `ScheduleStatus` is a smart enum, deliberately serialized PascalCase (`"Cancelled"`, `"Planned"`)
   rather than passed through the lowercase enum-value convention the rest of the wire uses. That
   comparison had **never once matched** since v1 shipped — the cancelled-row badge, its exclusion
   from the schedule total, and its exclusion from what gets resubmitted were all silently inert.

## Checklist

- [x] **The `excludedScheduleDates` field is removed entirely**, not deprecated or left dual-write —
      the backend no longer reads it at all after its own v41 reversal.
- [x] **The status-casing bug is a genuine, previously-shipped defect**, not a new requirement: v1's
      `cancelledRowDates` signal, its `isRowCancelled()` getter, and the schedule-summary exclusion
      logic were all written correctly *except* for the casing of the literal they compared against.
      Confirmed by checking the real API response for a cancelled row: `"status":"Cancelled"`.
- [x] **Fix the comparison, not the wire format.** The backend's PascalCase `ScheduleStatus` is an
      existing, intentional convention (documented in `innago-rent-accounting` spec v37) — changing
      it now would be a second wire-format change to accommodate one client's string comparison.

Open questions: **none.**

## Technical Approach

### `isCancelled` per row

`ScheduleRowCreationRequest.isCancelled?: boolean` added to the model. `save()`'s `scheduleRows`
mapping stops filtering `deletedRowDates` out of the array — every previewed row is now mapped,
with `isCancelled: this.deletedRowDates().has(row.scheduledDate)` alongside the existing
`isManualChanged`. `CreateRentAgreementRequest.excludedScheduleDates` is deleted from the model.

### Case-insensitive status comparison

A new private static helper:

```ts
private static isCancelledStatus(status: ScheduleRowStatus | undefined): boolean {
  return status?.toLowerCase() === 'cancelled';
}
```

replaces every direct `r.status === 'cancelled'` / `r.status !== 'cancelled'` comparison in
`loadAgreement()` and `saveEdit()`'s success handler (populating `cancelledRowDates` and excluding
cancelled rows from the schedule summary's `totalInvoices`/`totalAmount`).

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | How to represent a create-time deletion on the wire | Send every row, tagged `isCancelled` | Keep the omission + `excludedScheduleDates` shape | Mirrors the backend's own v41 reversal — confirmed simpler by the user: the client already knows which rows it deleted, so it states that directly on the row rather than the server inferring it from an array diff |
| 2 | Status casing fix location | A client-side case-insensitive comparison helper | Ask the backend to lowercase `ScheduleStatus` | The PascalCase format is an intentional, already-documented backend convention for this specific type (unlike the enums fixed in spec v37); the fix belongs entirely on the side that got the assumption wrong |

## Data Model & Schema Changes

**None.** Client-side model and comparison logic only.

## Task Checklist

- [x] **1. `rent-agreement.models.ts`**: add `ScheduleRowCreationRequest.isCancelled?: boolean`;
      remove `CreateRentAgreementRequest.excludedScheduleDates`.
- [x] **2. `rent-agreement-create.component.ts` — `save()`**: stop filtering `deletedRowDates` out
      of `scheduleRows`; add `isCancelled` to the per-row mapping; remove the
      `excludedScheduleDates` property from the request literal.
- [x] **3. `rent-agreement-create.component.ts` — add `isCancelledStatus()`** private static helper.
- [x] **4. Replace the four direct `status === 'cancelled'` / `!== 'cancelled'` comparisons**
      (`loadAgreement()`'s `previewResult`/`cancelledRowDates` setup, `saveEdit()`'s equivalent) with
      calls to `isCancelledStatus()`.
- [x] **5. Update tests**: the create-mode "deletes a row" tests now assert the deleted row is
      *present* in `scheduleRows` with `isCancelled: true`, instead of absent with a separate
      `excludedScheduleDates` entry.
- [x] **6. Verify.** `tsc --noEmit` clean; full `rent-agreement*` Angular suite green; live browser
      re-verification of the original reported scenario (generate 5 rows, delete one, Save).

## Test Plan

**Changed — `rent-agreement-create.component.spec.ts`**: `sends a pre-save deleted row with
isCancelled: true, still present in scheduleRows` (renamed/rewritten from the v2 test) — deletes a
row, saves, asserts `scheduleRows` contains **both** rows, the deleted one flagged
`isCancelled: true`, the other `isCancelled: false`. The "keeps a deleted row deleted when a
same-anchor re-preview fires" test's final assertion updated the same way.

**Unchanged and re-verified** — the full Angular `rent-agreement*` suite (28 tests) and `tsc
--noEmit`.

**Live verification**: reproduced the user's exact reported scenario in a headless browser —
5-row preview, delete the last row, Save — `201 Created`, no rejection.

**Commands and expected results:**

```bash
npx tsc --noEmit -p tsconfig.json
npx ng test --watch=false --include='**/rent-agreement*.spec.ts'  # 28/28 green
```

Spec verification: FR-7 and FR-9 (this document, v3) are exercised end-to-end by the updated tests
and the live browser verification above.
