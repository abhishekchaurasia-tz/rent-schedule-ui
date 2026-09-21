**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v13

# Naming a share is a decision, so the page makes it one

One milestone. The share boxes move onto both modes, and the thing that used to be implied by which
radio you picked becomes something the owner does on purpose and is told the cost of.

---

## 1. Setup & Environment

### What is already true entering this plan

- **The percentage control works** (v11, v12) and lives only on *Split per Tenant*. The user looked
  for it on *Shared Lease*, which is where the name says it should be, and asked for the same
  capability there.
- **The two modes are not cosmetic**, and this is the finding the plan turns on. Measured in
  [BillingOccurrenceRecomputeService.cs:394-400](../../../src/app/rent-agreements/../../../../innago-rent-accounting/src/Innago.Billing.Application/RentAgreements/Common/BillingOccurrenceRecomputeService.cs):

  | The fee | How its payers resolve | A renter who joins later |
  |---|---|---|
  | carries **no** split | against the **live roster**, on every invoice built | **is charged it** |
  | **names** renters | `named.Where(roster.Contains)` — an intersection | **is never added** |

  A named fee only ever shrinks. So *"shared by everyone, now and later"* and *"Alice 60 %, Bob 40 %"*
  cannot both hold, and hiding the boxes on one mode is how the page has been avoiding saying so.
- **Nothing in the service changes.** The body this produces is one it already accepts.

### Prerequisites & Open Questions

- [x] **What happens to a renter who joins after shares are named?** *Decided by the user 2026-09-21:
      the fee names the current renters and stops covering later ones, and the page says so.* The
      alternative — a live roster with stated percentages — needs weights that re-normalise, a rule
      for what a joiner is owed, and a backend storing something other than a row per named tenant.
      Recorded in the spec as rejected rather than left as a maybe.

---

## 2. Milestone-Based Implementation

### Milestone 1 — The boxes are on both modes, and naming is disclosed

**Requirements:** 25, 5. **Depends on:** nothing.

**Tests first**

- [x] Shared Lease renders the whole roster with share boxes and the unit control, and while nothing
      is typed it still reports `shares: undefined` — the fee is genuinely shared.
- [x] Typing one share in Shared Lease makes the fee name **every** renter shown: the full split goes
      out, not a single row.
- [x] The same in percent: typing `60` on one of two renters sends `60 / 40`, both rows stated.
- [x] The naming notice appears exactly when the fee names renters, and not before.
- [x] Clearing the shares returns the fee to shared — `shares: undefined` again.
- [x] Choosing a subset on Split per Tenant still names them with nothing typed, unchanged.

**Implementation**

- [x] `namesRenters` — a computed: a subset is selected, **or** any share has been typed. It replaces
      `isSharedByEveryone()` as the thing that decides what goes on the wire.
- [x] The rows are built over the **whole roster** while shared, so there is something to type into.
- [x] `splitChange` emits `undefined` shares until `namesRenters`, and the blocker stays silent while
      there is no split to check.
- [x] The template drops the `@if (!isSharedByEveryone())` around the unit control and the table, and
      gains the notice.

| Flow Card | |
|---|---|
| **Trigger** | Shared Lease on a two-renter lease; owner sets `%` and types `60` on the first row |
| **1** | `TenantSplitEditorComponent.typeShare` — records the text |
| **2 — holds the business rules** | `namesRenters` (**FR 25**, **FR 5**) — typed ⇒ the fee names these renters |
| **3** | `toTenantShareInputs` — the **whole** split goes out, `60 / 40` |
| **4** | The notice renders: a renter added later will not be charged this fee |
| **Fails when** | one row goes out alone, or the notice is absent while a share is typed |
| **Start debugging here** | `namesRenters` |

**Commit:** `feat(split): the share boxes are on both modes, and naming is said out loud (FR 25, FR 5)`

**STOP — review checkpoint.**

---

## 3. Scope & Context Rules

- [x] **No backend change, no contract change.**
- [x] **The lease editor is untouched** — it passes no roster and renders no split control (FR 22).
- [x] **The live-roster-plus-percentages design is rejected, not deferred.** It is a different
      feature and the spec says so.

### Technical Decisions

| Decision | Chosen | Rejected | Source |
|---|---|---|---|
| What makes a fee "named" | A subset selected **or** any share typed | The mode radio alone | The radio was standing in for a decision the owner could not see; typing a figure is the decision |
| A renter who joins later | Not charged a named fee, and the page says so | Weights that re-normalise | User 2026-09-21; the alternative needs a new backend concept and reopens BR-01 |
| The way back to shared | Clearing the shares | A separate "make this shared again" action | One control fewer, and it is the same gesture that named them |

---

## 4. Verification

- [x] `npm test` — green at **460**, up from 453 entering this plan.
- [x] Shared Lease with nothing typed still sends **no** `tenantShares`.
- [x] One keystroke in Shared Lease sends **every** row, never one.
- [x] `git diff --stat` reviewed — a changed assertion is a finding to report, not a thing to fix.

---

## 5. Git & Rollback

Branch: the current `abhishek/the-owner-types-each-share`.

**Nothing stored changes shape.** The fee either sends a split or does not, exactly as before; what
changes is which gestures produce which. Reverting restores the hidden choice, not a broken one.

---

## 6. Final Validation

- [x] FR 25 covered by tests naming both arms — shared while untouched, naming once typed.
- [x] The notice's wording matches what the recompute actually does, checked against the intersection
      in `BillingOccurrenceRecomputeService`.
