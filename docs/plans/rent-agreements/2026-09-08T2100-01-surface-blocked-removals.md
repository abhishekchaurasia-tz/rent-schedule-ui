**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v19
**Author:** Abhishek Chaurasia · **Created:** 2026-09-08

# Surface the refusals a terms save reports

A property owner deletes a schedule row whose cycle has already been invoiced, saves, and nothing
happens. No error, no explanation, and the row is back where it was.

**It never failed.** `PUT …/terms` answered `200`, applied every other change in the save, and named
the refusal in `blockedRemovals` — with a message written for display and the id of the invoice
standing in the way. This application had no `blockedRemovals` anywhere in it: not in the response
model, not in the component, not in the template. The report was received and discarded.

Reported 2026-09-08: *"once I had created the invoice, deleting the schedule row started failing silently"*.

---

## Setup & Environment

- **Node/Angular:** as pinned in `package.json` — Angular 19, no dependency added.
- **Files touched:** four, all under `src/app/rent-agreements/`.
- **Backend dependency:** none new. `blockedRemovals` has been on the `PUT …/terms` response since the
  backend's v45; the field this plan reads was already being sent and thrown away.
- **Build and test:**

  ```bash
  npm ci
  npx ng build --configuration development
  npx ng test --watch=false --browsers=ChromeHeadless
  ```

### Prerequisites & Open Questions

1. **Settled — the remedy is named, not offered.** The refusal points at an invoice, and removing that
   invoice is what completes the removal. This screen shows the invoice id and stops there: an invoice
   deletion is destructive and belongs behind the confirm flow
   [`04-invoice-list-ui.md`](../../specs/rent-agreements/04-invoice-list-ui.md) already has. Adding a
   delete button here would mean either duplicating that confirm or shipping a one-click destructive
   action, and neither belongs in this slice. **The cost is one navigation**, recorded so it reads as a
   decision rather than an oversight.
2. **Open — the invoice id is shown raw.** A GUID is the actionable fact but poor to read. A link into
   the invoice list filtered to that invoice would be better and needs a route contract this screen
   does not have today (`/invoices` takes no invoice filter). Left out rather than guessed.
3. **Open, and this repository's own gap — no HTML companion.** The backend's convention pairs every
   spec with a rendered `.html`; no spec under `docs/specs/` here has one, so this plan does not
   introduce the first. Worth deciding for the repository rather than in this slice.

---

## Milestone-Based Implementation

### Milestone 1 — The refusal is visible and the page holds

**Dependencies:** none. **Rules:** requirement 10 (backend spec 01 FR-124's client clause).

**Production files (3):**

- `src/app/rent-agreements/rent-agreement.models.ts`
- `src/app/rent-agreements/rent-agreement-create.component.ts`
- `src/app/rent-agreements/rent-agreement-create.component.html`

**Tasks**

- [x] Add `BlockedRemovalResponse` (`kind`, `id`, `scheduledDate`, `invoiceId?`, `reason`, `message`) and
      `blockedRemovals?: BlockedRemovalResponse[] | null` on `RentAgreementDetailResponse`. Optional and
      nullable so a response without it still type-checks. Document on the field that a `200` does
      **not** mean everything asked for happened — that is the sentence whose absence caused this.
- [x] Add a `blockedRemovals` signal, documented as **not** an error signal: `saveError` means the save
      failed, this means it succeeded and did less than asked. The two never both fill from one
      response.
- [x] Set it from the response in the `updateTerms` `next` handler, and **return before the navigation**
      when it is non-empty.
- [x] Render a `banner warn` listing each entry — the server's `message` verbatim, the anchor, and the
      invoice id when present. **Reuse the global `.warn` modifier** in `src/styles.scss`; no new CSS.
      *(An earlier draft wrote `banner warning`, which matches nothing — the global modifier is
      `.warn`.)*
- [x] Tests, in `rent-agreement-edit.component.spec.ts` where the edit-save tests already live:
      `FR124_SaveReportsBlockedRemoval_HoldsTheNavigationAndSurfacesTheMessage`,
      `FR124_SaveReportsNoBlockedRemoval_NavigatesAsBefore`,
      `FR124_SaveReportsBlockedRemoval_LeavesTheRefusedRowVisiblyNotCancelled`.
- [x] **Prove the tests catch it.** Removed the navigation hold and confirmed **exactly one** test
      fails, then restored it. The other two pass either way by design — one is the unchanged happy
      path, the other rides on the response re-seeding rows, which already worked.
- [x] **Verification:** `ng build` clean; `ng test` **312 passed, 0 failed**.
- [ ] **STOP — review checkpoint.**

#### Flow Card — M1 A refusal the owner can see

**Trigger:** `PUT /rent/agreements/{id}/terms` answering `200` with a non-empty `blockedRemovals`

| # | Where | What happens |
|---|-------|--------------|
| 1 | `rent-agreements.service.ts.updateTerms` | Returns the detail response, now typed with `blockedRemovals` |
| 2 | `rent-agreement-create.component.ts` — the `updateTerms` `next` handler | **The rule lives here — requirement 10.** Re-seeds the rows from the server, sets `blockedRemovals`, and returns before navigating when any is present |
| 3 | `rent-agreement-create.component.html` — the `banner warn` block | Renders each entry: the anchor, the server's message verbatim, the invoice id when named |
| 4 | The schedule table, re-seeded at step 2 | Shows the refused row as **not** cancelled, because the server kept it planned |

**Rules covered:** requirement 10
**Tests:** the three named above
**Fails when:** `blockedRemovals` is absent or empty → nothing rendered and the navigation is unchanged
· an entry has no `invoiceId` → the message shows without an invoice line, never a dead control · the
save itself fails → `saveError` renders instead, and this banner cannot also be filled
**Start debugging here:** the `updateTerms` subscription's `next` handler — one early return decides
whether the user ever sees the refusal.

---

## Scope & Context Rules

**May be modified:** the three files named above, plus
`rent-agreement-edit.component.spec.ts`.

**Must not be touched:** `invoices.service.ts` and the invoice list (the remedy stays where its confirm
flow is), `src/styles.scss` (the `.warn` modifier already exists), the create-path save, and every other
component.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | What to do about the navigation | **Hold it** while any removal is refused | Navigate anyway and show the banner on the tenants screen; navigate and toast | Rendering the refusal onto a page the user never sees is the defect, not a smaller version of it. The row and its explanation belong on one screen |
| 2 | Where the wording comes from | The server's `message`, verbatim | Compose a sentence from `reason` | The wording belongs to whoever owns the rule; a paraphrase drifts the moment the rule changes. `reason` stays available for anything that must branch |
| 3 | Whether to offer the remedy inline | **Name the invoice, do not act on it** | A delete/void button calling `invoices.service.ts` | Destructive, and `04-invoice-list-ui.md` already owns the confirm flow for it. **Source: recorded as a deliberate trade in Prerequisites 1** |
| 4 | Which banner style | The global `.warn` modifier | A new `.warning` class | It already exists in `src/styles.scss` for exactly this kind of notice, and one definition is why a warning looks the same everywhere |

---

## Verification

| Check | Command | Proves |
|---|---|---|
| Build clean | `npx ng build --configuration development` | — |
| The refusal is visible and the page holds | `FR124_SaveReportsBlockedRemoval_HoldsTheNavigationAndSurfacesTheMessage` | requirement 10's first clause |
| The happy path is unchanged | `FR124_SaveReportsNoBlockedRemoval_NavigatesAsBefore` | that this slice added a branch, not a behaviour change |
| The screen agrees with the server | `FR124_SaveReportsBlockedRemoval_LeavesTheRefusedRowVisiblyNotCancelled` | a refused row stops showing as deleted |
| No regression | `npx ng test --watch=false --browsers=ChromeHeadless` | 312 passing |

---

## Git & Rollback

Branch `abhishek/fr124-surface-blocked-removals`, cut from `main`.

| After | Commit message |
|---|---|
| Milestone 1 | `fix: surface the refusals a terms save reports, and stay on the page for them` |

Rollback: one commit, no dependency and no contract change — `git revert <sha>` restores the previous
behaviour exactly.

---

## Final Validation

- [x] This plan's `**Spec:** … — v19` first line resolves, and the spec's v19 changelog row links back
      to this plan file.
- [x] Authorship recorded: this plan's header names a real person and today's date. *(The spec's
      changelog has no Author column — a pre-existing gap in this repository, not introduced here.)*
- [x] Requirement 10 is implemented and named by at least one test — three `FR124_…` tests in
      `rent-agreement-edit.component.spec.ts`.
- [x] The Flow Card matches what was built.
- [x] `ng build` and `ng test` both pass — 312 passing at the time, 314 after the sibling slice below.
- [x] No dependency added, no route added, no global stylesheet change — the merged commit `689f184`
      touched four `src/app/rent-agreements/` files and this plan's two documents, nothing else.
- [x] The deliberate limits — the remedy is named not offered, and the invoice id is shown raw — are in
      *Prerequisites & Open Questions* rather than left for a reader to discover.

**Follow-on, recorded here because it is the same defect a second time:** `skippedCycles` on
`PUT …/tenants` was being discarded in exactly the same way, on the next screen of the same wizard.
Fixed by [2026-09-09T1500-06-surface-skipped-cycles](2026-09-09T1500-06-surface-skipped-cycles.md)
against the new spec [`06-add-tenants-ui.md`](../../specs/rent-agreements/06-add-tenants-ui.md).
Two instances is a pattern: **whenever the backend reports something on a `200`, check this
repository actually reads it** — `grep` for the field name before assuming it is handled.
