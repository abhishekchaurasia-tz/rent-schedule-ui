**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v6

# Stop omitting a deleted row from the edit-mode save

Companion to `innago-rent-accounting` spec `01-rent-agreement.md` v45. The user's scenario: on the
edit page, edit a row's due date, then delete it — the edited due date was silently lost because
`saveEdit()` omitted the deleted row from `scheduleRows` entirely (the backend's absence-means-removal
contract, part1 §7.2), so whatever the user just edited on that row never reached the backend at all.

## Checklist

- [x] **`cancelledRowDates` (server-confirmed) stays excluded.** Sending one of those rows would hit
      the backend's `Cancelled`-restore branch (v42) and wrongly restore it — only a fresh,
      this-session `deletedRowDates` row changes filtering.
- [x] **No new request field.** `isCancelled` already exists on `ScheduleRowCreationRequest` (spec
      v41/v3), previously only used by `save()` (create mode).

Open questions: **none.**

## Technical Approach

`saveEdit()`'s `scheduleRows` filter narrows from excluding both sets to excluding only
`cancelledRowDates`, and the per-row mapper adds `isCancelled`, mirroring `save()`'s existing shape:

```ts
scheduleRows: preview.rows
  .filter((row) => !this.cancelledRowDates().has(row.scheduledDate))
  .map((row) => ({
    scheduledDate: row.scheduledDate,
    dueDate: row.dueDate,
    rent: row.rent,
    isManualChanged: this.manuallyChangedRowDates().has(row.scheduledDate),
    isCancelled: this.deletedRowDates().has(row.scheduledDate)
  })),
```

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|------------------------|-----|
| 1 | Which set stays excluded | `cancelledRowDates` only | Both sets (previous behaviour) | A `deletedRowDates` row must now be sent so the backend can apply its in-flight edits before cancelling (spec v45); a `cancelledRowDates` row must stay omitted or resubmitting it would restore it (v42) |

## Data Model & Schema Changes

None — client-side filter/mapping change only.

## Task Checklist

- [x] Update `saveEdit()` in `rent-agreement-create.component.ts`.
- [x] Invert `omits a deleted row from the save...` test to `sends a deleted row flagged
      isCancelled: true...` in `rent-agreement-edit.component.spec.ts`.
- [x] Run `npx ng test` — passes with no regressions.
- [x] Live-verify via Playwright against the rebuilt backend (v45): edit a row's due date, delete it,
      save; confirm the `PUT` response shows the row `Cancelled` with the edited due date.

## Test Plan

- `sends a deleted row flagged isCancelled: true, carrying its edited due date (spec v45)`: deleting a
  row no longer shrinks `scheduleRows`; the deleted row is present, tagged `isCancelled: true`.
- Full suite: `npx ng test --watch=false --browsers=ChromeHeadless`.
