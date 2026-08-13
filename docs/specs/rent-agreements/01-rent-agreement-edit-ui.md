## Changelog

| Version | Date | Summary | Plan |
|---------|------|---------|------|
| v3 | 2026-08-13 | **Reverses v2 entirely** — the backend replaced its anchor cross-check + `excludedScheduleDates` with an explicit per-row `isCancelled` flag (`innago-rent-accounting` spec `01-rent-agreement.md` v41), confirmed by the user to be simpler. `save()` now sends **every** previewed row (deletion no longer filters `scheduleRows`), each tagged `isCancelled: this.deletedRowDates().has(row.scheduledDate)`; `excludedScheduleDates` is removed from the request model entirely. **Also fixes a real, separate bug found in the same pass**: the backend's `ScheduleStatus` is a smart enum deliberately serialized PascalCase (`"Cancelled"`, `"Planned"`), not passed through the lowercase enum-value convention the rest of the wire uses — every `status === 'cancelled'` comparison added in v1 was comparing against the wrong case and had **never matched anything** since v1 shipped, so the cancelled-row badge/exclusion logic was silently inert the whole time. Fixed with a case-insensitive `isCancelledStatus()` helper. | [2026-08-13T1900-01-rent-agreement-edit-ui-schedule-row-cancel-flag](../../plans/rent-agreements/2026-08-13T1900-01-rent-agreement-edit-ui-schedule-row-cancel-flag.md) |
| v2 | 2026-08-13 | *(Reverted in full by v3 — kept for history.)* **The create-page ("Add Lease") row-delete action now tells the backend which rows it deliberately removed, instead of just omitting them.** `save()` sends the new `excludedScheduleDates` field (the `scheduledDate`s already tracked in `deletedRowDates`) alongside the unchanged, already-filtered `scheduleRows` — the backend's `POST /rent-agreements` gained a fixed-term schedule-anchor cross-check the same day (`innago-rent-accounting` spec `01-rent-agreement.md` v39) that could not otherwise tell a deliberate pre-save deletion apart from a client bug that silently dropped a row, and rejected both identically. | [2026-08-13T1800-01-rent-agreement-edit-ui-schedule-anchor-exclusions](../../plans/rent-agreements/2026-08-13T1800-01-rent-agreement-edit-ui-schedule-anchor-exclusions.md) |
| v1 | 2026-08-13 | **The edit page now renders a cancelled schedule row instead of it silently vanishing.** `GET`/`PUT …/terms` (backend spec `01-rent-agreement.md` v38) stopped soft-deleting a cancelled row, so it now arrives in `scheduleRows` with `status: "cancelled"`. The edit form tracks `cancelledRowDates` (mirroring the existing `frozenRowDates` pattern), renders such a row greyed out with a "cancelled" badge and no row-menu (display-only — no restore action), excludes its rent from the schedule summary total, and — critically — excludes it from what gets resubmitted on save: resubmitting a cancelled row's anchor would create a **new** row server-side rather than restore the old one. | [2026-08-13T1400-01-rent-agreement-edit-ui-cancelled-rows](../../plans/rent-agreements/2026-08-13T1400-01-rent-agreement-edit-ui-cancelled-rows.md) |

## Overview

`RentAgreementCreateComponent` (`src/app/rent-agreements/rent-agreement-create.component.ts`)
is the single Angular component behind both the "Add Lease" (create) and "Edit Lease" (edit) pages
— reached via `/rent-agreements/create` and `/rent-agreements/:id/edit` respectively. It drives a
rent-schedule preview, lets the user hand-edit or delete individual rows before saving, and posts
to the `innago-rent-accounting` Billing API's `POST /rent-agreements` (create) or
`PUT /rent-agreements/{id}/terms` (edit) endpoints.

This spec covers the UI's own behaviour and its wire contract with that backend — the backend's
own behaviour (reconcile rules, soft-cancel semantics, validation) is specified separately in the
`innago-rent-accounting` repo's `docs/specs/01-rent-agreement.md`, which this document cross-links
rather than duplicates.

## Business Scope

A property manager builds or edits a lease's rent schedule interactively: the schedule
auto-generates from the lease terms (dates, frequency, rent), and the manager can hand-adjust an
individual row's rent/due-date, delete a row entirely (e.g. skip a specific month), or — on the
edit page — see which rows the server has already frozen (billed) or cancelled. The UI must give
an honest, real-time picture of what will actually be saved, and must not silently lose or
resurrect a row the user acted on.

## Functional Requirements

1. The system shall auto-generate a schedule preview whenever the form holds enough information to
   do so, with no manual "Generate" button.
2. The system shall let the user delete an individual previewed row before saving; a deleted row is
   excluded from the saved schedule.
3. The system shall let the user hand-edit an individual row's rent and/or due date before saving.
4. On the edit page, the system shall render a row the server reports as frozen (`isFrozen`) as
   locked — no edit or delete affordance — and a row the server reports as cancelled
   (`status: "cancelled"`) as display-only with a "cancelled" badge and no row-menu at all.
5. On the edit page, a cancelled row's rent shall not be included in the schedule summary's total
   invoice count or total amount.
6. On the edit page, a cancelled row shall never be resubmitted in `PUT …/terms`'s `scheduleRows` —
   the backend does not treat a resubmitted cancelled anchor as a restore request.
7. On the create page, a row the user deleted before saving shall still be submitted in
   `POST /rent-agreements`'s `scheduleRows`, tagged `isCancelled: true`, so the backend persists it
   directly with a cancelled status instead of treating it as a dropped row (v41).
8. The system shall not lose a user's row deletion when an unrelated field change (e.g. the rent
   amount) triggers a fresh auto-preview: a deletion survives whenever the newly generated preview's
   row dates are unchanged from the previous preview's.
9. Every comparison against a row's `status` field shall be case-insensitive — the backend's
   `ScheduleStatus` is a smart enum that is deliberately **not** lowercased on the wire (unlike
   `leaseTermType`/`frequency`), so it arrives as `"Planned"`/`"Cancelled"`, not `"planned"`/
   `"cancelled"` (v3).

## Constraints

- The preview endpoint (`POST /rent-schedule/preview`) is stateless — it never receives back a
  prior preview's deletions or hand-edits, so every preview response is authoritative for row dates
  and amounts, and the component must reconcile its own client-side deletion/edit state against it
  rather than trusting the response to already reflect them.
- No separate "cancel"/"restore" endpoint exists for either the create or the edit flow. The create
  flow expresses a pre-save deletion via the row's own `isCancelled` flag (v41); the edit flow's
  `PUT …/terms` expresses removal by simple omission, per that endpoint's own
  absence-means-removal contract (D8/FR-031) — the two are deliberately different mechanisms.

## Contract

### Component state (relevant signals)

| Signal | Type | Meaning |
|--------|------|---------|
| `deletedRowDates` | `Set<string>` | `scheduledDate`s the user deleted this session (create or edit), before saving |
| `frozenRowDates` | `Set<string>` (edit only) | `scheduledDate`s the server reports as frozen (`isFrozen`) |
| `cancelledRowDates` | `Set<string>` (edit only) | `scheduledDate`s the server reports as already cancelled (`status`, compared case-insensitively) |
| `manuallyChangedRowDates` | `Set<string>` | `scheduledDate`s whose rent was hand-edited this session |

### Outbound request shapes (see `rent-agreement.models.ts`)

`ScheduleRowCreationRequest.isCancelled?: boolean` — set from `deletedRowDates` at save time
(v41). The row is always submitted; this flag, not the row's presence, is how a create-time
deletion reaches the backend.

`RentAgreementScheduleRowResponse.status?: 'planned' | 'invoiced' | 'skipped' | 'cancelled'` —
present on the create response and on `GET`/`PUT …/terms`'s echoed rows, but compared
case-insensitively client-side (`isCancelledStatus()`, v3) since the wire value is actually
PascalCase (`"Planned"`, `"Cancelled"`).

## Out of Scope

- The backend's soft-cancel semantics and the `PUT …/terms` reconcile matrix — specified in
  `innago-rent-accounting`'s `docs/specs/01-rent-agreement.md` (v38).
- A restore action for an already-cancelled row on the edit page (display-only for now — see the
  v1 plan's Technical Decisions).
- Extending the `isCancelled`-flag mechanism to `PUT …/terms` — that endpoint already expresses
  removal by omission and was not changed by v41.
