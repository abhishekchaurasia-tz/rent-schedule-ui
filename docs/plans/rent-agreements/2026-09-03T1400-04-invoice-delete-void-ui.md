**Spec:** [`docs/specs/rent-agreements/04-invoice-list-ui.md`](../../specs/rent-agreements/04-invoice-list-ui.md) — v5

## Checklist

- [x] Backend already implements both endpoints (`DELETE /api/v1/invoices/{id}`,
      `POST /api/v1/invoices/{id}/void`) — confirmed against
      `src/Innago.Billing.Api/Controllers/V1/InvoiceController.cs` in the sibling
      `innago-rent-accounting` repo. No backend change needed.
- [x] Confirmed by grep that no `deleteInvoice`/`voidInvoice`/`DeleteInvoice` affordance exists anywhere
      in this app today.
- [x] Interaction pattern to reuse: `RentAgreementLifecycleComponent`'s confirm-before-irreversible-action
      shape (a `pendingAction` gate, a `working` guard against double-submit, `describeError` rendering
      the backend's RFC 9457 `detail` verbatim, and treating an idempotent repeat as a success). The
      per-row kebab-menu pattern in `rent-agreement-create.component.ts` was considered and rejected —
      see Technical Decisions.
- [x] No open questions — the confirmation wording, the gating rule, and the post-success refresh
      strategy all follow directly from the backend contract and this app's existing idioms; nothing here
      needed a user decision.

## Technical Approach

`InvoiceListComponent` already renders one `<td>` of row actions (today, just the "Correct" link) inside
`invoice-list.component.html`'s `@for (invoice of rows; …)` loop. Delete and Void are added to that same
cell rather than as a new column or a kebab menu, because:

- The table already has ten columns and a table-scroll wrapper; a kebab menu (as used in
  `rent-agreement-create.component.ts`, which needs `position: fixed` coordinates computed from the
  clicked button's `getBoundingClientRect()` to escape the table's own overflow clipping) is
  meaningfully more machinery than two more inline actions need.
- A destructive action needing a positioned floating menu makes sense when a row has *many* candidate
  actions (that component's kebab opens a menu with several entries). Here there are exactly two, both
  already single clicks away as text links next to "Correct" — no menu needed to organize them.

**State shape.** Four new signals on `InvoiceListComponent`:

- `pendingRowAction: signal<{ invoiceId: string; action: 'delete' | 'void' } | null>` — which row's
  confirmation is open.
- `workingInvoiceId: signal<string | null>` — which row's request is in flight; disables that row's
  confirm/cancel buttons only (other rows stay interactive, unlike the lifecycle component's single
  `working` flag, because a list can have many rows a user might act on independently — though this plan
  only guards double-submission on the *same* row, which is the risk that actually exists since
  `beginRowAction` on a different row simply reassigns `pendingRowAction`).
- `actionError: signal<{ invoiceId: string; message: string } | null>` — the last failure, scoped to its
  row so a stale error from a different row does not linger.
- `actionSuccess: signal<string | null>` — one-line banner text ("Invoice INV-… was deleted/voided.")
  above the table, mirroring the existing `chargeSuccess` banner's placement and styling.

**Methods added to `InvoiceListComponent`:** `canManageInvoice(invoice)` (gates the actions out once
`status` is `voided` or `deleted`), `isRowWorking(invoice)`, `beginRowAction(invoice, action)`,
`cancelRowAction()`, `confirmRowAction(invoice)`.

**Why refresh instead of patching the row locally.** The backend's own contract already tells the UI
exactly what a fresh `GET /api/v1/invoices` will show after either verb: a deleted invoice drops out of
the list unless "Include deleted" is checked; a voided one is always returned and now reports `voided`.
Re-running `this.refresh()` (the same method the existing "Refresh Now" link calls) gets both cases right
for free — patching the row's `status` in place would have to hand-encode that same visibility rule
(when does a row disappear vs. relabel) and could silently drift from the backend's actual behavior the
next time either rule changes server-side.

**Methods added to `InvoicesService`:** `delete(invoiceId): Observable<void>` (issues `DELETE`) and
`void(invoiceId): Observable<void>` (issues `POST … /void` with no body). Both are thin — no request
body, no response body to parse — mirroring the shape of `RentAgreementsService.cancel`.

**Styling.** `invoice-list.component.scss` gains `.row-actions` (a column flex layout so "Correct",
"Delete", "Void", and an inline error all stack inside the existing cell), `.danger-link` (a red variant
of the global `.link-btn`), and `.row-confirm`/`.row-confirm-actions`/`.danger`/`.secondary` — the last
three copied from `rent-agreement-lifecycle.component.scss`'s confirm-step buttons, since those are not
in the global `styles.scss` and this is the same pattern.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|------------------------|-----|
| 1 | Interaction pattern for Delete/Void | Inline confirm in the existing action cell, expanding on click | Kebab (⋮) overflow menu, as in `rent-agreement-create.component.ts`; a shared modal/dialog component | Only two actions, already candidates for plain text links; a positioned floating menu is solving a scale problem (many actions, table-clipping) this screen doesn't have. No modal/dialog component exists elsewhere in this app to reuse, and introducing one for two buttons would be new machinery, not reuse. |
| 2 | Post-success UI update | Re-run the current search (`this.refresh()`) | Patch the row's `status`/`deletedAt`/`voidedAt` fields locally from the (empty) `204` response | The `204` response carries no body to patch from, and the *visibility* rule (hide vs. always-show) is a list-level concern the search already implements correctly — re-deriving it locally risks drifting from the backend's actual behavior. |
| 3 | Gating rule for offering the actions | Hide both once `status` is `voided` or `deleted` | Show them always and let the backend's `404`/`422` explain why nothing happened | Matches this app's existing gating philosophy (`RentAgreementLifecycleComponent`'s `isDraft`/`canTerminate`/`canArchive`): a control that reliably fails is worse than no control. |
| 4 | Confirmation copy | "Delete/Void this invoice? This cannot be undone." (no further detail) | Quoting the controller's fuller doc-comment nuance ("an overdue invoice is deletable, only a payment makes one permanent") | That nuance describes *when the backend will refuse*, which is already what the `422` error message says if it happens — restating it in every confirmation would read as a warning for a case the vast majority of confirmations won't hit. The error path (FR 25) already surfaces the real reason on the rare row where it matters. |

**Source note:** none of the above needed a user answer beyond what the task brief already specified
(backend contract, existing UI idioms) — all four are inferences from the codebase's own established
patterns, flagged here rather than asked because the brief explicitly delegated the choice ("use your
judgment").

## Data Model & Schema Changes

None. This is a UI-only change against two already-implemented backend endpoints; no persistence, no new
wire types beyond the two `void`/`204`-shaped service calls described above.

## Task Checklist

- [x] `src/app/invoices/invoices.service.ts` — add `delete(invoiceId: string): Observable<void>` and
      `void(invoiceId: string): Observable<void>`, each with a doc comment describing the `204`/idempotent
      contract, mirroring `getById`/`search`'s existing comment style.
- [x] `src/app/invoices/invoice-list.component.ts` — add the four signals (`pendingRowAction`,
      `workingInvoiceId`, `actionError`, `actionSuccess`) and the five methods (`canManageInvoice`,
      `isRowWorking`, `beginRowAction`, `cancelRowAction`, `confirmRowAction`) described above.
- [x] `src/app/invoices/invoice-list.component.html` — add the `actionSuccess` banner above the table
      (same shape as the existing `chargeSuccess` banner), and expand the row-actions `<td>` with the
      gated Delete/Void controls and inline confirm/error, per FR 21–25.
- [x] `src/app/invoices/invoice-list.component.scss` — add `.row-actions`, `.danger-link`,
      `.row-confirm`, `.row-confirm-actions`, `.danger`, `.secondary`.
- [x] `src/app/invoices/invoices.service.spec.ts` — add specs for `delete()` and `void()`: correct
      method/URL, a `204` success, and a `404`/`422` propagated to the caller (mirroring the existing
      `getById()` 404 spec).
- [x] `src/app/invoices/invoice-list.component.spec.ts` — add specs covering: a terminal row (`voided` or
      `deleted`) offers neither action; Delete's confirm → `DELETE` → `204` → success banner → the list is
      re-searched; Void's confirm → `POST …/void` → `204` → success banner → re-searched; a repeat `204`
      still reports success; a `404` and a `422` each render inline in the acting row without touching
      other rows' state.

## Test Plan

- `npx ng test --watch=false --browsers=ChromeHeadless --include='**/invoice*.spec.ts'` from the repo
  root, run after implementation, with all specs passing (new and pre-existing).
- Coverage against spec FRs:
  - FR 21 (gating): a row fixture with `status: 'voided'` and one with `status: 'deleted'` each render no
    Delete/Void controls; a `not_received` row renders both.
  - FR 22 (confirm-before-call): clicking Delete/Void does not itself trigger an HTTP call
    (`httpMock.expectOne` only after the confirm button is clicked); clicking the row's "Cancel" leaves
    `pendingRowAction()` `null` and issues no request.
  - FR 23 (in-flight guard): while a `delete()`/`void()` call is pending (before `flush`), a second click
    on the same row's confirm button issues no second request.
  - FR 24 (success + refresh): after `flush(null, { status: 204, statusText: 'No Content' })`, the success
    banner text names the invoice and verb, and a second `GET /api/v1/invoices` request is observed
    (the refresh).
  - FR 25 (verbatim error): flushing a `404`/`422` Problem Details body surfaces its `detail` text
    unchanged in the acting row, and no refresh request is issued.
