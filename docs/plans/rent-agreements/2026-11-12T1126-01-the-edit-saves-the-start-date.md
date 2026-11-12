**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v28
**Author:** Abhishek Chaurasia · **Created:** 2026-11-12 · **Last updated:** 2026-11-12 by Abhishek Chaurasia

# Edit Lease saves the start date

Delivers **requirement 18**, following Billing `01-rent-agreement.md` v183 (FR-185), which accepts `startDate` on
`PUT …/terms`. Today Edit Lease lets the Start Date field change, previews with it, and leaves it out of the save
(`saveEdit` in `rent-agreement-create.component.ts`, citing Billing's decision D3), so the new start is never stored.

## 1. Setup & Environment

- **Repository:** `rent-schedule-ui`, on a branch cut with `--no-track` from `main` (`c074976`). The dev server runs on
  4300 against the user's Billing API on 5169.
- **Depends on** Billing FR-185 being deployed where the screen is tested; against a Billing without it, a save that
  carries `startDate` answers `422 rent_agreement.immutable_term_field`.

### Prerequisites & Open Questions

None. Decided by the user on 2026-11-11/12 in Billing's FR-185 (the owner may move the start anywhere; the owner picks
the first due date) and here (the screen sends the start, so FR-185 can be tested from it).

### Depth scan

| Site | Today | After |
|---|---|---|
| `saveEdit` (`rent-agreement-create.component.ts:1506`) | builds `UpdateRentAgreementTermsRequest` without `startDate`; the doc comment at `:1481` cites D3 | sends `startDate: toIsoDate(value.startDate)`; the comment says the start is sent |
| `UpdateRentAgreementTermsRequest` (`rent-agreement.models.ts`) | no `startDate` | `startDate: string` |
| First-date options request (`:1710`, `:1723`) | built from the form's start | unchanged; check that a start change reloads the options and requirement 17's keep/clear rule applies |
| Preview request (`:1095`) | built from the form's start | unchanged |
| `blockedRemovals` (requirement 10) and the save's error display | shown | unchanged; rows kept before a later start appear there |

## 2. Milestone-Based Implementation

### Milestone 1 — The save carries the start (requirement 18a)

Red first, in `rent-agreement-create.component.spec.ts`: an edit save sends `startDate` equal to the form's start, and a
changed start is what is sent. Then add the field to the model and to `saveEdit`, and rewrite the doc comment.

### Milestone 2 — The first date follows the new start (requirement 18b)

Red first: on an edit page with `isFirstRentalDueDateEditable: true`, changing the start reloads the options and clears
a first date they do not offer; with `false`, the stored first date stays. Change the start's subscription only if
the tests show it does not already do this.

### Milestone 3 — Checked on screen

Against the Billing branch with FR-185: move a lease's start later (the rows before it leave; an overdue one is listed
as kept) and earlier (no month before today appears), with screenshots of each step.

## 3. Scope & Context Rules

- Only Edit Lease's terms save and its first-date options. The create screen and every other screen are unchanged.
- No wording decisions: this application is a test harness for the Billing API.

### Technical Decisions

| # | Decision | Chosen | Rejected | Source |
|---|---|---|---|---|
| 1 | When to send `startDate` | On every edit save | Only when changed (Billing keeps the stored start either way) | Simplest; Billing FR-185b |

## 4. Verification

`npm test` for the touched spec files, then the full suite; `ng build`. Do not continue on a failure.

## 5. Git & Rollback

One commit per milestone when the user asks. A revert is the rollback.

## 6. Final Validation

- [x] Requirement 18 a–e covered by tests or the on-screen check. Tests (`rent-agreement-create.component.spec.ts`):
  `Req18a_AnEditSave_SendsTheStartTheFormHolds`, `Req18_MovingTheStartOnAnEdit_KeepsTheStoredEnd`, and
  `Req18b_…_ClearsIt` / `…_KeepsTheFixedOne`. Full suite 927 pass. On screen on 2026-11-12, against Billing's FR-185
  build (`6a67a4aa`):
  - a later start (Nov 12, 2026 → Jan 15, 2027) on an active lease saved with the end unchanged; the open first due
    date was cleared and Feb 1 picked; the overdue invoice came back in `blockedRemovals` and stayed; the Jan 1 rent
    and Dec 15 Parking invoices were deleted; Parking moved to Jan 15; the lease reads `FUTURE`;
  - an earlier start (Dec 1 → Sep 1, 2026) saved and raised no invoice before today; the first-date options begin at
    today;
  - a start moved onto another lease on the unit showed Billing's `409 rent_agreement.overlapping_lease_exists`
    message and saved nothing.
- [x] Spec ↔ code: the request shape in *Contract* matches `rent-agreement.models.ts`.
- [x] Links resolve both ways.

Found on screen, not changed here: the edit preview's `existingRows` come from the previous preview with
`invoiceStatus: null`, so the preview's `blocked` list stays empty on every edit; the save's `blockedRemovals` reports
the kept rows (requirement 10).
