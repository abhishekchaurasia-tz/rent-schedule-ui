**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v5
**Author:** Abhishek Chaurasia · **Created:** 2026-09-09

# Surface the fee lines that will never be billed

A property owner adds a fee, sees it appear in "Added to this lease", and moves on. Part of that
fee's money will never reach an invoice — and nothing on the page said so.

**The backend already said it.** `POST …/additional-charges` returns the saved charge *plus*
`unbilledLines`: the lines nothing could bill, because every candidate invoice has already taken a
payment, and a paid invoice is corrected with a credit or a void rather than an edit (backend FR 101,
spec 04 v8 FR 41). Its own contract is explicit — *"never null, and never absent, so a client reads it
unconditionally"*, and *"the defect being closed is not the refusal but the silence"*.

`grep -rn "unbilledLines" src/` returned **nothing**. The disclosure written to end a silence was
being received and discarded, so the silence was intact.

**This is the third instance of one defect**, and that is the fact worth carrying forward:

| Field | Endpoint | Was surfaced by |
|---|---|---|
| `blockedRemovals` | `PUT …/terms` | spec 01 v19 (2026-09-08) |
| `skippedCycles` | `PUT …/tenants` | spec 06 v1 (2026-09-09) |
| `unbilledLines` | `POST …/additional-charges` | **this slice** |
| `warnings` | `POST …/rent-schedules/preview` | **not yet — see Prerequisites 4** |
| `blocked` | `POST …/rent-schedules/preview` | **not yet — see Prerequisites 4** |

## Setup & Environment

- **Node/Angular:** as pinned in `package.json` — Angular 19, no dependency added.
- **Files touched:** four, all under `src/app/rent-agreements/`.
- **Backend dependency:** none new. `unbilledLines` has been on the response since the backend's spec
  04 v8; the wire shape is flat by a custom converter, so it arrives as a sibling of the charge's own
  fields.
- **Build and test:**

  ```bash
  npx ng build --configuration development
  npx ng test --watch=false --browsers=ChromeHeadless
  ```

### Prerequisites & Open Questions

1. **Settled — a disclosure, not a failure.** The charge is saved and the line stays on it.
   `submitError` is untouched and the charge stays in the committed list; only the wording and the
   `warn` styling mark it.
2. **Settled — keyed by charge, not one banner per save.** This page commits fees one after another.
   A page-level "latest save" banner would be silently cleared by the next fee, while the first fee's
   unbilled money still needs acting on. `FR101_ASecondChargeBillsFine_LeavesTheFirstChargesDisclosureStanding`
   is the test that pins it, and it is the reason the state is a map rather than a list.
3. **Open — no remedy is offered.** What resolves an unbilled line is a credit or a void against the
   paid invoice, which lives on `04-invoice-list-ui.md`'s screen and has its own confirm flow. Same
   limit spec 01 v19 recorded for a blocked removal, for the same reason.
4. **Open — two more unread report fields, named so the fourth instance is not a discovery.**
   `PreviewRentScheduleResponse` carries `warnings` (codes `frequency_change_loses_row_identity`,
   `recurring_charge_outlives_lease`; its contract says *"the user must see before saving"*) and
   `blocked` (advisory, the rows `PUT …/terms` would decline). Neither appears anywhere in `src/`.
   **`warnings` is the more valuable of the two** — it is the only pre-save signal in the app, and it
   fires on a frequency change that silently loses row identity. `blocked` now partly overlaps
   `blockedRemovals`, which is shown *after* the save; moving that knowledge before the save is still
   an improvement, just a smaller one. Left for the next slice rather than bundled here.
5. **Open, this repository's gap, unchanged — no HTML companion for any spec here.**

---

## Milestone-Based Implementation

### Milestone 1 — The unbilled money is visible on the fee that carries it

**Dependencies:** none. **Rules:** spec 02 requirement 15 (backend FR 101's client clause).

**Production files (4):**

- `src/app/rent-agreements/rent-agreement.models.ts`
- `src/app/rent-agreements/rent-agreements.service.ts`
- `src/app/rent-agreements/add-additional-charge.component.ts`
- `src/app/rent-agreements/add-additional-charge.component.html`

**Tasks**

- [x] Add `UnbilledLineResponse` (`description`, `amount`) and
      `AddAdditionalChargeResponse extends RentAgreementAdditionalChargeResponse` carrying
      `unbilledLines?: UnbilledLineResponse[] | null`. **A separate interface, not a field on the
      shared charge response** — the backend keeps it off `RentAgreementAdditionalChargeResponse` for
      exactly this reason: it is a per-save concept and would leak into the agreement-detail and
      create payloads, which never carry it. `extends` because the wire shape is flat.
- [x] Re-type `RentAgreementsService.addAdditionalCharge` to the new response.
- [x] Add `unbilledByCharge = signal<Record<string, UnbilledLineResponse[]>>({})` and an
      `unbilledFor(chargeId)` accessor; record from the `next` handler only when non-empty.
- [x] Render a `banner warn` **inside the charge card**, after its item list: a count line, one
      sentence saying the fee was saved and what the lines could not do, then each line's description
      and amount. Reuse the global `.warn` modifier; no new CSS.
- [x] Tests, in `add-additional-charge.component.spec.ts`:
      `FR101_SaveReportsUnbilledLines_SurfacesThemAgainstThatCharge`,
      `FR101_SaveReportsNoUnbilledLines_SurfacesNothing`,
      `FR101_ASecondChargeBillsFine_LeavesTheFirstChargesDisclosureStanding`.
- [x] **Red before green.** All three failed first on `unbilledFor` not existing.
- [x] **Verification:** `ng build` clean; `ng test` **317 passed, 0 failed** (314 before).
- [ ] **STOP — review checkpoint.**

#### Flow Card — M1 A fee that discloses what it cannot bill

**Trigger:** `POST /rent-agreements/{id}/additional-charges` answering `201`/`200` with a non-empty
`unbilledLines`

| # | Where | What happens |
|---|-------|--------------|
| 1 | `rent-agreements.service.ts.addAdditionalCharge` | Returns the flat body, now typed as `AddAdditionalChargeResponse` |
| 2 | `add-additional-charge.component.ts` — the `addAdditionalCharge` `next` handler | **The rule lives here — requirement 15.** Pushes the charge onto `addedCharges`, then records `unbilledLines` under that charge's id when there is anything to record |
| 3 | `add-additional-charge.component.ts.unbilledFor` | Reads one charge's disclosure, defaulting to empty — so the template needs no null handling |
| 4 | `add-additional-charge.component.html` — the `banner warn` inside `article.added-charge` | Renders the count, the one-sentence explanation, and each line's description and amount |

**Rules covered:** requirement 15
**Tests:** the three named above
**Fails when:** `unbilledLines` is absent, `null` or empty → nothing rendered and the card is
unchanged · the save fails → `submitError` renders and nothing reaches the map, because the `next`
handler never runs · a second fee bills fine → the first fee's disclosure still stands, because the
map is keyed by charge id
**Start debugging here:** the `addAdditionalCharge` subscription's `next` handler — one guarded update
decides whether the owner ever learns which money will not be billed.

---

## Scope & Context Rules

**May be modified:** the four files named above, plus `add-additional-charge.component.spec.ts`.

**Must not be touched:** `additional-charge-panel.component.*` (the authoring panel is shared with two
other screens and knows nothing about a save's outcome), `src/styles.scss` (the `.warn` modifier
already exists), the invoice list and its credit/void flow, and the preview response fields named in
Prerequisites 4 — those are the next slice, not this one.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Where the disclosure lives | **Inside the charge's card**, keyed by charge id | A page-level banner for the latest save; a toast | The page commits fees one after another. A latest-save banner is cleared by the next fee while the first fee's money is still unbilled — the disclosure belongs to the fee, not to the moment |
| 2 | The response type | **A new `AddAdditionalChargeResponse extends` the shared charge** | Add `unbilledLines?` to `RentAgreementAdditionalChargeResponse` | The backend deliberately keeps it off the shared record — agreement-detail and create never carry it, and an optional field there would invite reading it where it is always absent |
| 3 | How it reads | A disclosure: the fee **was** saved | Render through `submitError`; block the panel from closing | Both would say the save failed. It did not, and the line stays on the charge |
| 4 | Whether to offer the remedy | **No** — say what happened | A credit/void control on the line | Destructive, and `04-invoice-list-ui.md` owns that confirm flow. **Source: Prerequisites 3** |
| 5 | Whether to bundle the preview's `warnings`/`blocked` | **No — next slice** | Fix all three unread fields at once | One vertical slice per milestone. Bundling would put four unrelated screens in one review, which is how the first three instances went unreviewed |

---

## Verification

| Check | Command | Proves |
|---|---|---|
| Build clean | `npx ng build --configuration development` | — |
| The unbilled lines are visible, against their own fee | `FR101_SaveReportsUnbilledLines_SurfacesThemAgainstThatCharge` | requirement 15's first clause |
| The happy path is unchanged | `FR101_SaveReportsNoUnbilledLines_SurfacesNothing` | this slice added a branch, not a behaviour change |
| A later fee does not erase an earlier disclosure | `FR101_ASecondChargeBillsFine_LeavesTheFirstChargesDisclosureStanding` | requirement 15's independence clause — the reason the state is keyed |
| No regression | `npx ng test --watch=false --browsers=ChromeHeadless` | 317 passing |

---

## Git & Rollback

Branch `abhishek/fr101-surface-unbilled-lines`, cut from `main`.

| After | Commit message |
|---|---|
| Milestone 1 | `fix: surface the fee lines a save could bill nowhere` |

Rollback: one commit, no dependency and no contract change — `git revert <sha>` restores the previous
behaviour exactly.

---

## Final Validation

- [x] This plan's `**Spec:** … — v5` first line resolves, and spec 02's v5 changelog row links back to
      this plan file.
- [x] Authorship recorded: this plan's header names a real person and today's date. *(Spec 02's
      changelog has no Author column — a pre-existing gap in this repository, not introduced here.)*
- [x] Requirement 15 is implemented and named by at least one test carrying its rule id.
- [x] The Flow Card matches what was built.
- [x] `ng build` and `ng test` both pass — 317 passing, 0 failing.
- [x] No dependency added, no route added, no global stylesheet change.
- [x] The two remaining unread report fields are **named** in Prerequisites 4 with a recommendation,
      so the fourth instance of this defect is a scheduled slice rather than another defect report.
- [ ] **Not committed** — the reporter asked to review the working tree first.
