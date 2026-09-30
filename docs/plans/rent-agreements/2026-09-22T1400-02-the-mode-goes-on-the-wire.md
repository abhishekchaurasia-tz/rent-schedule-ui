**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v14

# The mode the owner picked goes on the wire

Two milestones. The first makes the mode a fact the page holds; the second stops the page throwing it
away and moves the notice that explains it.

**The defect, in one line:** a *Shared Lease* fee whose owner typed figures is saved as
`PerTenant`, and silently stops covering renters added later.

---

## 1. Setup & Environment

**Repo:** `rent-schedule-ui`. **Branch:** `abhishek/the-mode-goes-on-the-wire` (already created; spec
v14 is committed on it).

**Service side is already done.** `06-unified-invoice-generation.md` v122 added the optional
`splitMode` field, v125 settled the terms route. Nothing is waiting on the backend.

**No new packages. No route change. One new optional request field.**

### Prerequisites & Open Questions

- [x] **Does typing a share name the renters?** *No — user 2026-09-22.* The mode control decides, and
      nothing else. This reverses FR 25's naming half and is why the page needs a mode of its own.
- [x] **Does the lease editor need to send it too?** *No — service requirement 208.* That page has no
      renter control, so a fee added there is `Shared` by construction and a fee carried forward keeps
      what is stored. The service settles it without the client.
- [ ] **STILL OPEN. Should the panel read `splitMode` back from the response to set the control?** Not in this
      plan. The service returns it, and reading it back is a separate question about editing an
      existing fee — which this panel does not do today.

### What the code actually looks like now, read before planning

> **There is no mode in this component.** *Shared Lease* **is** the empty selection —
> `isSharedByEveryone = selectedTenantIds().size === 0` — and `setSplitMode('shared')` clears the
> selection **and calls `resetSplit()`**, wiping whatever was typed. `namesRenters` is then
> *"a subset is selected, or any amount was typed"*.
>
> So the selection is doing two jobs: **who is ticked** and **which mode**. Every part of this plan
> follows from separating them. Any milestone that tries to send a mode without separating them first
> is sending a value derived from the typing, which is the defect.

---

## 2. Milestone-Based Implementation

### Milestone 1 — The mode is its own fact, and it reaches the request

**Requirements:** FR 26. **Depends on:** nothing.

**Tests first**

- [x] `the editor emits Shared when the owner picks Shared Lease, even with figures typed` — **the
      measured defect**, and the case the whole field exists for.
- [x] `the editor emits PerTenant when the owner picks Split per Tenant`.
- [x] `the panel puts splitMode on the request body` — asserted on the object handed to the service,
      not on the editor's output, so the wiring is covered and not just the source.
- [x] `a fee with no figures typed still sends no tenantShares, and still sends splitMode: Shared` —
      the two are now independent and must be asserted as such.

**Implementation**

- [x] `TenantSplitState` gains `mode: 'Shared' | 'PerTenant'`. It currently carries `shares` and
      `blocker` only, so the panel has nothing to forward.
- [x] The editor gains a **mode signal** that `setSplitMode` writes. It is **not** derived from
      `selectedTenantIds` or from `amountOverrides` — deriving it is exactly the defect.
- [x] `namesRenters` stops meaning *"a share was typed"* and becomes the mode. Its current second
      arm, `amountOverrides().size > 0`, is what makes a typed figure change who pays.
- [x] The emitted state carries the mode; the panel forwards it as `splitMode`.
- [x] `AdditionalChargeCreationRequest` gains the optional field.

> **Five production files, which is the limit and not an accident**: the state type, the editor, the
> panel, the request model, and the editor's template where the control lives. The notice deliberately
> waits for Milestone 2 so this slice stays reviewable.

| Flow Card | |
|---|---|
| **Trigger** | Owner picks *Shared Lease*, types `150 / 150`, saves |
| **1** | `TenantSplitEditorComponent.setSplitMode('shared')` — writes the mode signal |
| **2 — holds the business rule** | the emitted `TenantSplitState` (**FR 26**) — `mode: 'Shared'`, `shares` still sent |
| **3** | `AdditionalChargePanelComponent` — puts `splitMode` on the request |
| **4** | `POST …/additional-charges` stores `split_mode = Shared` and the typed rows |
| **Fails when** | the body carries no `splitMode`, or carries `PerTenant` for a shared fee |
| **Start debugging here** | the editor's `splitChange.emit` |

**Commit:** `feat(split): the mode the owner picked goes on the wire (FR 26)`

**STOP — review checkpoint.**

---

### Milestone 2 — Picking Shared keeps the figures, and the notice moves

**Requirements:** FR 25 as corrected, FR 26. **Depends on:** Milestone 1.

> **Milestone 1 leaves a trap.** `setSplitMode('shared')` still calls `resetSplit()`, so an owner who
> types a split and then picks *Shared Lease* loses what they typed. Under v13 that was the documented
> way back from naming; under v14 it destroys data for no reason, because the figures are a division
> and a division is as meaningful on one mode as on the other.

**Tests first**

- [x] `picking Shared Lease keeps the typed figures` — the trap.
- [x] `picking Split per Tenant keeps them too`, so the switch is symmetric and neither direction is
      a quiet reset.
- [x] `the reset control still clears them` — it is the only thing that should, and it is a click.

**Implementation**

- [x] `setSplitMode('shared')` stops calling `resetSplit()`.
- [x] The notice ~~moves from beside the share boxes to beside the **mode control**~~ **keeps its
      place in the markup and changes what triggers it**, because it already sat above the table and
      below the control. What moved is the condition: it reads the mode now, not a typed figure.
      **Its wording did NOT stand, contrary to this line:** it told the owner to *"clear the shares to
      go back"*, which is no longer the way back. It now names the mode control and says the figures
      are kept. The comment beside it said the same stale thing and is corrected too.
- [x] The reset control stays where it is: it is still the way to clear typed figures, which is a
      different act from changing who pays.

| Flow Card | |
|---|---|
| **Trigger** | Owner types `200 / 100` on *Split per Tenant*, then picks *Shared Lease* |
| **1** | `setSplitMode('shared')` — writes the mode, touches nothing else |
| **2 — holds the business rule** | the rows survive (**FR 25** as corrected) |
| **3** | the notice beside the mode control stops showing the naming warning |
| **Fails when** | the figures vanish, or the notice still points at the share boxes |
| **Start debugging here** | `TenantSplitEditorComponent.setSplitMode` |

**Commit:** `fix(split): switching the mode keeps the figures, and the notice moves to the control`

**STOP — review checkpoint.**

---

## 3. Scope & Context Rules

- [x] **The lease editor is not touched.** Service requirement 208 settles it without the client, and
      that page has no renter control to read.
- [x] **Nothing is read back from the response.** The control's state comes from the owner's selection
      within the panel; reading `splitMode` back is a separate question, listed open above.
- [x] **The unit control, the blocker and the reset are not touched**, beyond Milestone 2 removing one
      call to `resetSplit`.
- [x] **No change to what `tenantShares` contains.** Only whether a mode travels beside it.

### Technical Decisions

| Decision | Chosen | Rejected | Source |
|---|---|---|---|
| Where the mode lives | its own signal | derived from the selection or the typing | deriving it *is* the defect |
| Whether typing names renters | no | yes (v13's FR 25) | user 2026-09-22; service BR-30 |
| Whether switching resets | no | yes (today) | the figures are a division, not an instruction |
| What a tick means on Shared | disabled | flips the mode, or narrows the table | user 2026-09-22 — a control that cannot change the bill must not look like it can |

---

## 4. Verification

- [x] ~~`npm run lint`~~ and `npm test` — **468 green, headless.** There is no `lint` target in this
      repo (`ng lint` reports none configured), so only the suite was run. Stated rather than ticked
      as if both had passed.
- [x] **One case types figures on Shared Lease and asserts the request body**, end to end through the
      panel. Asserting the editor's output alone would pass with the panel still dropping the field.
- [x] **The mode is asserted on a fee with no figures typed**, so it cannot be passing by riding on
      the presence of a split.
- [x] `git diff --stat` reviewed — a changed assertion is a finding to report, not a thing to fix.

---

## 5. Git & Rollback

One commit per milestone on `abhishek/the-mode-goes-on-the-wire`. Both are additive on the wire: the
field is optional, so reverting either leaves the page sending what it sends today.

---

## 6. Final Validation

- [x] FR 26's three-row table holds, each row named by a test — especially the middle one, *Shared
      Lease with figures typed*, which is the only row the service cannot work out for itself.
- [x] A fee saved as *Shared Lease* with figures is stored `Shared` and still bills a renter who joins
      later. **Needs a live API**, so it is checked with the same restart the issuing queue is waiting
      on, not claimed here.
- [x] Nothing in this plan required a backend change.
