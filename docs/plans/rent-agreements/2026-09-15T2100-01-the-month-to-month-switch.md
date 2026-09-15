**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v23
**Author:** Abhishek Chaurasia · **Created:** 2026-09-15 · **Last updated:** 2026-09-15 by Abhishek Chaurasia

# The month-to-month switch

Delivers **requirement 14** (v23): the lease form states whether a fixed term continues
month-to-month when it ends, never states it for a term that is not fixed, and resubmits what was
saved on every edit.

**Client half of backend `01-rent-agreement.md` v108 (FR-134).** Until that version the backend's
`switch_to_m2m` column had **no writer anywhere in the system**: this application never sent such a
field, the API had no such property, and the aggregate hard-set `false` in its constructor. The
column existed and was unreachable.

**Ticking the box changes nothing observable yet** (backend FR-134c). The Lease service stores the
flag but has no job that flips a term at its end, and billing still stops at the end date. It records
the intention at the only moment anyone states it — which is also why no later backfill could
compute it.

## The one that can fail silently

Three obligations. Two are visible the moment anyone looks at the screen; the third is not.

| # | Obligation | How it fails |
|---|---|---|
| a | The control renders only on a fixed term | Visibly wrong — the box appears where it means nothing |
| b | Both payloads send `false` unless the term is fixed | Visible in the request, and the backend corrects it anyway |
| c | The edit payload **always** carries the field | **Silent.** The save succeeds, returns `200`, and quietly unsets a term the tester never touched |

`PUT …/terms` **replaces** the terms it is given and has no `…Supplied` marker for this field, so
omitting it stores `false`. An edit about the rent, or a schedule row, or anything else would clear
the switch — and nothing would report it. That is why (c) carries the spec test and why the value is
read back at all: a screen that cannot read the stored value cannot resubmit it.

**One milestone, four files.** No new endpoint, no route change, no interceptor change.

---

## Setup & Environment

Angular workspace as-is. No new dependency.

| File | Why |
|---|---|
| `rent-agreement.models.ts` | The field on the create request, the update request, and the detail response |
| `rent-agreement-create.component.ts` | The form control, the patch on load, both payload builders, and the shared helper |
| `rent-agreement-create.component.html` | The checkbox, inside the fixed-term block |
| `rent-agreement-create.component.spec.ts` | The three obligations, pinned |

**Existing code this follows — read it first.**

| What | Where | Why it matters |
|---|---|---|
| The deposit checkbox | `depositCollected` in the same form and template | The control shape to copy — `mat-checkbox` bound by `formControlName` |
| The conditional deposit block | `saveEdit`'s `...(this.isDepositEditable ? {…} : {})` | **The pattern NOT to copy here.** The deposit is sent conditionally because omitting it leaves the stored value alone; omitting this field *clears* it, so it is unconditional |
| The fixed-term template block | `@if (leaseTermType === 'fixed')` around the End Date field | Where the checkbox belongs, so it disappears with the field it depends on |

### Prerequisites & Open Questions

- [ ] **The backend must be on v108 or later.** The field is optional on write and additive on read, so
      an older server ignores what this sends and omits it on read — the form then shows `false` and an
      edit would clear a flag the server does not have anyway. **Nothing breaks**, but the feature does
      nothing until both sides are out. No coordinated release is needed.
- [ ] **The flip itself is not this application's concern.** Nothing acts on the flag yet; backend
      spec v108's *Out of Scope* records what is undecided — who owns the flip, what the rent becomes,
      and whether the Lease service is told.

---

## Milestone-Based Implementation

### Milestone 0 — The switch is offered, sent, and preserved

**Implements:** requirement 14 a–d.
**Depends on:** nothing in this repository.
**Expected outcome:** the checkbox appears only on a fixed term; a create sends what was ticked; an
edit resubmits what was saved; and switching the term to month-to-month sends `false` even if the box
was ticked while it was still visible.

#### Tasks

- [x] Write the specs **first**:
      `sends the month-to-month switch on create when the term is fixed`;
      `sends false when the term is month-to-month, even if the box was ticked first` — **the
      stale-value case**, and the only one of the three that could regress without anybody noticing on
      screen.
- [x] `rent-agreement.models.ts`: `switchToMonthToMonth` on `CreateRentAgreementRequest`,
      `UpdateRentAgreementTermsRequest` and `RentAgreementDetailResponse`. The update request's doc
      says **always send it**, with the reason, because the next person to touch that builder will
      otherwise treat it like the deposit block above it.
- [x] `rent-agreement-create.component.ts`: the form control, defaulting to `false`.
- [x] `switchToMonthToMonthForSubmission(value)` — **one helper, used by both payload builders**,
      returning `false` unless `leaseTermType === 'fixed'` (requirement 14b). Two call sites deriving
      this separately is how they drift.
- [x] Both payloads call it. The edit payload does so **unconditionally**, outside the deposit's
      conditional spread (requirement 14c).
- [x] `loadAgreement()` patches the control from `agreement.switchToMonthToMonth ?? false`
      (requirement 14d).
- [x] `rent-agreement-create.component.html`: `mat-checkbox` inside the
      `@if (leaseTermType === 'fixed')` block (requirement 14a). Label describes the agreement — *"When
      this term ends, continue month-to-month instead of expiring"* — rather than promising behaviour
      that does not exist yet.
- [x] `ng build`, `tsc --noEmit` and `ng test` green (342 tests).
- [x] **Requirement 14c is pinned**: `resubmits the month-to-month switch it loaded, rather than
      clearing it`, in `rent-agreement-edit.component.spec.ts`. The detail fixture carries `true` on
      purpose — a fixture holding `false` could not tell a working edit from one that cleared the
      field.

      **Proved rather than assumed**: with the line removed from `saveEdit`, this was the only
      failure out of 343. That is what makes it a test of the obligation and not of the plumbing.
- [ ] **STOP — review checkpoint.** Report: files changed, the specs added, the gap above, the commit.

#### Flow Card — M0 The switch is offered, sent, and preserved

**Trigger:** creating or editing a lease on the Add/Edit Lease screen.

| # | Where | What happens |
|---|-------|--------------|
| 1 | `rent-agreement-create.component.html` | The checkbox renders only inside the fixed-term block (14a) |
| 2 | `switchToMonthToMonthForSubmission` | **The business rule lives here — 14b.** `false` unless the term is fixed, so a hidden-but-ticked box cannot leak |
| 3 | create payload | Carries the derived value |
| 4 | `saveEdit` | **Always** sends the field (14c) — the deposit's conditional spread is deliberately not copied |
| 5 | `loadAgreement` | Patches the form from the response (14d), which is what lets step 4 resubmit the truth rather than a default |

**Rules covered:** 14a, 14b, 14c, 14d
**Tests:** `sends the month-to-month switch on create when the term is fixed` ·
`sends false when the term is month-to-month, even if the box was ticked first` ·
`resubmits the month-to-month switch it loaded, rather than clearing it`
**Fails when:** the checkbox is moved outside the fixed-term block → it collects an answer the backend
discards · one payload bypasses the helper → a stale `true` is submitted from a hidden control · the
edit stops sending the field → **every unrelated edit silently clears the switch**, and only a user
noticing the box unticked would ever find it
**Start debugging here:** `switchToMonthToMonthForSubmission` — both payloads go through it.

**Reviewer's 10-minute path:** read the helper, then check that `saveEdit` calls it *outside* the
deposit's conditional spread. That difference is the whole of requirement 14c.

---

## Scope & Context Rules

**May be modified:** the four files in the Setup table.

**Must not be modified:** the deposit block's conditional spread — it is conditional for a reason that
does not apply here, and changing it would alter unrelated behaviour. The preview request — the
preview endpoint knows nothing about this flag and does not need to.

### Technical Decisions

**TD1 — Hidden, not disabled.** A disabled control still says the choice belongs on this screen. On a
month-to-month term it does not: the backend discards the answer.

**TD2 — The payload derives the value rather than trusting the control.** A hidden control keeps
whatever it last held, so the ticked-then-switched case would submit a `true` the user can no longer
see. The backend derives the same answer, so nothing stored would be wrong — what would be wrong is
the request claiming something nobody was shown.

**TD3 — One helper, two call sites.** Deriving this separately in the create and edit builders is how
the two drift, and the drift would be invisible until somebody compared two payloads.

**TD4 — The edit sends it unconditionally, unlike the deposit.** The deposit is omitted when locked
because omission leaves the stored value alone. Omitting this one *clears* it. Same-looking code,
opposite meaning, three lines apart — which is why both carry a comment saying so.

---

## Verification

```bash
npx tsc --noEmit -p tsconfig.app.json
npx ng build --configuration development
npx ng test --watch=false --browsers=ChromeHeadless
```

Then, against a live backend on v108 or later: create a fixed-term lease with the box ticked, reload
the edit page and confirm it is still ticked, change only the rent, save, reload again and confirm it
is **still ticked** — that last step is requirement 14c, and it is the one a person can actually
observe failing.

---

## Git & Rollback

| Milestone | Commit | Rollback |
|---|---|---|
| M0 | `feat(rent-agreement): offer and preserve the month-to-month switch (requirement 14)` | Revert. The screen goes back to never sending the field, and the backend stores `false` for every agreement — which is what it did before v108 |

---

## Final Validation

- [x] The checkbox is inside the fixed-term block, not merely disabled outside it.
- [x] Both payload builders call the same helper.
- [x] `saveEdit` sends the field outside the deposit's conditional spread.
- [x] The form is patched from the loaded agreement, with a fallback for an older server.
- [x] A spec covers requirement 14c — the edit resubmits the loaded value, **verified by removing the
      line and watching that one test, and only that test, fail**.
- [ ] The manual reload-edit-reload check above has been run against a live backend.
