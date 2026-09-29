**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v17

# The cadence and the payload describe the same fee

Five milestones. The first is one expression and fixes the oldest defect on this panel; the rest follow
the billing service's reversal onto the screen.

**The defect, in one line:** the Frequency picker renders on the fee that raises its **own** invoice
and the payload sends the frequency on the fee that **rides the rent invoice** — opposite conditions
that have never once described the same fee.

```
  standalone recurring -> picker offers six cadences -> owner picks Weekly -> null is sent
  attached recurring   -> picker hidden              -> stale 'monthly'    -> sent
```

---

## 1. Setup & Environment

**Repo:** `rent-schedule-ui`. **Branch:** a new branch off `main`; spec v17 is committed on it first.

**The service side is done and merged behind this.** `01-rent-agreement.md` v118 (FR-136 to FR-138) and
`06-unified-invoice-generation.md` v128/v129 (requirements 209 to 215) are implemented and green. This
plan changes no contract — every rule here is a condition on fields the request already carries.

**No new packages. No route change. No new request field.**

### Prerequisites & Open Questions

- [x] **Which shape carries a cadence now?** *The one that raises its own invoice — FR-136, reversing
      FR-088.* The screen was already right; the payload was written to the old rule.
- [x] **May the owner type figures on a Shared fee?** *No — service requirement 211.* Both Shared and
      attached fees resolve their payers from the live roster when they bill, so anything typed is
      correct only until the roster moves.
- [x] **May a Split per Tenant fee sit on a lease that bills as a group?** *Yes — BR-05 as reversed,
      requirement 209.* The fee decides its own shape and may disagree with the lease.
- [x] **A-1 — can this screen tell that a fee has taken money?** *Yes — answered 2026-09-29.* The
      response carries `isApplied`, and this repo's model has held it all along. Its name is older than
      its meaning: the service's FR-134 narrowed it from *"any invoice line references this charge"* to
      *"has taken a payment"*, which is exactly the line requirement 33 freezes on. No API change was
      needed; the service's own documentation described the wide rule and was corrected in the same pass.
- [x] **D-5 — the fee panel on a lease that has no renters yet.** *Settled on the client page, and already
      built.* That page proposes *"the setting shown with **Split per Tenant** greyed out and a line
      saying when it becomes available"*, and `tenant-split-editor` has done exactly that since before
      this plan: the radio is disabled on an empty roster and the note reads *"This lease has no renters
      saved yet, so the fee is charged to the lease itself."*
      **Outstanding is the design frame for that state, not the behaviour.**

### What the code actually looks like now, read before planning

| Where | What is there |
|---|---|
| `additional-charge-panel.component.html:146` | `@if (!form.get('attachedWithRentalInvoice')!.value)` — the picker, on the standalone fee |
| `additional-charge-panel.component.ts:808` | `frequency: isRecurring && ridesRentalInvoice ? value.frequency : null` — the payload, on the attached fee |
| `additional-charge-panel.component.ts:805` | a comment citing FR-088, which is the rule that reversed |
| `tenant-split-editor.component.html:2` | the mode control, rendered for every fee |
| `tenant-split-editor.component.html:84` | *"the figures you typed are kept"* — they are now refused |
| `tenant-split-editor.component.html:173,214` | the amount and paid boxes, editable in both modes since v13 |

---

## 2. Milestone-Based Implementation

### Milestone 1 — The payload follows the picker

**Requirements:** 28. **One expression.**

`frequency` and `frequencyConfig` are sent when the fee recurs and does **not** ride the rent invoice —
the same condition the template already uses to show the picker.

**Production files (1):**

1. `src/app/rent-agreements/additional-charge-panel.component.ts` — the two payload lines, and the
   FR-088 comment above them

**Tests:**

- `FR28_AStandaloneRecurringFee_SendsTheCadenceTheOwnerPicked`
- `FR28_AnAttachedRecurringFee_SendsNoCadence`
- `FR28_AOneOffFee_StillSendsNoCadence`

**Flow Card**

| | |
|---|---|
| **Trigger** | the owner saves a recurring fee from the fee panel |
| 1 | `additional-charge-panel.component.html` — the picker, shown on the standalone fee |
| 2 | `buildFrequencyConfig(value)` — builds the shape the picked frequency calls for |
| 3 | `additional-charge-panel.component.ts` `submit()` — **holds the business rule**: which fee carries a cadence |
| 4 | `POST …/additional-charges` |
| **Fails when** | a weekly fee is refused with `422` for a missing frequency, or an attached fee is refused for carrying one |
| **Start debugging here** | `additional-charge-panel.component.ts` `submit()` |

**Commit:** `fix(charge): the cadence the owner picks is the cadence that is sent`

---

### Milestone 2 — A fee on the rent invoice offers no split and no mode

**Requirements:** 29.

The mode control and the split table are hidden when `attachedWithRentalInvoice` is true, and the
request carries neither `splitMode` nor `tenantShares` for that shape.

**Production files (2):**

1. `src/app/rent-agreements/additional-charge-panel.component.html` — the split editor's `@if`
2. `src/app/rent-agreements/additional-charge-panel.component.ts` — the two payload fields

**Tests:**

- `FR29_AnAttachedFee_ShowsNoModeControlAndNoSplitTable`
- `FR29_AnAttachedFee_SendsNeitherSplitModeNorTenantShares`
- `FR29_SwitchingToAttached_ClearsATypedSplitRatherThanSendingIt`

**Flow Card**

| | |
|---|---|
| **Trigger** | the owner ticks *attached to the rent invoice* |
| 1 | `additional-charge-panel.component.html` — **holds the business rule**: which controls a fee of this shape offers |
| 2 | `tenant-split-editor.component.ts` — not rendered, so it holds nothing |
| 3 | `additional-charge-panel.component.ts` `submit()` — omits both fields |
| **Fails when** | the owner types a split, ticks attached, saves, and gets a `422` naming a field they can no longer see |
| **Start debugging here** | `additional-charge-panel.component.html` |

**Commit:** `fix(charge): a fee on the rent invoice offers no split of its own`

---

### Milestone 3 — The share boxes are read-only unless the fee is Split per Tenant

**Requirements:** 30, correcting 25.

**Production files (2):**

1. `src/app/rent-agreements/tenant-split-editor.component.html` — the boxes' `[disabled]`, and the
   notice under the table
2. `src/app/rent-agreements/tenant-split-editor.component.ts` — the computed that decides it

**The boxes stay.** The service computes the division and stores it, so the owner sees what each renter
will owe; what they may no longer do is type over it.

**Tests:**

- `FR30_ASharedFee_ShowsTheDivisionAndRefusesEdits`
- `FR30_ASplitPerTenantFee_StillTakesTypedFigures`
- `FR30_SwitchingToShared_SaysTheRosterDividesItRatherThanThatFiguresAreKept`

**Flow Card**

| | |
|---|---|
| **Trigger** | the owner picks *Shared Lease* |
| 1 | `tenant-split-editor.component.ts` — **holds the business rule**: who may type a figure |
| 2 | `tenant-split-editor.component.html` — the boxes, disabled and still showing the division |
| 3 | `additional-charge-panel.component.ts` `submit()` — sends no typed split for this mode |
| **Fails when** | an owner types 200/100 on a Shared fee, saves, and the save is refused — or worse, succeeds and is overwritten when the roster moves |
| **Start debugging here** | `tenant-split-editor.component.ts` |

**Commit:** `fix(charge): only a fee split per tenant takes typed figures`

---

### Milestone 4 — The mode is not gated on the lease, and attaching needs rent

**Requirements:** 31, 32.

Both modes are offered whatever `isGroupInvoice` says; the attach toggle is disabled, with its reason
beside it, when the lease bills no rent.

**Production files (2):**

1. `src/app/rent-agreements/tenant-split-editor.component.ts` — remove any read of `isGroupInvoice`
   that gates the mode
2. `src/app/rent-agreements/additional-charge-panel.component.html` — the attach toggle's disabled
   state and its reason

**Tests:**

- `FR31_AGroupLease_StillOffersSplitPerTenant`
- `FR31_APerTenantLease_StillOffersSharedLease`
- `FR32_AZeroRentLease_DisablesTheAttachToggleAndSaysWhy`
- `FR32_ALeaseThatBillsRent_StillOffersIt`

**Flow Card**

| | |
|---|---|
| **Trigger** | the fee panel opens on a lease |
| 1 | `additional-charge-panel.component.ts` — reads the lease's `fullRent` |
| 2 | `additional-charge-panel.component.html` — **holds the business rules**: which controls are offered |
| 3 | `tenant-split-editor.component.ts` — offers both modes regardless of how the lease bills |
| **Fails when** | an owner cannot name renters on a group lease, or ticks attach on a rent-free lease and the fee bills nothing for the life of the agreement |
| **Start debugging here** | `additional-charge-panel.component.html` |

**Commit:** `fix(charge): the fee's shape is its own, and attaching needs a rent invoice`

---

### Milestone 5 — A paid fee's mode and renters are read-only

**Requirements:** 33. **Blocked on A-1.**

**Do not start this milestone until A-1 is answered.** If the response cannot say a fee has taken
money, the milestone is the error-handling half alone: report the `422` verbatim, keep the authored fee
on screen, and record that the read-only state is deferred.

**Production files (1 or 2, depending on A-1):**

1. `src/app/rent-agreements/tenant-split-editor.component.ts` — the read-only state
2. `src/app/rent-agreements/additional-charge-panel.component.ts` — the refusal's message, if A-1 is no

**Tests:**

- `FR33_APaidFee_LocksTheModeAndTheRenters`
- `FR33_APaidFee_StillTakesAnAmountEdit`
- `FR33_TheRefusal_IsReportedVerbatimAndKeepsTheAuthoredFee`

**Flow Card**

| | |
|---|---|
| **Trigger** | the owner reopens a fee that has taken a payment |
| 1 | `additional-charge-panel.component.ts` `applyInitialCharge` — reads whether it is paid |
| 2 | `tenant-split-editor.component.ts` — **holds the business rule**: what is frozen and what is not |
| 3 | `PUT …/terms` — refuses a moved mode or payer set with `422` |
| **Fails when** | the whole fee is locked, putting back the all-or-nothing lock the service deliberately removed |
| **Start debugging here** | `tenant-split-editor.component.ts` |

**Commit:** `fix(charge): a paid fee keeps who owes it, and still takes a reprice`

---

## 3. Scope & Context Rules

**In scope:** the fee panel and its split editor, on every screen that opens them.

**Out of scope:** the lease editor's pass-through of a saved split (requirement 22, unchanged); the
Invoices page's own use of the panel, which inherits every change here and needs none of its own; and
anything about how the service divides, which is settled and merged.

### Technical Decisions

| Decision | Chosen | Rejected, and why |
|---|---|---|
| Which condition wins for the cadence | The template's | The payload's — the template already matches FR-136, so following it is one expression instead of a layout change |
| The share boxes on a Shared fee | Shown, read-only | (a) Hidden — the division is real and worth seeing; the service computes and stores it. (b) Left editable — the service refuses it, so the screen would be inviting a `422` |
| Where the mode control lives | Unchanged, in the split editor | Moving it beside the attach toggle — it belongs to the split it governs, and moving it would touch every screen that opens the panel for no rule |
| The attach toggle on a rent-free lease | Disabled, with its reason | Left enabled to fail on save — the refusal is knowable before the owner types the fee |
| Milestone 5's position | Last, and blocked | Earlier — it is the only one that needs a field the response may not carry, and the other four should not wait on it |

---

## 4. Verification

Per milestone: `npm test` green, and the new tests named for their requirement ids.

End to end, against a running billing service:

1. A standalone weekly fee saves, and the response carries `frequency: "Weekly"`.
2. An attached fee saves, and the response carries no `frequency`, no `splitMode`, no `tenantShares`.
3. A *Split per Tenant* fee on a group lease saves with the typed figures.
4. A *Shared* fee shows the division and takes no typing.
5. A rent-free lease offers no attach toggle.

---

## 5. Git & Rollback

One branch, one commit per milestone, each a working state. Milestone 1 is independently revertable and
is the one worth shipping first if the rest slips — it fixes a defect that predates every other rule
here.

---

## 6. Final Validation

- [ ] Requirements 28 to 33 each named by at least one test.
- [ ] The picker's condition and the payload's condition are the same expression.
- [ ] No control on this panel reads `isGroupInvoice` to decide what the fee may be.
- [ ] The notice under the split table no longer promises that typed figures are kept.
- [ ] A-1 answered, or Milestone 5 explicitly deferred with the reason on the record.
- [ ] The spec's v17 changelog row links to this plan.
