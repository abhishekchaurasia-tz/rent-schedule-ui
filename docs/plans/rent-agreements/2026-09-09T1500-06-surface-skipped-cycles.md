**Spec:** [`docs/specs/rent-agreements/06-add-tenants-ui.md`](../../specs/rent-agreements/06-add-tenants-ui.md) — v1
**Author:** Abhishek Chaurasia · **Created:** 2026-09-09

# Surface the months a roster change deliberately did not reach

A property owner adds a tenant at 0%, saves, and everything is fine. Then they raise that share from
0% — and an already-billed month does not move. The screen says "Tenants saved.", the bill disagrees
with the roster, and nothing on screen connects the two.

**The backend intends it.** A cycle that was already due when the split changed keeps the split it
was billed with — backend requirement 104, decided at its spec v37 and confirmed by the reporter on
2026-08-28. And since **backend FR 155** the save says so: a `200` from `PUT …/tenants` carries
`skippedCycles`, each naming the cycle, its due date, and the reason `cycle_already_due`.

**This application had no `skippedCycles` anywhere in it** — not in the response model, not in the
component, not in the template. `grep -rn "skippedCycles" src/` returned nothing. The report was
received and discarded, exactly as `blockedRemovals` was on the sibling screen until
[`2026-09-08T2100-01-surface-blocked-removals`](2026-09-08T2100-01-surface-blocked-removals.md)
one day earlier. **Same defect class, second instance** — which is the fact worth carrying out of
this slice, and the reason the tenants screen now has a spec at all.

## Setup & Environment

- **Node/Angular:** as pinned in `package.json` — Angular 19, no dependency added.
- **Files touched:** three, all under `src/app/rent-agreements/`.
- **Backend dependency:** none new. `skippedCycles` has been on the `PUT …/tenants` response since
  backend FR 155 (`65e00765`, 2026-09-08); the live API was verified to return `"skippedCycles":[]`
  before a line of this was written.
- **Build and test:**

  ```bash
  npx ng build --configuration development
  npx ng test --watch=false --browsers=ChromeHeadless
  ```

### Prerequisites & Open Questions

1. **Settled — reported, never rejected.** The save applied, and every cycle that had not been billed
   yet did take the new split. So this renders **beside** the success banner, in `banner warn`, and
   `saveError` stays untouched. Presenting it as a failure would be as wrong as the silence it
   replaces.
2. **Settled — no navigation hold.** The v19 fix on the sibling screen had to hold a navigation,
   because that screen moved on before its banner could be read. This screen is the last step of the
   wizard and does not navigate on save, so surfacing is the whole fix.
3. **Open — the cycle is named, not linked.** A link into the invoice list filtered to that cycle
   would be better and needs a route contract `/invoices` does not have. Same open question v19
   recorded for the invoice id; left out rather than guessed. The response's `invoiceId` is
   deliberately **not** rendered here — for a skipped cycle it is the invoice that is *correct*, so
   showing it would read as a remedy when there is nothing to remedy.
4. **Open, and the backend's own decision — spec 06 `D-1`:** should an already-due month be
   re-divided at the new split? While that is open, this screen's job is to state what happened, not
   to offer a way around it.
5. **Open, this repository's gap, unchanged from v19 — no HTML companion.** No spec under
   `docs/specs/` here has one; this plan does not introduce the first.

---

## Milestone-Based Implementation

### Milestone 1 — The skipped months are visible on the save that skipped them

**Dependencies:** none. **Rules:** spec 06 requirement 11 (backend FR 155's client clause).

**Production files (3):**

- `src/app/rent-agreements/rent-agreement.models.ts`
- `src/app/rent-agreements/add-tenants.component.ts`
- `src/app/rent-agreements/add-tenants.component.html`

**Tasks**

- [x] Add `skippedCycles?: BlockedRemovalResponse[] | null` to `SaveAgreementTenantsResponse`.
      **Reuse `BlockedRemovalResponse`** — the backend reuses the same shape for the same reason, and
      a second near-identical interface would be two names for one answer. Optional and nullable so a
      response without it still type-checks.
- [x] Add a `skippedCycles` signal, documented as **not** an error signal: the save succeeded and
      those months keep the split they were billed with.
- [x] Set it from the response in the `saveTenants` `next` handler (`?? []`), and **clear it when a
      save starts**, next to the existing `saveError`/`saveResult` resets — otherwise a second save
      would show the first save's skipped months.
- [x] Render a `banner warn` after the success banner: a count line, then each entry's
      `scheduledDate` and the server's `message` **verbatim**. Reuse the global `.warn` modifier in
      `src/styles.scss`; no new CSS.
- [x] Tests, in `add-tenants.component.spec.ts` where the save tests already live:
      `FR155_SaveReportsSkippedCycles_SurfacesThemWithoutCallingItAFailure` (asserts the entry, and
      that `saveError()` is null while `saveResult()` is not) and
      `FR155_SaveReportsNoSkippedCycles_SurfacesNothing`.
- [x] **Red before green.** Both tests were written first and failed on `component.skippedCycles`
      not existing.
- [x] **Verification:** `ng build` clean; `ng test` **314 passed, 0 failed** (312 before).
- [ ] **STOP — review checkpoint.**

#### Flow Card — M1 A skipped month the owner can see

**Trigger:** `PUT /rent-agreements/{id}/tenants` answering `200` with a non-empty `skippedCycles`

| # | Where | What happens |
|---|-------|--------------|
| 1 | `rent-agreements.service.ts.saveTenants` | Returns the save response, now typed with `skippedCycles` |
| 2 | `add-tenants.component.ts` — the `saveTenants` `next` handler | **The rule lives here — requirement 11.** Sets `saveResult`, then `skippedCycles` from `response.skippedCycles ?? []`, then flips the screen to edit mode |
| 3 | `add-tenants.component.ts` — `save()`'s reset block | Clears `skippedCycles` when a save starts, so a report never outlives the save that produced it |
| 4 | `add-tenants.component.html` — the `banner warn` block after the success banner | Renders each entry: the scheduled date and the server's message verbatim |

**Rules covered:** requirement 11
**Tests:** the two named above
**Fails when:** `skippedCycles` is absent, `null` or empty → nothing rendered, and the success banner
is unchanged · the save itself fails → `saveError` renders and this banner cannot also fill, because
the `next` handler never runs · a second save reports nothing → the previous report is already
cleared
**Start debugging here:** `add-tenants.component.ts`'s `saveTenants` `next` handler — one line
decides whether the owner ever learns which months kept their old split.

---

## Scope & Context Rules

**May be modified:** the three files named above, plus `add-tenants.component.spec.ts`.

**Must not be touched:** `rent-agreement-create.component.*` (its own `blockedRemovals` report is a
separate screen and requirement), `src/styles.scss` (the `.warn` modifier already exists), the
`GET …/tenants` prefill path, and the split/rebalance arithmetic.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | How to present it | **Beside the success banner**, in `banner warn` | Replace the success banner; render as `saveError`; a toast | The save succeeded. Anything that reads as a failure misdescribes it, and a toast is gone before the owner reaches the bill it explains |
| 2 | The response type | **Reuse `BlockedRemovalResponse`** | A new `SkippedCycleResponse` interface | The backend reuses the same record for the same reason: both answer "what did this successful save not do?". Two names for one answer is how they drift |
| 3 | Where the wording comes from | The server's `message`, verbatim | Compose a sentence from `reason` | The wording belongs to whoever owns the rule. `reason` (`cycle_already_due`) stays available for anything that must branch |
| 4 | Whether to render `invoiceId` | **No** | Show it, as v19 does for a blocked removal | For a *blocked removal* the invoice is the obstacle, so naming it is the next step. For a *skipped cycle* the invoice is correct — naming it would imply a remedy that does not exist. **Source: Prerequisites 3** |
| 5 | Which spec this requirement goes in | **A new spec `06-add-tenants-ui.md`** | Add requirement 11 to `01-rent-agreement-edit-ui.md` | Spec 01 is scoped to `RentAgreementCreateComponent` by its own Overview; this is a different screen and a different endpoint. Requirements 1–10 there document the screen as found, so the next change to it has a baseline |

---

## Verification

| Check | Command | Proves |
|---|---|---|
| Build clean | `npx ng build --configuration development` | — |
| The skipped months are visible, and not called a failure | `FR155_SaveReportsSkippedCycles_SurfacesThemWithoutCallingItAFailure` | requirement 11 |
| The happy path is unchanged | `FR155_SaveReportsNoSkippedCycles_SurfacesNothing` | this slice added a branch, not a behaviour change |
| No regression | `npx ng test --watch=false --browsers=ChromeHeadless` | 314 passing |

---

## Git & Rollback

Branch `abhishek/fr155-surface-skipped-cycles`, cut from `main`.

| After | Commit message |
|---|---|
| Milestone 1 | `fix: surface the months a roster change did not reach` |

Rollback: one commit, no dependency and no contract change — `git revert <sha>` restores the previous
behaviour exactly.

---

## Final Validation

- [x] This plan's `**Spec:** … — v1` first line resolves, and the spec's v1 changelog row links back
      to this plan file.
- [x] Authorship recorded: this plan's header names a real person and today's date. *(The spec's
      changelog has no Author column — a pre-existing gap in this repository, not introduced here.)*
- [x] Requirement 11 is implemented and named by at least one test.
- [x] The Flow Card matches what was built.
- [ ] **Not committed** — the reporter asked to review the working tree first.
