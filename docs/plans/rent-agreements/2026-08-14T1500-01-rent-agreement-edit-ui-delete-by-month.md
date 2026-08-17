**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v7

# Track a deleted row by ordinal position, not exact scheduledDate

Reported bug: delete a row, then change "Due on the [day]" or "First rental due date" — the deletion
silently disappears and every row looks normal again. Confirmed root cause via live reproduction
(Playwright): those fields shift every row's `scheduledDate`, not just the visible due date, because
the backend's `Schedule.FromDueDates` sets `scheduledDate == dueDate` at generation time. The old
"same-anchor" check (`v1`) compared the *entire* schedule's date set for equality, so any shift — even
one that only moves days within the same conceptual period — wiped `deletedRowDates` wholesale.

The user's first stated fix was to scan by **month** — if a month had a deleted row, its new row
(whatever day it now falls on) should still show deleted. Implemented, then the user asked to check
the same situation for every other frequency (bi-monthly, weekly, semi-annual, custom) and implement
whatever is best. Month-matching turned out to be unsafe once generalized: **bi-monthly and weekly
schedules can have more than one row per month**, so matching by month alone would wrongly carry a
deletion onto an unrelated sibling row sharing that month once a `dueOnDays`/`dayOfWeek` shift moved
both. The final design instead matches by **ordinal position** in the row list, which is correct for
every frequency without special-casing any of them.

## Checklist

- [x] **Reproduced live before fixing** — a Playwright run confirmed `dueOnDay: 1 → 15` moves every
      row's `scheduledDate` (`2026-09-01 → 2026-09-15`, etc.), and the existing binary same-anchor
      check cleared `deletedRowDates` as a result.
- [x] **Month-matching implemented first, then rejected** once checked against bi-monthly/weekly: a
      unit test proved it would wrongly mark an unrelated same-month sibling row as deleted after a
      `dueOnDays` shift. Replaced with ordinal-position matching before this was reported as done.
  - [x] **Ordinal position holds across every frequency** because both the previous and fresh row lists
      are chronologically sorted by construction (the backend generator emits dates in order, and
      neither side re-sorts): monthly's 1-row-per-month, bi-monthly's 2-per-month, weekly's ~4-per-month,
      bi-weekly's ~2-per-month, semi-annual's 2-per-year, and custom's explicit list all preserve row
      order across a config-only shift that doesn't add or remove rows.
- [x] **Scope is deletion only, not manual-edit.** The user's report and fix request were specific to
      delete; spec v44/v5 already settled that a hand-edited amount must reset on any schedule change,
      which is a separate, already-confirmed decision not touched here.
- [x] **Row-count change still clears entirely** — a longer/shorter term or a genuine frequency change
      has no principled positional correspondence between old and new rows, so this deliberately keeps
      the pre-existing "frequency change loses row identity" behavior (D9) rather than guessing a
      mapping.
- [x] **The old rent-only "same-anchor" test must still pass unmodified** — a rent-only change doesn't
      move any date or change row count, so index-based matching trivially reduces to the same result.
      Confirmed by re-running the existing test after the change.

Open questions: **none.**

## Technical Approach

`generatePreview()`'s success handler replaces the binary `sameAnchors` check (whole-schedule date-set
equality) with a row-count/index check. `previousRows` is captured at the top of the method (before
the synchronous `previewResult.set(null)` reset that would otherwise make it unreadable inside the
async success handler):

```ts
const previousRows = this.previewResult()?.rows ?? [];
// ... HTTP call ...
.subscribe({
  next: (response) => {
    const sameRowCount = previousRows.length === response.rows.length;
    const deletedIndexes = sameRowCount
      ? new Set(
          previousRows
            .map((row, index) => (this.deletedRowDates().has(row.scheduledDate) ? index : -1))
            .filter((index) => index !== -1)
        )
      : new Set<number>();

    this.previewResult.set({ ...response, totalAmount: ... });
    this.lastPreviewSignature = this.scheduleSignature();
    this.previewLoading.set(false);
    this.manuallyChangedRowDates.set(new Set());
    this.deletedRowDates.set(
      new Set(response.rows.filter((_, index) => deletedIndexes.has(index)).map((row) => row.scheduledDate))
    );
    this.closeRowMenu();
  },
  ...
});
```

No `monthKeyOf()` helper is needed — the abandoned month-based attempt's helper was removed before
this was reported as final.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|------------------------|-----|
| 1 | Matching granularity | Ordinal position (index in the chronologically-sorted row list) | Exact date (v1, previous); `"YYYY-MM"` month prefix (first attempt, rejected) | Month-matching over-catches for bi-monthly/weekly (proven by a unit test with a same-month sibling row); index matching is correct for every frequency uniformly, since row order and count are preserved by a due-date/day-of-week/cycle-day config shift |
| 2 | Row-count change | Clear tracking entirely | Attempt a best-effort positional diff (e.g. longest-common-subsequence on dates) | No principled correspondence exists between old and new rows when the count itself changes — a longer/shorter term or a frequency change already has a documented "loses row identity" warning (D9); guessing a mapping risks silently misattributing a deletion to the wrong row |
| 3 | `manuallyChangedRowDates` | Left as unconditional clear (v44/v5), no positional carry-over added | Apply the same index-matching to manual edits | Out of scope — the user's report and explicit fix request were about deletion; manual-edit reset-on-any-change is a separate, already-confirmed decision |

## Data Model & Schema Changes

None — client-side tracking-key change only.

## Task Checklist

- [x] Replace the `sameAnchors` check in `generatePreview()` with row-count/ordinal-index matching in
      `rent-agreement-create.component.ts`; remove the abandoned `monthKeyOf()` helper.
- [x] Add `carries a deleted row onto its new date by ordinal position when dueOnDay shifts every
      anchor (spec v7)` to `rent-agreement-create.component.spec.ts` (Monthly).
- [x] Add `carries a deleted row by position, not by month, when a bi-monthly config shift adds a
      same-month sibling (spec v7)` — proves the rejected month-based approach would have failed here
      (Bi-Monthly).
- [x] Add `carries a deleted row onto its new date when a weekly dayOfWeek shift moves every anchor
      (spec v7)` (Weekly/Bi-Weekly's shared generator).
- [x] Add `carries a deleted row onto its new date when one custom due date is edited in place
      (spec v7)` (Custom).
- [x] Confirmed Semi-Annual needs no separate test: `SemesterlyRecurrence.GenerateDueDates` uses the
      exact same "sorted pair, iterated in order" shape as `BiMonthlyRecurrence`, already proven safe.
- [x] Read all four backend recurrence generators (`BiMonthlyRecurrence`, `WeeklyRecurrence`,
      `SemesterlyRecurrence`, `CustomRecurrence`) to confirm each always emits chronologically ordered
      dates, and a same-row-count config change preserves that order — the precondition ordinal-index
      matching depends on.
- [x] Run `npx ng test --watch=false --browsers=ChromeHeadless` — 86/86 pass, no regressions.
- [x] Live-verify via Playwright: delete a row, change "Due on the day", confirm the row still shows
      deleted at its new date.

## Test Plan

- `carries a deleted row onto its new date by ordinal position when dueOnDay shifts every anchor`:
  delete `2026-09-01` (index 1 of 2), change `dueOnDay` to 15, flush a preview with `2026-09-15` at
  index 1 — asserts `deletedRowDates` no longer has `2026-09-01`, now has `2026-09-15`.
- `carries a deleted row by position, not by month, when a bi-monthly config shift adds a same-month
  sibling`: two rows in the same month (`2026-08-01`, `2026-08-15`), delete only the second (index 1),
  shift `dueOnDays` from `[1, 15]` to `[5, 20]` — asserts the deletion lands on the new index-1 row
  (`2026-08-20`), NOT on `2026-08-05` (which a month-based match would have wrongly caught too, since
  both new rows share August).
- Existing `keeps a deleted row deleted when a same-anchor re-preview fires (e.g. rent-only change)`
  continues to pass unmodified, proving index-based logic subsumes the old same-anchor case.
- Full suite: `npx ng test --watch=false --browsers=ChromeHeadless` → 84/84 passed.
- Live Playwright verification against the running dev server + API.
