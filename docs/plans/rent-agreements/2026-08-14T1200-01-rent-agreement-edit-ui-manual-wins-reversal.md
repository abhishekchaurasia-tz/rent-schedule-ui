**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v5

# Stop preserving a hand-edited row's rent across a re-preview

The user explicitly reversed the "manual wins" behaviour this component relied on (mirroring the
backend's own spec v21 decisions D4/D12, now reversed by `innago-rent-accounting` spec
`01-rent-agreement.md` v44). Confirmed 2026-08-14: any schedule-affecting change — most commonly a
plain rent-amount edit — should now update every row's amount, hand-edited or not, and the
manually-changed flag should reset rather than persist. The user's own reasoning: resetting a row's
tracked amount on any schedule change means a later restore or edit always starts from the correct,
currently-accurate value instead of a stale one.

No backend contract change on this component's side — it still sends `isManualChanged` per the
`manuallyChangedRowDates` set as of Save time; the backend (v44) now treats that as a live signal
rather than a permanent grant.

## Checklist

- [x] **Deleted rows needed no change.** `deleteRow()`'s tracking (`deletedRowDates`) only ever
      recorded a row's *identity* as removed; `generatePreview()`'s only special-case value override was
      for manually-changed rows. A deleted row was already taking the fresh preview's rent value —
      confirmed by re-reading the existing `keeps a deleted row deleted when a same-anchor re-preview
      fires` test, which already asserts `rent: 250` (the fresh value) for the deleted row.
- [x] **Cancelled rows (edit mode) needed no change for the same reason** — `cancelledRowDates` is a
      separate identity-tracking set from `manuallyChangedRowDates`, and a cancelled row's rent was
      never specially preserved either.

Open questions: **none.**

## Technical Approach

`generatePreview()`'s success handler used to branch on whether the freshly recomputed anchors matched
the previous set (`sameAnchors`), and only in that case, re-apply each manually-changed row's
*previous* rent over the fresh value:

```ts
const rows = sameAnchors
  ? response.rows.map((row) => {
      const previous = previousRows.find((r) => r.scheduledDate === row.scheduledDate);
      return manuallyChanged.has(row.scheduledDate) && previous ? { ...row, rent: previous.rent } : row;
    })
  : response.rows;
```

That override is deleted — `previewResult()` is now set directly from `response.rows` unconditionally
— and `manuallyChangedRowDates` is now cleared on **every** successful response, not only the
`!sameAnchors` branch:

```ts
this.previewResult.set({
  ...response,
  totalAmount: response.rows.reduce((sum, row) => sum + row.rent, 0)
});
this.lastPreviewSignature = this.scheduleSignature();
this.previewLoading.set(false);
this.manuallyChangedRowDates.set(new Set());
if (!sameAnchors) {
  this.deletedRowDates.set(new Set());
}
this.closeRowMenu();
```

`deletedRowDates` keeps its existing `sameAnchors`-gated preservation (v1's fix) — that behaviour is
about a row's *deleted* classification surviving an unrelated re-preview, which the user did not ask
to change; only the manually-protected *rent* override was reversed.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|------------------------|-----|
| 1 | Where to clear `manuallyChangedRowDates` | Unconditionally, on every successful preview response | Only in the `!sameAnchors` branch (previous behaviour) | The trigger for the reversal is explicitly "any schedule change", and a `sameAnchors` re-preview is exactly the common case (a rent-amount-only edit) the user called out by name |
| 2 | `deletedRowDates` handling | Left unchanged | Also clear unconditionally, for symmetry | The user's ask was specifically about the manual-edit protection; deleted-row identity persistence (v1) was not reported as broken and the existing test suite already covers it working correctly |

## Data Model & Schema Changes

None — client-side signal/tracking change only, no request/response shape change.

## Task Checklist

- [x] Rewrite `generatePreview()`'s success handler in
      `src/app/rent-agreements/rent-agreement-create.component.ts` to drop the manually-changed rent
      override and clear `manuallyChangedRowDates` unconditionally.
- [x] Invert `preserves a hand-edited rent and its flag when a same-anchor re-preview fires` to
      `resets a hand-edited rent and its flag when a same-anchor re-preview fires` in
      `rent-agreement-create.component.spec.ts`.
- [x] Run `npx ng test --watch=false --browsers=ChromeHeadless` — 82/82 pass, no other regressions.

## Test Plan

- `resets a hand-edited rent and its flag when a same-anchor re-preview fires`: a row hand-edited to
  rent 80, followed by an unrelated rent-amount change that re-previews with identical anchors —
  asserts `isRowManuallyChanged` is now `false` and the row's rent is the fresh preview value (300),
  not the previously hand-set 80.
- Existing `keeps a deleted row deleted when a same-anchor re-preview fires` continues to pass
  unmodified, confirming the deleted-row identity behaviour is untouched.
- Full suite: `npx ng test --watch=false --browsers=ChromeHeadless` → 82/82 passed.
