**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v1

# Render a cancelled schedule row instead of losing it

The backend (`innago-rent-accounting` spec `01-rent-agreement.md` v38) stopped soft-deleting a
cancelled schedule row, so `GET`/`PUT …/terms` now return it in `scheduleRows` with
`status: "cancelled"` instead of omitting it. The edit page must render this new possibility
sensibly instead of showing it as an ordinary editable row.

## Checklist

- [x] **Display-only, no restore action** (confirmed by user 2026-08-13) — matches the backend's
      own scope decision for v38; a restore flow is a separate, undecided piece of work.
- [x] **Must never be resubmitted.** Resubmitting a cancelled row's anchor on `PUT …/terms` does not
      restore it server-side — the backend's `ActiveRowsByAnchor` no longer treats it as a stored
      row at all, so the reconcile would create a **new** row on that anchor instead. The UI must
      treat "cancelled" the same way it already treats "user-deleted-this-session," for the purpose
      of what gets sent, even though the two have different origins (server-reported vs.
      client-session).

## Technical Approach

Mirror the existing `frozenRowDates` pattern with a new `cancelledRowDates` signal:

- Populated in `loadAgreement()` and in `saveEdit()`'s post-save re-seed, from
  `agreement.scheduleRows.filter(r => r.status === 'cancelled').map(r => r.scheduledDate)`.
- A new `isRowCancelled(scheduledDate)` getter, alongside the existing `isRowFrozen`.
- The schedule summary (`totalInvoices`/`totalAmount`) excludes cancelled rows in both
  `loadAgreement()` and `saveEdit()`'s success handler.
- `saveEdit()`'s outgoing `scheduleRows` filter gains `&& !this.cancelledRowDates().has(row.scheduledDate)`
  alongside the existing `!this.deletedRowDates().has(...)` check.
- Template: a new `@if` branch (before the existing deleted/editing branches) renders a cancelled
  row's cells read-only with a "cancelled" badge (reusing the `frozen-badge` CSS class) and no
  row-menu button.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | UI interaction with a visible cancelled row | Display-only (badge, no restore) | Display + restore action | Confirmed by user 2026-08-13. A restore would need the backend to define what "resubmitting a cancelled anchor" should do — undecided, out of scope here (see backend spec v38's own scoping) |

## Data Model & Schema Changes

**None.** This is presentation-layer state only — no persistence in this repo.

## Task Checklist

- [x] **1. `rent-agreement.models.ts`** — confirm `RentAgreementScheduleRowResponse.status`'s union
      type already includes `'cancelled'` (it did — no change needed) and add `isApplied` to
      `RentAgreementAdditionalChargeResponse` / `todayUtc` and `leaseTermType` to
      `RentAgreementDetailResponse` to match the backend's now-current contract (these three were
      stale from before v38/v37 and are fixed in the same pass).
- [x] **2. `rent-agreement-create.component.ts`** — add `cancelledRowDates` signal; populate it in
      `loadAgreement()` and `saveEdit()`'s success handler; add `isRowCancelled()`; exclude cancelled
      rows from the summary total in both places; add the exclusion to `saveEdit()`'s outgoing
      `scheduleRows` filter.
- [x] **3. `rent-agreement-create.component.html`** — new template branch for a cancelled row:
      read-only cells, "cancelled" badge, no row-menu button.
- [x] **4. `rent-agreement-create.component.scss`** — `.row-cancelled` class (greyed text, no
      strikethrough — distinct from `.row-deleted`, which represents a client-session action rather
      than a server-confirmed state).
- [x] **5. New test** — `rent-agreement-edit.component.spec.ts`: a loaded row with
      `status: 'cancelled'` is (a) still rendered (proves v38's `GET` change is consumed), (b) flagged
      by `isRowCancelled`, (c) excluded from the schedule summary total, and (d) excluded from the
      `PUT` request body's `scheduleRows` on save.
- [x] **6. Verify.** `tsc --noEmit` clean; edit-mode Angular test suite green.

## Test Plan

**New — `rent-agreement-edit.component.spec.ts`**: `renders a cancelled row from the server as
display-only and omits it from the save (spec v38)` — loads an agreement whose `scheduleRows`
includes one `status: 'cancelled'` row alongside the normal ones, asserts it still appears in
`previewResult()` (3 rows total), asserts `isRowCancelled()` is true for its date, asserts the
schedule summary's `totalInvoices` excludes it (2, not 3), then calls `save()` and asserts the
`PUT` request body's `scheduleRows` also excludes it (2, not 3).

**Commands and expected results:**

```bash
npx tsc --noEmit -p tsconfig.json
npx ng test --watch=false --include='**/rent-agreement-edit.component.spec.ts'  # 8/8 green
```

Spec verification: FR-4, FR-5, FR-6 (this document) are exercised end-to-end by the new test above.
