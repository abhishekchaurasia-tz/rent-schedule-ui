**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v9

# Stop deciding cancelled-row status client-side; trust the preview API

After the v8 fix (extending ordinal-position remapping to server-confirmed cancelled rows) still left
the same visible bug reachable, the user gave a direct instruction: the decision of which row is
cancelled — and the totals that follow from it — belongs in the API, not the UI. *"mujhe UI pe iska
complexity nahi daalna, API ko decision lena padega ki kaun cancel hai kaun nahi, aur total invoices
aur total amount kitna hoga cancel aur edited rows ke according."*

This is the companion to `innago-rent-accounting` spec `01-rent-agreement.md` v46, which finishes
wiring a mechanism that already existed but was never fully used: `PreviewRentScheduleQuery.ExistingRows`
(built in spec v21 for `blocked`/`warnings`) now also drives a per-row `Cancelled`/`Planned` status and
status-aware totals — but only the backend ever consulted it. This plan is the client half: actually
send `existingRows` on every call, and delete the client-side decision logic entirely.

## Checklist

- [x] **Confirmed the backend change lands first** (spec v46) — `ExistingScheduleRowInput.Status` was
      already fully wired end-to-end on the wire (a background research agent confirmed this before any
      code changed), so this plan only had to start actually sending it and stop re-deciding what
      already gets echoed back.
- [x] **The irreducible client-side bookkeeping is not eliminated, only reduced.** The backend cannot
      know whether a "Cancelled" row was flagged because the user just clicked delete this session, or
      because it was already cancelled on the server before this session started — it never reads a
      database. That distinction determines Save payload shape (`isCancelled: true`-and-included vs.
      excluded-entirely) and can only live client-side. What moved to the backend is the actual decision
      ("does this fresh row still correspond to a cancelled one after the schedule recomputed"), not
      this identity bookkeeping.
- [x] **Tests that proved the deleted client-side algorithm worked per-frequency are removed, not
      rewritten to fake the same shape.** That correctness guarantee now belongs to, and is tested by,
      `PreviewRentScheduleEditFlowTests` in the backend repo — duplicating it client-side with mocked
      responses would just be testing that the test's own mock matches what it asserts.

Open questions: **none.**

## Technical Approach

### `buildExistingRows()` — new private helper

```ts
private buildExistingRows(): ExistingScheduleRowInput[] {
  const preview = this.previewResult();
  if (!preview) {
    return [];
  }

  return preview.rows.map((row) => ({
    scheduledDate: row.scheduledDate,
    dueDate: row.dueDate,
    rent: row.rent,
    isManualChanged: this.manuallyChangedRowDates().has(row.scheduledDate),
    status:
      this.deletedRowDates().has(row.scheduledDate) || this.cancelledRowDates().has(row.scheduledDate)
        ? 'Cancelled'
        : 'Planned',
    invoiceStatus: null,
    invoiceDueDate: null
  }));
}
```

Empty for the very first preview of a brand-new lease — nothing to correlate against yet, matching the
backend's own "no existing rows" case.

### `generatePreview()` — sends it, then only relabels

```ts
const existingRows = this.buildExistingRows();
// ... previewLoading/previewError/previewResult/saveResult reset, unchanged ...

this.rentScheduleService.preview({ ...formFields, existingRows: existingRows.length > 0 ? existingRows : undefined })
  .subscribe({
    next: (response) => {
      const sameRowCount = existingRows.length === response.rows.length;
      const newDeleted = new Set<string>();
      const newCancelled = new Set<string>();
      if (sameRowCount) {
        response.rows.forEach((row, index) => {
          if (!isCancelledStatus(row.status)) return;
          if (this.deletedRowDates().has(existingRows[index].scheduledDate)) {
            newDeleted.add(row.scheduledDate);
          } else {
            newCancelled.add(row.scheduledDate);
          }
        });
      }

      this.previewResult.set(response);       // trusted as-is — no client-side total recompute
      this.manuallyChangedRowDates.set(new Set());
      this.deletedRowDates.set(newDeleted);
      this.cancelledRowDates.set(newCancelled);
      // ... lastPreviewSignature/previewLoading/closeRowMenu, unchanged ...
    },
    ...
  });
```

Everything that used to compute `sameRowCount`/`deletedIndexes`/`cancelledIndexes` by scanning
`previousRows` for exact-date or ordinal-position matches is gone. `isCancelledStatus()` (the existing
case-insensitive helper, already used elsewhere for the same PascalCase-smart-enum wire convention) is
widened to accept a plain `string` in addition to `ScheduleRowStatus`, since the preview response's
`status` field isn't typed with that (slightly-too-narrow) union.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|------------------------|-----|
| 1 | When to send `existingRows` | On every preview call once any row exists (i.e. after the first), for both create and edit mode | Only for the edit-mode "term change against a saved agreement" case the backend originally built it for | The same correlation problem exists in create mode too (a pre-save deletion can be affected by the same due-day/frequency shift) — there is no reason to special-case one mode |
| 2 | How to redistribute a returned "Cancelled" row between `deletedRowDates` and `cancelledRowDates` | Zip the just-sent `existingRows[i]` against `response.rows[i]` by index | Have the backend also echo back which "kind" of cancellation it is | The distinction (this-session vs. already-on-server) is meaningless to the backend — it doesn't affect the reconcile at all, only the client's own Save-payload shape, so there's nothing for the backend to usefully echo |
| 3 | Test strategy | Keep tests that verify request-building (`existingRows` shape) and response-trusting (relabeling); delete tests that verified the removed algorithm across frequencies | Rewrite each old per-frequency test to mock a response and re-assert the same outcome | Those tests were proving the CLIENT's now-deleted algorithm was frequency-agnostic; that guarantee now belongs to the backend's own recurrence-generator tests, and duplicating it here would only test that a mock matches its own assertion |

## Data Model & Schema Changes

None — client-side model/request-shape change only; no persisted state.

## Task Checklist

- [x] Add `ExistingScheduleRowInput` interface and `existingRows` field on `PreviewRentScheduleRequest`
      in `rent-schedule.models.ts`; add optional `status` to `ScheduleRow`.
- [x] Add `buildExistingRows()` and rewrite `generatePreview()` in `rent-agreement-create.component.ts`.
- [x] Widen `isCancelledStatus()`'s parameter type to accept a plain `string`.
- [x] Rewrite `rent-agreement-create.component.spec.ts`: replaced the four per-frequency
      position-matching tests with `sends the deleted row flagged Cancelled in existingRows...`,
      `relabels a backend-derived "Cancelled" status onto deletedRowDates at its new date...`, and
      `clears deletedRowDates when the backend returns no "Cancelled" row at all...`.
- [x] Update `rent-agreement-edit.component.spec.ts`'s corresponding test to assert on the sent
      `existingRows` and trust a mocked backend-derived response, rather than asserting on client-side
      remapping.
- [x] Run `npx ng build` and `npx ng test --watch=false --browsers=ChromeHeadless` — build succeeds,
      85/85 tests pass.
- [ ] Live-verify via Playwright against the rebuilt backend (spec v46): the original reported scenario
      (delete a row, save, reload, shift due day) plus the new architecture's request/response shape.

## Test Plan

- `sends the deleted row flagged Cancelled in existingRows, on every preview call (spec v46)`: asserts
  the exact `existingRows` payload sent, and that a mocked backend response echoing `status: 'Cancelled'`
  is correctly kept in `deletedRowDates`.
- `relabels a backend-derived "Cancelled" status onto deletedRowDates at its new date, even when the
  anchor shifted (spec v46)`: a mocked response with a shifted date and `status: 'Cancelled'` — asserts
  the client trusts it at the new date without doing any position math itself.
- `clears deletedRowDates when the backend returns no "Cancelled" row at all (e.g. a row-count change)`:
  a mocked response where every row is `'Planned'` — asserts the client doesn't invent a carry-over.
- Edit mode: `trusts the backend-derived status for a server-confirmed cancelled row after dueOnDay
  shifts every anchor (spec v46)` — asserts the sent `existingRows` correctly flags the server-cancelled
  row, and that a mocked response is trusted for both `isRowCancelled` and the next Save's exclusion.
- Full suite: `npx ng test --watch=false --browsers=ChromeHeadless` → 85/85 passed.
- Live Playwright verification pending against the rebuilt backend.
