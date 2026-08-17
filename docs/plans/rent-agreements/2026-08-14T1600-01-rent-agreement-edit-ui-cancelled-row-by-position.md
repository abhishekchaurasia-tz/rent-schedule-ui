**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v8

# Extend ordinal-position tracking to server-confirmed cancelled rows

The user reported the deletion "reset" bug was still happening after v7 shipped. Live reproduction found
the exact remaining gap: v7 only remapped `deletedRowDates` (a row deleted client-side *this session*).
A row already cancelled **on the server** from a prior save (`cancelledRowDates`) was never given the
same treatment — it stayed keyed to its old exact `scheduledDate` forever, so a due-day/frequency-config
shift made its badge disappear and would have silently resubmitted it as `isCancelled: false` on the
next Save, un-cancelling a payment the user had deliberately cancelled earlier.

## Checklist

- [x] **Reproduced live before fixing**: create → edit → delete a row → save (server-confirmed
      Cancelled) → reload → change "Due on the day" → the CANCELLED badge vanished, and the captured
      `PUT` request showed all rows with `isCancelled: false`, including the one that used to be
      cancelled.
- [x] **The backend anchor never moves, by design** (`RentSchedule.ScheduledDate` has no mutator — it's
      the reconcile's immutable match key). So remapping `cancelledRowDates` to a new date on the
      frontend and later resubmitting it cannot "restore" the true old row; it inserts a new one at the
      new position instead. Confirmed this is the *correct* outcome, not a new bug: the true old anchor
      (e.g. the original Sep 1) has no principled representation in a schedule that no longer generates
      that date at all, so it staying permanently cancelled is right, and a fresh Planned row at the
      slot that now represents "September" is what Restore should produce.
- [x] **Create mode is unaffected** — `cancelledRowDates` is always empty there (nothing is
      server-confirmed pre-save), so the added remap is a no-op.

Open questions: **none.**

## Technical Approach

`generatePreview()`'s success handler gains a second index set, `cancelledIndexes`, computed
identically to `deletedIndexes` (same `previousRows`/`sameRowCount` values, just checked against
`cancelledRowDates()` instead of `deletedRowDates()`), and `cancelledRowDates` is remapped through it
the same way `deletedRowDates` already was:

```ts
const cancelledIndexes = sameRowCount
  ? new Set(
      previousRows
        .map((row, index) => (this.cancelledRowDates().has(row.scheduledDate) ? index : -1))
        .filter((index) => index !== -1)
    )
  : new Set<number>();

// ...
this.cancelledRowDates.set(
  new Set(
    response.rows
      .filter((_, index) => cancelledIndexes.has(index))
      .map((row) => row.scheduledDate)
  )
);
```

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|------------------------|-----|
| 1 | Scope | Apply the identical ordinal-position logic already used for `deletedRowDates` | A different mechanism (e.g. tag cancelled rows some other way) | The two sets have the exact same "keyed by an anchor that can shift" problem; reusing the proven mechanism is simpler and keeps both trackers consistent |
| 2 | What happens when the remapped cancelled row is later restored | Accepted as an insert-a-new-row outcome | Try to make Restore reach back to the true original anchor | Not possible without violating the backend's immutable-anchor invariant; the new-row outcome is also the semantically correct one — "today's September slot" is a different row than "the September slot as it existed before the due-day change" |

## Data Model & Schema Changes

None — client-side tracking-key change only.

## Task Checklist

- [x] Add `cancelledIndexes` computation and remap `cancelledRowDates` in `generatePreview()`
      (`rent-agreement-create.component.ts`), mirroring the existing `deletedRowDates` logic.
- [x] Add `carries a server-confirmed cancelled row onto its new date when dueOnDay shifts every
      anchor (spec v7)` to `rent-agreement-edit.component.spec.ts`.
- [x] Run `npx ng test --watch=false --browsers=ChromeHeadless` — 87/87 pass, no regressions.
- [x] Live-verify via Playwright: cancel a row, save, reload, change "Due on the day", confirm the
      CANCELLED badge survives at the new date and the next Save still excludes it (row count 3, not 4).

## Test Plan

- `carries a server-confirmed cancelled row onto its new date when dueOnDay shifts every anchor`:
  loads an agreement with a server-cancelled row at `2026-03-01`, shifts `dueOnDay` (same row count,
  3 rows), flushes a preview with `2026-03-15` in its place — asserts `isRowCancelled('2026-03-01')` is
  now false, `isRowCancelled('2026-03-15')` is true, and the row stays excluded from the next Save
  (`scheduleRows.length` is 2, not 3).
- Full suite: `npx ng test --watch=false --browsers=ChromeHeadless` → 87/87 passed.
- Live Playwright verification: create → delete a row → save → reload → shift "Due on the day" →
  confirm the CANCELLED badge is retained at the new date and the PUT payload has 3 rows (not 4, and
  none with `isCancelled: false` for the row that should stay cancelled).
