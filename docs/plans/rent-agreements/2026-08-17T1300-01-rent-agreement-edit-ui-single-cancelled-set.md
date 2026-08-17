**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v10

# One API-driven cancelled set; no cancellation logic left in the component

The user reported the same defect twice more after v9, and restated the requirement plainly:

> *"when i change the end date then preview api reset my value. showing deleted row is schedule way"*
> *"mai phir se bol raha mujhe UI pe logic nhi chahiye, preview api batayega kon sa row deleted hai"*
> *"edit ke case me … jub preview ki api response de raha tab usme delete ka koi flag nhi hai"*

v9 had moved the *decision* to the API but kept two client sets (`deletedRowDates` for this session's
deletes, `cancelledRowDates` for server-confirmed ones) plus attribution logic to sort a returned
"Cancelled" row into one of them — and a `sameRowCount` gate wrapped around that logic, which discarded
the backend's correct answer on any `endDate` change. So the client was still deciding, and still wrong.

## Checklist

- [x] **Live-reproduced before changing anything**: a Playwright run showed the preview response carrying
      `{"d":"2026-09-01","s":"Cancelled"}` while the UI rendered that row as ordinary — proof the backend
      was right and the client was throwing the answer away.
- [x] **The two sets could only be collapsed after a backend change.** They existed because `PUT …/terms`
      restored *any* resubmitted cancelled row, so a server-cancelled row had to be omitted while a
      freshly-cancelled one had to be flagged. Backend spec v47 makes the `isCancelled` flag decisive, so
      both cases are now sent identically and the distinction has no consumer. Collapsing them without
      that change would have silently restored server-cancelled rows on every save.
- [x] **Restore still works**: `restoreRow()` removes the row from the single set, so it goes up with
      `isCancelled: false`, which is exactly what the backend now treats as the restore signal (v42/v47).
- [x] **Create mode unaffected in shape**: `save()` already sent every row flagged; it now reads the one
      set instead of the removed one.

Open questions: **none.**

## Technical Approach

`generatePreview()`'s success handler, in full — this is the entire cancellation handling that remains:

```ts
this.previewResult.set(response);
this.lastPreviewSignature = this.scheduleSignature();
this.previewLoading.set(false);
this.manuallyChangedRowDates.set(new Set());
this.cancelledRowDates.set(
  new Set(
    response.rows
      .filter((row) => RentAgreementCreateComponent.isCancelledStatus(row.status))
      .map((row) => row.scheduledDate)
  )
);
this.closeRowMenu();
```

`buildExistingRows()` (v9) still reports the client's current known state on every call so the backend has
something to correlate against — that is *input to* the decision, not the decision.

Both save paths send every row, unfiltered:

```ts
scheduleRows: preview.rows.map((row) => ({
  scheduledDate: row.scheduledDate,
  dueDate: row.dueDate,
  rent: row.rent,
  isManualChanged: this.manuallyChangedRowDates().has(row.scheduledDate),
  isCancelled: this.cancelledRowDates().has(row.scheduledDate)
})),
```

`deleteRow()` adds to `cancelledRowDates`; `restoreRow()` removes from it; `restoreCancelledRow()` is a
one-line alias retained for the template. `loadAgreement()`/`saveEdit()`'s response handlers keep seeding
`cancelledRowDates` from the server's row `status` and no longer reset a second set.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|------------------------|-----|
| 1 | Number of tracking sets | One (`cancelledRowDates`) | Keep two, fix only the `sameRowCount` gate | Two sets *require* attribution logic, which is the "logic in the UI" the user rejected; one set needs none |
| 2 | Where the set's value comes from | The API's per-row `status` on every preview response | Keep a client-side merge of previous state and response | Any merge is correlation logic, i.e. the thing being removed |
| 3 | Save payload | Every row, flagged | Keep omitting cancelled rows in edit mode | Omission only existed to dodge the old restore rule; with the flag decisive (backend v47) it is unnecessary, and sending everything keeps one uniform code path for both modes |
| 4 | `restoreCancelledRow()` | Kept as an alias for `restoreRow()` | Delete it and update the template | Zero behavioural difference now; keeping the name avoids churn in the template and existing tests for no benefit |

## Data Model & Schema Changes

None — client-side state only.

## Task Checklist

- [x] Delete the `deletedRowDates` signal and every reference (`generatePreview`, `buildExistingRows`,
      `save`, `saveEdit`, `loadAgreement`, `saveEdit`'s response handler).
- [x] Reduce `generatePreview()`'s handler to reading `response.rows[i].status`.
- [x] Point `deleteRow()`/`restoreRow()` at `cancelledRowDates`; make `restoreCancelledRow()` an alias.
- [x] Send every row flagged from both save paths (remove `saveEdit()`'s filter).
- [x] Remove the `row-deleted` class binding and the `@else if (deletedRowDates()…)` template branch.
- [x] Rename the affected assertions in `rent-agreement-create.component.spec.ts`; update the two
      edit-mode tests that asserted cancelled rows are omitted from the save.
- [x] `npx ng build` clean; `npx ng test` 86/86 pass.
- [x] Live-verified via Playwright (see Test Plan).

## Test Plan

- `keeps a deleted row deleted when an endDate change drops the row count (spec v47)`: existingRows (2) vs
  response.rows (1) — asserts the client does not gate on equal counts and keeps the cancellation.
- `renders a cancelled row from the server and sends it flagged isCancelled rather than omitting it
  (spec v47)`: asserts all 3 rows are sent and the cancelled one carries `isCancelled: true`.
- `trusts the backend-derived status for a server-confirmed cancelled row after dueOnDay shifts every
  anchor (spec v46)`: asserts the sent `existingRows` flags the row and the response's status is trusted.
- Full suite: `npx ng test --watch=false --browsers=ChromeHeadless` → 86/86.
- **Live Playwright** (create → cancel row → save → reload → change end date → change rent → save):
  the `CANCELLED ↺` badge survived both changes, API totals were `inv: 3, amt: 750`, the save sent
  `{"d":"2026-09-01","c":true}`, and the response confirmed the row still `Cancelled`.
