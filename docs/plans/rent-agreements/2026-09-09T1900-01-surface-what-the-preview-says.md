**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v20
**Author:** Abhishek Chaurasia · **Created:** 2026-09-09

# Surface what the preview already says

The schedule preview returns two reports this application never read:

- **`warnings`** — non-blocking consequences of the previewed change. The backend's own contract calls
  them *"non-blocking consequences the user must see before saving"*; the code that exists today emits
  `frequency_change_loses_row_identity` — *row identity and hand-edited amounts will be lost*.
- **`blocked`** — the rows `PUT …/terms` will decline to remove, the same facts requirement 10 shows
  *after* a save.

`grep -rn "warnings" src/` and `grep -rn "blocked" src/` found neither. No model field, no signal, no
template branch.

**These are the only signals in this application that arrive *before* a save**, and that is the whole
argument for this slice. `blockedRemovals` (v19) explains a refusal once the decision is made;
`warnings` is the one thing that can change a decision while it is still being made — a user about to
switch a lease from monthly to quarterly is told, before they commit, that every hand-edited amount
goes with it.

**Fifth instance of one pattern**, and the list is now closed:

| Field | Endpoint | Surfaced by |
|---|---|---|
| `blockedRemovals` | `PUT …/terms` | spec 01 v19 |
| `skippedCycles` | `PUT …/tenants` | spec 06 v1 |
| `unbilledLines` | `POST …/additional-charges` | spec 02 v5 |
| `warnings` | `POST …/schedule/preview` | **this slice** |
| `blocked` | `POST …/schedule/preview` | **this slice** |

## Setup & Environment

- **Node/Angular:** as pinned in `package.json` — Angular 19, no dependency added.
- **Files touched:** three, plus the spec file's tests.
- **Backend dependency — and it is a real one.** `blocked`'s predicate had been stale since the
  backend's FR-124: it named every billed row while the save removed the unpaid, not-yet-due ones
  without complaint. That is fixed in backend spec 01 **v88**, shipped alongside this. Surfacing
  `blocked` before that fix would have meant surfacing a wrong answer more loudly, which is worse than
  discarding it.
- **Build and test:**

  ```bash
  npx ng build --configuration development
  npx ng test --watch=false --browsers=ChromeHeadless
  ```

### Prerequisites & Open Questions

1. **Settled — above the schedule table, not beside the save button.** Their value is being read while
   the change can still be undone. A notice next to Save is read after the decision is made, which is
   the position requirement 10 already occupies.
2. **Settled — replaced wholesale on every preview.** Each report describes *that* computed change.
   Merging or accumulating them would leave a warning on screen describing a change the user has
   already backed out of — `FR023_ASecondPreviewWithoutWarnings_ClearsThePreviousOnes` is the test that
   pins it, and it is the only one of the four that would pass under a naive implementation and then
   rot.
3. **Settled — neither is an error.** The preview succeeded and its schedule is on screen;
   `previewError` keeps the single meaning "the preview failed".
4. **Open — the wording of the warnings banner is ours, the wording of each warning is the server's.**
   The `message` is rendered verbatim, for the reason v19 recorded; the sentence framing it ("Nothing
   is wrong with the schedule below — this is what changes if you keep it") is this screen's, because
   the server has no way to know it is being rendered above a table the user is about to accept.
5. **Open, unchanged — no HTML companion for any spec in this repository.**

---

## Milestone-Based Implementation

### Milestone 1 — The preview's two reports are on screen

**Dependencies:** backend spec 01 v88 (shipped). **Rules:** requirement 11.

**Production files (3):**

- `src/app/rent-schedule/rent-schedule.models.ts`
- `src/app/rent-agreements/rent-agreement-create.component.ts`
- `src/app/rent-agreements/rent-agreement-create.component.html`

**Tasks**

- [x] Add `PreviewWarningResponse` (`code`, `message`, `scheduledDate?`) and
      `PreviewBlockedRowResponse` (`scheduledDate`, `invoiceStatus?`, `reason`), and put
      `warnings?` / `blocked?` on `PreviewRentScheduleResponse`. Optional and nullable, so a response
      without them still type-checks. Document on `blocked` that the **save is authoritative** and this
      is advisory — the backend's own contract says so, because a preview and its save can straddle a
      change to what the lease has been billed.
- [x] Add `previewWarnings` and `previewBlocked` signals, documented as **not** error signals and as
      the only pre-save reports in the app.
- [x] Set both from the response in the preview's `next` handler (`?? []`), and clear both in the
      reset block beside `previewError`/`previewResult`.
- [x] Render two `banner warn` blocks **above** the schedule table, inside the `previewResult()` branch:
      warnings worded as a consequence of saving, blocked worded so it is clear the rest of the save
      still applies. Reuse the global `.warn` modifier; no new CSS.
- [x] Tests in `rent-agreement-edit.component.spec.ts`, where the preview tests already live:
      `FR023_PreviewReportsAWarning_SurfacesItBeforeTheSave`,
      `FR022_PreviewReportsABlockedRemoval_SurfacesItBeforeTheSave`,
      `FR023_PreviewReportsNothing_SurfacesNothing`,
      `FR023_ASecondPreviewWithoutWarnings_ClearsThePreviousOnes`.
- [x] **Red before green.** All four failed on `previewWarnings` / `previewBlocked` not existing.
- [x] **One test-only correction worth recording:** the first draft triggered the re-preview by patching
      `frequency: 'quarterly'`, which leaves the form invalid until its config is supplied, so no preview
      fired at all and the test failed on a missing request rather than on the assertion. Changed to a
      rent change — *when* a warning fires is the server's decision, and rendering it is this screen's.
- [x] **Verification:** `ng build` clean; `ng test` **321 passed, 0 failed** (317 before).
- [ ] **STOP — review checkpoint.**

#### Flow Card — M1 A cost the owner sees before paying it

**Trigger:** `POST /rent/schedule/preview` answering `200` with a non-empty `warnings` or `blocked`

| # | Where | What happens |
|---|-------|--------------|
| 1 | `rent-schedule.service.ts.preview` | Returns the response, now typed with both reports |
| 2 | `rent-agreement-create.component.ts` — the preview's reset block | Clears both, so nothing survives into the next preview |
| 3 | `rent-agreement-create.component.ts` — the preview's `next` handler | **The rule lives here — requirement 11.** Sets both from the response, wholesale |
| 4 | `rent-agreement-create.component.html` — two `banner warn` blocks above the table | Renders each warning's message verbatim, and each blocked row's anchor, reason and invoice status |

**Rules covered:** requirement 11
**Tests:** the four named above
**Fails when:** either report is absent, `null` or empty → nothing rendered · the preview itself fails
→ `previewError` renders and neither report can fill, because the `next` handler never runs · a second
preview reports nothing → the previous reports are already cleared
**Start debugging here:** the preview subscription's `next` handler — two lines decide whether the
owner learns the cost of a change before or after committing to it.

---

## Scope & Context Rules

**May be modified:** the three files named above, plus `rent-agreement-edit.component.spec.ts`.

**Must not be touched:** `rent-schedule-preview.component.*` (the standalone preview screen has no
existing rows to block, so neither report applies there), `src/styles.scss`, requirement 10's
`blockedRemovals` banner, and the save path.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Where the reports render | **Above the schedule table** | Beside the Save button; a toast | Their value is being read while the change can still be undone. Requirement 10 already occupies the after-the-decision position |
| 2 | How they are updated | **Replaced wholesale on every preview** | Accumulate; merge by code | A warning describes one computed change. Carried forward, it describes a change the user has already reverted — pinned by the double-preview test |
| 3 | Two banners or one | **Two** | One combined list | They answer different questions: *what this change costs* versus *what the save will refuse*. One list would need a per-entry kind anyway |
| 4 | Whether to wait for the backend fix | **No — ship together** | Surface `blocked` first | Its predicate was stale since FR-124, so surfacing it alone would have shown a wrong answer more loudly. Backend spec 01 v88 fixes the predicate; this makes it visible |
| 5 | Whose words | Server's `message` / `reason` **verbatim**, our framing sentence | Compose from `code` | Same as v19: the wording of a rule belongs to whoever owns it. The framing sentence is ours because the server cannot know it is rendered above a table the user is about to accept |

---

## Verification

| Check | Command | Proves |
|---|---|---|
| Build clean | `npx ng build --configuration development` | — |
| A warning is visible before the save | `FR023_PreviewReportsAWarning_SurfacesItBeforeTheSave` | requirement 11's first clause, and that it is not an error |
| A blocked removal is visible before the save | `FR022_PreviewReportsABlockedRemoval_SurfacesItBeforeTheSave` | requirement 11's second clause |
| The happy path is unchanged | `FR023_PreviewReportsNothing_SurfacesNothing` | a branch was added, not a behaviour change |
| A report never outlives its change | `FR023_ASecondPreviewWithoutWarnings_ClearsThePreviousOnes` | the replace-wholesale rule |
| No regression | `npx ng test --watch=false --browsers=ChromeHeadless` | 321 passing |

---

## Git & Rollback

Branch `abhishek/surface-what-the-server-reports` (continued — same finding, third and final pair of
fields).

| After | Commit message |
|---|---|
| Milestone 1 | `fix: surface what the preview says before the save, not after` |

Rollback: one commit, no dependency and no contract change — `git revert <sha>` restores the previous
behaviour exactly.

---

## Final Validation

- [x] This plan's `**Spec:** … — v20` first line resolves, and the spec's v20 changelog row links back
      to this plan file.
- [x] Authorship recorded. *(The spec's changelog has no Author column — a pre-existing gap here.)*
- [x] Requirement 11 is implemented and named by four tests carrying rule ids.
- [x] `ng build` and `ng test` both pass — 321 passing, 0 failing.
- [x] No dependency added, no route added, no global stylesheet change.
- [x] **The pattern is closed:** all five report fields the backend sends on a success are now read by
      this application, and the table at the top of this plan is the record of it. The rule for next
      time: when the backend reports something on a `200`, `grep` for the field name here before
      assuming it is handled.
