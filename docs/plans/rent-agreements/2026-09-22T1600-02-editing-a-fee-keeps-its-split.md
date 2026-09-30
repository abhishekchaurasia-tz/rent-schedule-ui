**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v15

# Editing a fee keeps its split

One milestone. The editor gains a seed, the panel passes one, and five pieces of the owner's work
stop disappearing.

**The defect, in one line:** press **Edit** on a fee split `200 / 100` and the table opens blank; save
and it is `150 / 150`, with nothing said.

---

## 1. Setup & Environment

**Repo:** `rent-schedule-ui`. **Branch:** `abhishek/the-mode-goes-on-the-wire` (spec v15 sits on it).

**No contract change and no service change.** Everything FR 27 restores is already on the
`AdditionalChargeCreationRequest` the panel is handed.

### Prerequisites & Open Questions

- [x] **Does anything but the wizard pass `initialCharge`?** *No — verified by grep 2026-09-22.* Only
      `rent-agreement-create.component.html`, twice. `POST …/additional-charges` and the Invoices page
      never do, so no saved fee travels this path.
- [x] **Should the mode be restored without the figures?** *No.* Restoring the mode alone says who owes
      a division that is no longer on screen, which is worse than restoring neither. All five go
      together or none do.
- [ ] **STILL OPEN. Should a *server* response drive the control?** Out of scope, and unchanged by this
      plan. It becomes a question the day `add-additional-charge` or the Invoices page offers Edit.

### What the code actually looks like now, read before planning

> `applyInitialCharge` restores notes, amount, dates, recurrence and items. It contains **no**
> reference to `tenantShares`, `splitMode` or the split state — verified by reading the method, not by
> grep alone.
>
> `<app-tenant-split-editor>` takes four inputs: `tenants`, `feeTotal`, `alreadyPaid`,
> `isGroupInvoice`. **None of them says what was typed.** The editor holds five signals the reopen
> destroys: `mode`, `selectedTenantIds`, `splitUnit`, `amountOverrides`, `paidOverrides`.
>
> So this is not a bug inside a method; it is a missing input. The fix is the input, and everything
> else follows from it.

---

## 2. Milestone-Based Implementation

### Milestone 1 — The editor can be seeded, and the panel seeds it

**Requirements:** FR 27. **Depends on:** nothing.

**Tests first**

- [x] `reopening a fee restores its typed shares` — **the measured defect**. `200 / 100` comes back as
      `200 / 100`, not as the even division.
- [x] `reopening a fee restores its mode` — a fee saved *Shared Lease* with figures reopens on Shared,
      which is the case that would otherwise silently become named on the next save.
- [x] `reopening a percentage split restores the unit` — the rows carry `sharePercent`, so the editor
      opens in percent and the boxes read what was typed rather than the money it works out to.
- [x] `reopening restores the paid figures` — added in v9 and lost with everything else.
- [x] `reopening a fee that names a subset ticks exactly that subset`.
- [x] `opening a fresh panel seeds nothing`, asserted directly, so the seed cannot start leaking into
      the add path.

**Implementation**

- [x] `TenantSplitEditorComponent` gains one input carrying the stored rows and the mode. It is applied
      **once per seed**, not on every change — a seed that re-applied itself would fight the owner's
      typing.
- [x] The panel passes it from `initialCharge`, and passes nothing for a fresh add.
- [x] The unit is **derived from the rows**, not stored: rows carrying `sharePercent` were authored in
      percent, which is the same convention the service uses (`share_percent` null means authored as
      an amount, BR-06).

| Flow Card | |
|---|---|
| **Trigger** | Wizard, a `$300` fee typed `200 / 100`, the owner presses **Edit** |
| **1** | `rent-agreement-create.component` — sets `editingChargeIndex`, passes `[initialCharge]` |
| **2** | `AdditionalChargePanelComponent.applyInitialCharge` — restores the form, and now the split too |
| **3 — holds the business rule** | the editor's seed input (**FR 27**) — mode, ticks, unit, shares, paid |
| **4** | the owner changes the notes and saves; the split goes out exactly as it came in |
| **Fails when** | the table opens blank, or opens in the wrong unit, or the mode flips |
| **Start debugging here** | `AdditionalChargePanelComponent.applyInitialCharge` |

**Commit:** `fix(split): editing a fee keeps its split (FR 27)`

**STOP — review checkpoint.**

---

## 3. Scope & Context Rules

- [x] **The add path is not touched.** A fresh panel seeds nothing and must keep behaving exactly as it
      does; this is asserted, not assumed.
- [x] **No service change, no contract change.** Every restored value is already on the request object.
- [x] **The blocker, the reset and the even division are not touched.** A seeded split is the owner's
      own figures, so the same rules apply to it as to figures typed a moment ago.

### Technical Decisions

| Decision | Chosen | Rejected | Source |
|---|---|---|---|
| How the editor learns the split | one seed input | reading `initialCharge` itself | the editor has three hosts and must not know about any of them |
| When the seed applies | once | on every change | a seed that re-applies fights the typing |
| Where the unit comes from | derived from `sharePercent` | a sixth stored field | the service already uses that convention (BR-06) |

---

## 4. Verification

- [x] `npm test` — **474 green, headless**, from a baseline of 468. *(There is no lint target in this repo, so only the suite was run.)*
- [x] **One case reopens a fee and asserts the request body after saving**, so the round trip is
      covered rather than just the editor's internal state.
- [x] **One case uses an uneven split**, so a restored table cannot pass by coincidentally matching the
      even division.
- [x] `git diff --stat` reviewed — a changed assertion is a finding to report, not a thing to fix.

---

## 5. Git & Rollback

One commit. Reverting it restores today's behaviour, which is the loss — so the rollback is only for
a defect in the fix, never for the fix itself.

---

## 6. Final Validation

- [x] All five lost pieces come back, each named by a test.
- [x] A fresh add is unchanged.
- [x] The seed does not re-apply while the owner types.
