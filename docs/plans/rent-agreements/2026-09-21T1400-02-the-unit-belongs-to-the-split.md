**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v11

# The unit belongs to the split

Three milestones — the third was added once its open question was answered. The first makes the refused payload unrepresentable; the second adds the guard that
would have caught it. They are separate commits because the first is a live defect and should be
bisectable without the guard attached to it.

---

## 1. Setup & Environment

### What is already true entering this plan

- **The split editor is the panel's** (v8), shared by the Add Additional Fee page and the Invoices
  page. Both get this fix; the lease editor passes no roster and renders no split control at all.
- **`isGroupInvoice` is wording only.** It changes one subline in the table and nothing else, so a
  shared lease and a per-tenant lease behave identically here. Confirmed 2026-09-21.
- **The defect is measured, not inferred.** `tenant-split.util.ts` was compiled and run against the
  service's rule as `AdditionalCharge.ValidateTenantShares` implements it:

  | Owner does, `$300`, two renters | Screen | Save | Service |
  |---|---|---|---|
  | switches one row to `%`, types `70` | `210.00 / 90.00` | **enabled** | **422** |
  | types `%` on one row, money on the other | `210.00 / 90.00` | **enabled** | **422** |
  | types `%` on **both** — `70` and `30` | `210.00 / 90.00` | enabled | `201` |

- **No test could catch it.** The only spec sending a percentage —
  `sends sharePercent on a row the owner typed as a percentage` — uses **one renter at `100 %`**,
  which is the single value that cannot fail the total-one-hundred rule. The same blind spot was
  closed on the API side the same week, and found the same way.

### Prerequisites & Open Questions

- [x] ~~**FR 24's disclosure wording needs a decision.**~~ **Answered 2026-09-21 — and the question
      was wrong.** It asked how loudly to warn that switching the unit moves the money, on the
      premise that `100.00 / 100.00 / 100.00` has no expression as three percentages of `300`. It
      has one at **six** decimal places: `33.334 / 33.333 / 33.333` totals a hundred exactly and each
      row resolves back to `$100.00`. So Milestone 3 divides the percentages rather than rounding
      them, and there is nothing left to disclose. Struck rather than deleted, because the
      recommendation recorded here — three decimal places — **was measured and is wrong**: it totals
      a hundred, but the money stops surviving the round trip above roughly `$500`.

---

## 2. Milestone-Based Implementation

### Milestone 1 — The unit belongs to the split

**Requirements:** 18, 20. **Rules:** the service's percentage-total rule (backend BR-07).
**Depends on:** nothing.

> **This is a live defect on the most natural interaction with the control**, not a refactor. One
> renter switched to `%` is a guaranteed `422` from a screen showing correct money.

**Tests first**

- [x] `toTenantShareInputs` sends `sharePercent` on **every** row when the split's unit is percent —
      asserted on a **two-row** split, because a one-row split at `100 %` passes under the defect.
- [x] It sends `sharePercent` on **no** row when the unit is money, including rows the owner typed.
- [x] The percentage sent is **what the owner typed**, not a figure re-derived from the rounded
      amount: `33.334` typed comes back as `33.334`, not `33.33`.
- [x] A split in percent whose rows the owner has not all typed still carries a percentage on each —
      the divided rows carry their derived share, because the unit is the split's.
- [x] Switching the unit converts every row, not the one clicked.

> **Every fixture uses at least two renters and unequal shares.** A one-row split at `100 %` cannot
> fail either rule, which is exactly how this shipped.

**Implementation**

- [x] `TenantShareOverride` and `TenantShareRow` lose the per-row `unit`; the split carries one
      `ShareUnit`.
- [x] `toTenantShareInputs` takes the split's unit and attaches `sharePercent` to every row or none.
- [x] `tenant-split-editor.component` replaces the per-row `<select>` with one control above the
      table and converts every row when it changes.
- [x] **The typed text is kept per row and parsed in the split's unit**, so nothing re-derives a
      percentage the owner did not type.

| Flow Card | |
|---|---|
| **Trigger** | Owner opens the fee panel on a two-renter lease, sets the split to `%`, types `70` |
| **1** | `TenantSplitEditorComponent.setSplitUnit` — converts every row, not one |
| **2** | `buildSplitTable` — reads each row's text in the split's unit |
| **3 — holds the business rules** | `toTenantShareInputs` — `sharePercent` on every row or none |
| **4** | `AdditionalChargePanelComponent.create` emits, the page posts |
| **Fails when** | the payload carries one `sharePercent` and the service answers `422 additional_charge.tenant_share_percentages_do_not_total_one_hundred` |
| **Start debugging here** | `toTenantShareInputs` |

**Commit:** `fix(split): the unit belongs to the split, not the row (FR 18, FR 20)`

**STOP — review checkpoint.**

---

### Milestone 2 — The blocker refuses a percentage that does not total one hundred

**Requirements:** 19. **Depends on:** Milestone 1.

- [x] `splitBlocker` gains a percentage arm, named like the money one — the total, the target, the gap.
- [x] The fee is named first when both are wrong (requirement 23's rule, unchanged).
- [x] Tests: `33.334 / 33.333 / 33.333` totals `100.001` and is refused, while its amounts are exact.

**Commit:** `fix(split): a percentage split that misses a hundred is refused here too (FR 19)`

**STOP — review checkpoint.**

---

### Milestone 3 — The percentages are divided, not rounded

**Requirements:** 17, 24. **Depends on:** Milestone 1.

> **FR 24 as answered, not as drafted.** The disclosure this milestone was going to write turned out
> to be unnecessary once the conversion stopped losing precision.

**Tests first**

- [x] Switching an even `$300` three ways to percentages leaves every renter owing `$100.00` — the
      exact case FR 24 was drafted as a warning for.
- [x] The same on `$1,500`, where three decimal places would still have moved a cent.
- [x] A row the owner typed reads back as the number they typed: `66.67`, never `66.670001`.
- [x] `buildSplitRows` derives percentages totalling exactly `100`.

**Implementation**

- [x] `dividePercentAcross` — divides `100` in proportion to the cents at six places, leftover one
      unit at a time to the **derived** rows in listed order. Computed through `BigInt`, because
      `cents * 100_000_000` leaves the exact range of a `number` on a large enough fee.
- [x] `TenantShareRow.sharePercent` comes from that division instead of per-row rounding.
- [x] `formatPercent` renders the box: full precision, trailing zeros trimmed, so an even two-way
      split reads `50` and a three-way one reads `33.333334`.
- [x] `setSplitUnit` carries `formatPercent(row.sharePercent)` across instead of `toFixed(2)`.

| Flow Card | |
|---|---|
| **Trigger** | Owner sets an even `$300` three-way split to `%` |
| **1** | `TenantSplitEditorComponent.setSplitUnit` — carries `formatPercent(sharePercent)` per row |
| **2 — holds the business rules** | `dividePercentAcross` (**FR 24**, **FR 17**) — `100` divided, residue to the derived rows |
| **3** | `buildSplitRows` — each row's percentage, totalling `100` exactly |
| **4** | `percentageBlocker` finds nothing to refuse; `toTenantShareInputs` sends `33.334 / 33.333 / 33.333` |
| **Fails when** | a renter's amount changes on a change of unit, or the stated set totals `99.99` |
| **Start debugging here** | `dividePercentAcross` |

**Commit:** `fix(split): the percentages are divided, not rounded (FR 24, FR 17)`

**STOP — review checkpoint.**

---

## 3. Scope & Context Rules

- [x] **No backend change and no contract change.** The service already accepts this payload; the page
      could not produce it.
- [x] **The lease editor is untouched.** It passes no roster, so it renders no split control (FR 22).
- [x] ~~**FR 24 is not implemented here.**~~ **Milestone 3 implements it**, once the open question
      was answered and turned out to remove the feature it was asking about.

### Technical Decisions

| Decision | Chosen | Rejected | Source |
|---|---|---|---|
| The unit is the split's | One control above the table | Keep it per row and derive the missing percentages | Deriving would tell the service the owner stated a figure they did not, and derived percentages can total `99.99` — the same refusal by another route |
| Send the typed percentage | What the owner typed | The value re-derived from the rounded amount | `33.334` typed becomes `33.33` re-derived, and three of those total `99.99` |
| Two milestones | Defect, then guard | One commit | The defect should be bisectable without the guard attached |

---

## 4. Verification

Per milestone, before the next one starts:

- [x] `npm test` — green: **450**, up from 435.
- [x] **At least one new fixture uses two or more renters and unequal shares.** A one-row split at
      `100 %` cannot fail the rule it claims to cover.
- [x] The compiled util, run against the service's rule, answers `201` for every scenario in the
      table above.
- [x] `git diff --stat` reviewed — a changed assertion is a finding to report, not a thing to fix.

---

## 5. Git & Rollback

Branch: the current `abhishek/the-owner-types-each-share`, which is 10 commits ahead of `origin/main`.

**Milestone 1 is safe to ship alone** and should be: it removes a guaranteed `422` and narrows nothing.
No saved data is affected — a split that was refused was never stored.

---

## 6. Final Validation

- [x] All three milestones committed, `npm test` green at **453**.
- [x] No payload shape remains that states some percentages and not others.
- [x] FR 24 carried forward as the open question it is, not silently dropped.

---

## Outcome — 2026-09-21

Both milestones shipped. **No backend change and no contract change** — the same fields, in a
combination the service already accepted and this page could not build.

| | |
|---|---|
| `730812d` | the unit belongs to the split, not the row (FR 18, FR 20) |
| `f6cee45` | a percentage split that misses a hundred is refused here too (FR 19) |
| Milestone 3 | the percentages are divided, not rounded (FR 24, FR 17) |

**Tests: 453**, up from 435 entering the plan.

**What the fix actually removed.** Not a rejected save the owner could retry differently — a save
that **could not succeed**, from a screen with nothing wrong on it. One renter switched to `%` was a
guaranteed `422`, and so was a row in `%` beside a row in money. Both shapes are now
unrepresentable rather than validated against, which is the difference between a guard and a design.

**FR 24 dissolved rather than shipped, and the first answer to it was wrong.** An even `$300`
three ways **can** be expressed as percentages — `33.334 / 33.333 / 33.333` gives `100.00` each and
totals a hundred exactly. Only the **two-decimal** figure the page carried across could not, because
`33.33 %` of `300` is `99.99`. The recommendation made at that point was *carry three decimals*,
and measuring it showed that is **wrong**: three totals a hundred, but the money stops surviving the
round trip above roughly `$500`, and a `$1,500` fee across six renters moves a cent. Six places
held for every total measured, to `$12,345.67` across seven — and six is not a guess either, because
`additional_charge_tenant_share.share_percent` is `numeric(9,6)`. **The warning FR 24 was drafted
to write was never written, because there is no longer anything to warn about.**

**The lesson, and it is the same one twice in one week.** The only test in this repository that sent
a percentage used **one renter at `100 %`** — the single value that cannot fail the rule it covers.
The Postman collection on the API side had the same fixture, for the same rule, and the defect on
each side stayed invisible for the same reason. **A fixture that cannot fail the rule it covers is
not covering it.**
