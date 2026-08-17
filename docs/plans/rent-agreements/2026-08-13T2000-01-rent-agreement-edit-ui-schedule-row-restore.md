**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v4

# Add a Restore action for a cancelled row on the edit page

The backend (`innago-rent-accounting` spec `01-rent-agreement.md` v42 — see that repo's plan
`2026-08-13T2000-01-rent-agreement-schedule-row-restore.md` for the full domain-level design) made a
cancelled schedule row reversible: resubmitting its anchor on `PUT …/terms` restores the same row to
`Planned`. This plan is the client side — a Restore button on the edit page's cancelled-row display.

## Checklist

- [x] **No new request field needed.** The row already sits in `previewResult()`'s rows (v1); the
      restore action only needs to stop excluding it from what gets resubmitted.
- [x] **The create ("Add Lease") page needs no change.** Its pre-save row-delete already has a
      working restore affordance (`deletedRowDates`/`restoreRow()`), predating this feature entirely
      — a not-yet-saved row has no server state to "restore" in the first place.

Open questions: **none.**

## Technical Approach

`restoreCancelledRow(scheduledDate)` removes the date from `cancelledRowDates`. Once removed,
`isRowCancelled()` returns `false` for that row, so the template's existing `@if` chain falls through
to the normal row rendering (editable, with the ordinary row-menu) automatically — no separate
"restored" state needs tracking. `saveEdit()`'s `scheduleRows` filter
(`!deletedRowDates().has(...) && !cancelledRowDates().has(...)`) already includes any row not in
either set, so the restored row is resubmitted on the next save without further change — its
resubmission is what the backend treats as the restore signal.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | How the restored row is tracked client-side | Simply remove it from `cancelledRowDates` | Add a separate `restoredRowDates` set | The existing filter already treats "not in `cancelledRowDates`" as "include in the submission" — a second set would be redundant bookkeeping for the same fact |

## Data Model & Schema Changes

**None.**

## Task Checklist

- [x] **1. `rent-agreement-create.component.ts`**: add `restoreCancelledRow(scheduledDate)`.
- [x] **2. `rent-agreement-create.component.html`**: restore button in the cancelled-row template
      branch, replacing the empty action cell, styled like the existing client-deleted-row restore
      button.
- [x] **3. New test** — `rent-agreement-edit.component.spec.ts`: `restores a cancelled row on request,
      resubmitting it so the backend reactivates it` — calls `restoreCancelledRow()`, asserts
      `isRowCancelled()` flips to `false`, and that the row is present in the next `PUT` request body.
- [x] **4. Verify.** `tsc --noEmit` clean; full `rent-agreement*` Angular suite green; live browser
      re-verification (cancel a row, restore it, save, confirm it comes back Planned).

## Test Plan

**New — `rent-agreement-edit.component.spec.ts`**: see Task Checklist item 3.

**Unchanged and re-verified** — the full Angular `rent-agreement*` suite (29, up from 28) and `tsc
--noEmit`.

**Commands and expected results:**

```bash
npx tsc --noEmit -p tsconfig.json
npx ng test --watch=false --include='**/rent-agreement*.spec.ts'  # 29/29 green
```

Spec verification: FR-4 and FR-6 (this document, v4) are exercised end-to-end by the new test above
and by live browser verification.
