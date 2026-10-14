**Spec:** [`docs/specs/rent-agreements/04-invoice-list-ui.md`](../../specs/rent-agreements/04-invoice-list-ui.md) — v12

# Overdue is a flag, not a status — the invoice list

```
Before                                  After
Status chips: … Overdue …               Status chips: Not Received · Partially Paid · Fully Paid · Voided · Deleted
  ?status=overdue  → 400 since v45      Overdue: [Any | Overdue | Not overdue]  → ?isOverdue=true|false
Row: [Overdue] status badge             Row: [Not Received] [Overdue]   (badge when isOverdue)
```

Backend `02-invoicing.md` v45 (FR 52–53) removed the overdue-marking job. `status` never reads
`overdue`; rows and the detail carry `isOverdue`; `status=overdue` answers `400`. This harness still
offered the *Overdue* chip, so choosing it failed the search.

## 1. Setup & Environment

- Branch `abhishek/overdue-is-a-flag`, cut from `main` at `50dae05`.
- `npm test` (Karma, ChromeHeadless) and `npm run build`.
- Backend: `innago-billing` branch `abhishek/overdue-is-read-not-marked` (or `main` once merged).

### Prerequisites & Open Questions

None. The UI shape (a three-way select, a badge beside the status) is an implementation detail of a
test harness; product wording is not settled here.

## 2. Milestone-Based Implementation

### Milestone 1 — The wire models and the service (spec Contract)

- [x] Test first, `invoices.service.spec.ts`: `isOverdue: true` sends `isOverdue=true`; `false` sends
  `isOverdue=false`; absent sends nothing. The existing two-status test uses `not_received`.
- [x] Code, `invoice.models.ts`: `InvoiceStatus` loses `'overdue'`; `InvoiceSummaryResponse` and
  `InvoiceDetailResponse` gain `isOverdue?: boolean`; the detail loses `overdueMarkedOn`;
  `InvoiceSearchQuery` gains `isOverdue?: boolean`. `invoices.service.ts` sets the parameter when defined.

### Milestone 2 — The list (FR 3, FR 7, FR 29, FR 30)

- [x] Test first, `invoice-list.component.spec.ts`: the chips no longer include `overdue`; the
  Overdue select sends `isOverdue=true` / `false` / nothing, and resets to page 1; a row with
  `isOverdue: true` renders the badge and one with `false` does not. Fixtures that used
  `status: 'overdue'` become `not_received` with `isOverdue: true`.
- [x] Code: `statusOptions` and `StatusPresentations` lose `overdue`; a form control `overdue`
  (`'any' | 'yes' | 'no'`), mapped in `buildQuery`; the badge in the status cell, reusing the existing
  red badge style.

### Milestone 3 — Other fixtures

- [x] `late-fee-panel.component.spec.ts` and `update-proposed-invoice.component.spec.ts` stop using
  `'overdue'` / `overdueMarkedOn`.
- [x] `docs/ui-automation-test-matrix.md`: the invoice list rows for FR 29 and FR 30.

### As built (2026-10-14)

- `paidRow` in `invoice-list.component.spec.ts` spreads `overdueRow`, so it now sets `isOverdue: false`
  explicitly; a settled row is never overdue.
- The Overdue `<select>` takes the existing `.filter > input` border style (`> select` added to the rule).
- `npm run build` warns that `invoice-list.component.scss` is over its 6 kB budget (7.18 kB). That was
  already the case before this change, which adds two lines.
- 815 specs pass.

## 3. Scope & Context Rules

- **May change:** the files named above.
- **Must not change:** any other screen; the `processing` status gap (the harness does not list it as a
  chip) is pre-existing and out of scope.

### Technical Decisions

| # | Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- | --- |
| 1 | Overdue filter control | Three-way select | Checkbox | `isOverdue=false` is a filter, not "no filter" (backend FR 53) |
| 2 | Showing overdue on a row | Badge beside the status | Replacing the status label | The status is still meaningful (`not_received` vs `partial_paid`) |
| 3 | `isOverdue` optional in the models | Optional | Required | Same as `paidOn`: an older API answers without it |

## 4. Verification

`npm test` green and `npm run build` clean after each milestone.

## 5. Git & Rollback

Ask before every commit. One commit for spec + plan, one for the code. Rollback: revert the code commit.

## 6. Final Validation

- [x] Spec 04 v12's changelog row links this plan, and this plan's first line names v12.
- [x] No `'overdue'` status token and no `overdueMarkedOn` left in `src/`.
- [x] `npm test` green; `npm run build` clean.
