**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v12

# Follow the server's `isDepositEditable` instead of locking the deposit outright

Companion to `innago-rent-accounting` spec `01-rent-agreement.md` v48, which made the deposit
conditionally editable (`PUT …/terms` accepts it while the lease is an unactivated draft) and added an
`isDepositEditable` flag to `GET`/`PUT`. v11 here had disabled the fields for *all* edit-mode sessions,
which was correct only while the deposit was permanently immutable.

## Checklist

- [x] **Never decide editability client-side.** `isDepositEditable` is a getter returning the server's
      flag in edit mode (and `true` in create mode), so the UI's enabled state and the endpoint's `409`
      cannot disagree — the same principle applied to cancelled rows in v10.
- [x] **Start locked, then unlock.** `setDepositFieldsEnabled(false)` runs in the constructor and only the
      load's answer can enable the fields, so they are never briefly editable before the server responds,
      and remain locked if the load errors.
- [x] **Re-sync from the PUT response too** — it carries a freshly computed flag, so a lease activated
      between load and save locks the fields without needing a page reload.
- [x] **The validation guard changes predicate, not purpose.** `save()`'s two deposit rules were guarded by
      `!isEditMode` in v11; they are now guarded by `isDepositEditable`. Still load-bearing rather than
      cosmetic: disabled controls are omitted from `form.value`, so with the deposit locked the pairing rule
      would read `undefined` on both fields, misfire, and block **every** save (the trap v11 documented).
- [x] **`emitEvent: false` on both enable and disable** — an enabled-state change must not enter the
      debounced `valueChanges` → auto-preview pipeline.

Open questions: **none.**

## Technical Approach

```ts
get isDepositEditable(): boolean {
  return this.isEditMode ? this.loadedAgreement()?.isDepositEditable === true : true;
}

private setDepositFieldsEnabled(enabled: boolean): void {
  for (const name of ['deposit', 'depositDueDate', 'depositCollected']) {
    const control = this.form.get(name)!;
    if (enabled) { control.enable({ emitEvent: false }); } else { control.disable({ emitEvent: false }); }
  }
}
```

Call sites: constructor (`false`), `loadAgreement()`'s success handler (`agreement.isDepositEditable`,
before `patchValue` so the controls are in their final state when values land), and `saveEdit()`'s
success handler (same flag off the `PUT` response).

`saveEdit()` conditionally spreads the fields:

```ts
...(this.isDepositEditable
  ? {
      deposit: value.deposit !== null && value.deposit !== '' ? Number(value.deposit) : null,
      depositDueDate: toIsoDate(value.depositDueDate),
      depositCollected: Boolean(value.depositCollected)
    }
  : {}),
```

`UpdateRentAgreementTermsRequest` gains the three optional fields; `RentAgreementDetailResponse` gains
`isDepositEditable: boolean`. The template's lock note and empty-deposit substitution are gated on
`isEditMode && !isDepositEditable`.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Source of the editability decision | The server's `isDepositEditable` | Re-derive from `status` + an activation flag client-side | Duplicated logic drifts; the client would eventually disagree with the endpoint's 409 |
| 2 | Initial state before the load answers | Locked | Editable, then lock on load | An editable field that locks a moment later invites a change that is then discarded |
| 3 | Sending the deposit when locked | Omit entirely | Send it and let the backend 409 | Omission is exactly what leaves the stored deposit untouched (backend v48); sending it would fail the whole edit, including the schedule changes the user did make |
| 4 | Validation guard predicate | `isDepositEditable` | Keep `!isEditMode` | With deposit now editable in edit mode, `!isEditMode` would skip rules that must run there |

## Data Model & Schema Changes

None — client-side; two TS interfaces gain fields mirroring the backend contract.

## Task Checklist

- [x] `rent-agreement.models.ts`: `isDepositEditable` on `RentAgreementDetailResponse`; the three optional
      deposit fields on `UpdateRentAgreementTermsRequest`.
- [x] `setDepositFieldsEnabled()` helper; `isDepositEditable` getter; three call sites.
- [x] `saveEdit()` conditionally sends the deposit; `save()`'s guard switched to `isDepositEditable`.
- [x] Template: lock note reworded and gated on `!isDepositEditable`; empty-deposit branch likewise.
- [x] Tests: renamed the v11 lock test and added an editable-deposit test plus a re-lock-on-save-response
      test; the shared fixture defaults `isDepositEditable: false` so existing tests keep covering the
      locked path.
- [x] `npx ng build` clean; `npx ng test` 89/89 pass.
- [x] Live-verified end to end (see Test Plan).

## Test Plan

- `locks the deposit when the server reports isDepositEditable: false, and still saves (spec v12)`: all
  three controls disabled, values still readable via `getRawValue()`, `save()` produces no `saveError`
  (the disabled-control trap), and the PUT body has no `deposit` key.
- `allows editing the deposit and sends it when the server reports isDepositEditable: true (spec v12)`:
  controls enabled, 500 → 900 change lands in the PUT body alongside `depositDueDate`/`depositCollected`.
- `re-locks the deposit when the save response reports it is no longer editable (spec v12)`: loaded
  editable, save responds with `isDepositEditable: false`, controls become disabled.
- Full suite: `npx ng test --watch=false --browsers=ChromeHeadless` → 89/89.
- **Live Playwright**, one lease through its whole life:
  - Draft: `GET isDepositEditable: true`; UI amount `500`, `disabled: false`, no lock note; changed to 900,
    `PUT` carried `{deposit: 900, depositDueDate: "2026-08-05", depositCollected: false}` → `200`;
    `GET` confirmed `deposit: 900` persisted.
  - After `POST …/activate` (200): `GET isDepositEditable: false`; UI shows `900`, `disabled: true`, lock
    note rendered.
  - Forced `PUT` **with** deposit on the activated lease → `409` with
    `rent_agreement.deposit_not_editable`; the same `PUT` **without** deposit → `200`, and `GET` confirmed
    the stored deposit stayed `900` (the untouched-on-omission guarantee).
