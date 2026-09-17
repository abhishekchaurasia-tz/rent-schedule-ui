**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v7
**Author:** Abhishek Chaurasia · **Created:** 2026-09-17 · **Last updated:** 2026-09-17 by Abhishek Chaurasia

# Plan — the owner types each share

Five slices. The page gains the per-renter split editor the backend has been ready for since
2026-09-17 and has never been sent, then stops reading a response field that is being removed.

**This plan covers the client only.** The service side is planned in its own repository and is not
repeated here — see *Cross-repository dependency* below. Nothing in this document edits C#, a
migration, or the Postman collection.

---

## 1. Setup & Environment

### What you need

- Node and the repo's pinned Angular toolchain — `npm ci`, then `npm test` and `npm run build`.
- The billing service running locally, **on a build that accepts `tenantShares`**. That is backend
  spec `06` v105 onward; before it, the field is dropped silently by the reader's allow-list and the
  save looks successful while storing an even division.

### Commands

```bash
npm ci
npm test
npm run build
```

### Cross-repository dependency (read this before Milestone 5)

| Direction | What |
|-----------|------|
| **This plan needs** | the service accepting `tenantShares` — backend `06` v105, already shipped as `payerShares` and renamed by v109 |
| **The service needs this plan** | its **Milestone 5** drops `tenantIds` from the charge response and moves the split guard onto stored state, and **it is blocked on Milestones 5 and 6 of this plan shipping first** |

The service's plan states that dependency by name. **Milestones 5 and 6 of this plan are the ones that
unblock it**, so they are what to report on when the two teams sync — Milestones 1 to 4 can ship at any
time, because the field they add is additive on a service that already accepts it.

### Prerequisites & Open Questions

- [x] **The even division is of the money, not the percentage.** *Decided by the user across 2026-09-16
      and 2026-09-17, and already implemented server-side.* `$300` across three renters is `100.00`
      each; the leftover cents go one each to the first renters in listed order. The page must match
      this exactly, because a client that divides differently shows the owner one set of numbers and
      saves another.
- [x] **The typed unit is recorded, not derived.** `sharePercent` is sent only when the owner typed a
      percentage. On a `$300` fee, `200.00` typed and `66.67` typed are different rows — `66.67%` of
      `300` is `200.01`.
- [x] **A mismatched total keeps the typed rows.** *Chosen by the user from three options on
      2026-09-17:* show the error, keep what was typed, and offer a reset — never silently correct.
- [x] **Does the lease editor need a split editor? No — but it needs a pass-through.** *Checked in the
      code on 2026-09-17 rather than assumed.* `additional-charge-panel.component.html` mentions
      `tenant` **zero** times and the `.ts` once, in an unrelated comment about descriptions: the lease
      editor has **no tenant picker and no share editor**, and is not getting one. Who pays is authored
      on the standalone page alone, which the charge mapper already states — *"a fee charged to two of
      four tenants, **which only the Add Additional Fee page can create**"*.
      **What it does do is carry the field forward**, and that is why Milestone 6 exists: `PUT …/terms`
      resubmits the complete charge, so an omitted split is a removed split, not an unchanged one.

---

## 2. Milestone-Based Implementation

### Milestone 1 — The split appears when renters are ticked

**Requirements:** 17. **Depends on:** nothing.

A signal deriving one row per ticked renter, with the money divided evenly, rendered read-only. No
editing yet, and nothing changes in what is sent — this slice is about the numbers being **visible and
correct** before they are editable.

- [ ] A `tenantShares` computed signal in `add-additional-charge.component.ts`, deriving from
      `selectedTenantIds()` and the fee total.
- [ ] A `divideEvenly(total, count)` helper: whole cents each, remainder **one cent each to the first
      rows**, never stacked on one.
- [ ] The split table in `add-additional-charge.component.html`, showing name, amount and percentage.

**Tests**

- [ ] `divides $300 across three renters as 100.00 each` — the case that fails if the percentage is
      divided instead of the money.
- [ ] `spreads four leftover cents one each across six renters` — `16.67` four times, then `16.66`
      twice. An implementation handing the whole remainder to one row passes the three-renter test and
      fails here.
- [ ] `re-divides when a renter is unticked`.
- [ ] `shows no split when nobody is ticked` — the shared-by-all case.

| Flow Card | |
|---|---|
| **Trigger** | the owner ticks a renter in the fee panel |
| **1** | `add-additional-charge.component.ts` → `selectedTenantIds` signal |
| **2 — holds the business rules** | `divideEvenly` (requirement 17) |
| **3** | `add-additional-charge.component.html` → the split table |
| **Fails when** | the fee total is zero or empty (no rows, no error) |
| **Start debugging here** | `divideEvenly` |

**Commit:** `feat(charge): the fee panel shows an even per-renter split (FR 17)`

**STOP — review checkpoint.**

---

### Milestone 2 — Each row can be typed, in money or percentage

**Requirements:** 18. **Depends on:** Milestone 1.

- [ ] Both cells become inputs; editing one derives the other for display.
- [ ] Record **which unit was typed** per row — the flag requirement 20 sends.
- [ ] A typed row is not re-divided when another renter is ticked; only untouched rows absorb the
      change. An owner who has fixed one number does not expect the page to undo it.

**Tests**

- [ ] `typing an amount leaves the percentage derived and marks the row as amount-authored`.
- [ ] `typing a percentage marks the row as percent-authored and derives the amount` — `66.67%` of
      `$300` shows `200.01`, not `200.00`.
- [ ] `ticking another renter re-divides only the untouched rows`.

| Flow Card | |
|---|---|
| **Trigger** | the owner types in an amount or percentage cell |
| **1** | the split table's input handlers |
| **2 — holds the business rules** | the per-row authored-unit flag (requirement 18) |
| **3** | the derived counterpart cell |
| **Fails when** | a non-numeric or negative value is typed (row-level message, save still blocked) |
| **Start debugging here** | the authored-unit flag |

**Commit:** `feat(charge): each share is typeable in money or percentage (FR 18)`

**STOP — review checkpoint.**

---

### Milestone 3 — The save is refused until the rows total the fee

**Requirements:** 19. **Depends on:** Milestone 2.

- [ ] Block submission while `Σ amounts ≠ fee total`, naming both figures.
- [ ] A **reset to even split** control, which discards typed rows deliberately and only on click.
- [ ] **Keep the typed rows** on a mismatch.

**Tests**

- [ ] `refuses the save and names the difference when the shares total $290 of a $300 fee`.
- [ ] `keeps every typed row when the total is wrong` — the assertion that fails if the page
      "helpfully" corrects the owner's numbers.
- [ ] `reset restores the even split`.
- [ ] `allows the save when the rows total exactly`.

| Flow Card | |
|---|---|
| **Trigger** | the owner clicks Save with a mismatched split |
| **1** | the submit guard |
| **2 — holds the business rules** | the total check (requirement 19) |
| **3** | the error message and the reset control |
| **Fails when** | the rows total the fee (no block — the intended path) |
| **Start debugging here** | the submit guard |

**Commit:** `feat(charge): a split that does not total the fee blocks the save (FR 19)`

**STOP — review checkpoint.**

---

### Milestone 4 — The split is what gets sent

**Requirements:** 20. **Depends on:** Milestone 3. **First slice that changes the request.**

- [ ] Send `tenantShares`, with `sharePercent` **only** on rows the owner typed as a percentage.
- [ ] Stop sending `tenantIds`.
- [ ] A fee shared by everybody sends **no `tenantShares`** — not an empty array, which the backend
      reader treats the same but which states the meaning less clearly.

**Tests**

- [ ] `sends tenantShares and no tenantIds`.
- [ ] `omits sharePercent on amount-authored rows` — asserted on the property being **absent**, not
      null.
- [ ] `sends no tenantShares when nobody is ticked`.
- [ ] `the sent amounts total the fee` — a property assertion over several fee totals and renter counts.

| Flow Card | |
|---|---|
| **Trigger** | a successful Save |
| **1** | the request builder in `add-additional-charge.component.ts` |
| **2 — holds the business rules** | the `tenantShares` projection (requirement 20) |
| **3** | `POST /api/v1/rent/agreements/{id}/additional-charges` |
| **Fails when** | the service predates v105 (field dropped silently — see Setup) |
| **Start debugging here** | the request builder |

**Commit:** `feat(charge): the typed split is sent as tenantShares (FR 20)`

**STOP — review checkpoint.**

---

### Milestone 5 — The label stops reading a field that is being removed

**Requirements:** 21. **Depends on:** Milestone 4. **This is the milestone the service is blocked on.**

`chargePayerLabel` reads `charge.tenantIds` from the response. The service removes that field, and on
that day the label naming who a fee landed on silently empties — a wrong-looking screen with no error
and no failing test.

- [ ] `chargePayerLabel` names renters from the **saved split**, falling back to *"every renter"* when
      the charge names nobody.
- [ ] Remove `tenantIds` from the UI's charge response model, so nothing can read it again.
- [ ] Tell the service team this has shipped — their Milestone 5 is waiting on it, together with
      Milestone 6 below.

**Tests**

- [ ] `names renters from the saved split`.
- [ ] `says every renter when the charge names nobody`.
- [ ] `the charge response model declares no tenantIds` — a **type-level** assertion. A test that only
      checks the label would still pass with the field present and unread, and the point of this slice
      is that nothing can read it.

| Flow Card | |
|---|---|
| **Trigger** | a saved fee is rendered in the added-fee list |
| **1** | `chargePayerLabel` |
| **2 — holds the business rules** | the split-to-names mapping (requirement 21) |
| **3** | the added-fee list template |
| **Fails when** | a named renter is no longer on the lease (shows the id, as today) |
| **Start debugging here** | `chargePayerLabel` |

**Commit:** `feat(charge): who a fee landed on is read from the split, not tenantIds (FR 21)`

**STOP — review checkpoint.**

---

### Milestone 6 — The lease editor carries the split forward

**Requirements:** 22. **Depends on:** Milestone 4. **No new UI — a mapper and a model.**
**The service is blocked on this milestone as well as on Milestone 5**, and for a sharper reason: its
Milestone 5 adds a guard that refuses a terms save whose charge already holds shares and submits none.
Until this ships, **that guard fires on every lease-editor save** of a lease with a split fee — which is
the guard working exactly as designed, and an unusable screen.

The lease editor authors nothing about who pays, and gains nothing here. It **resubmits** every charge
on a terms save, and an omitted field on that route is a removed field. It carries `tenantIds` today
for exactly this reason; the split inherits the hazard the moment it replaces the array.

- [ ] Add `tenantShares` to the charge model the lease editor reads and resubmits.
- [ ] Carry it in the terms mapper beside `tenantIds`, and **keep the comment explaining why** — it is
      the only place in the client that records this hazard, and it was written after the hazard was
      real.
- [ ] Do **not** add a tenant picker, a split table, or any editing affordance to
      `additional-charge-panel.component`. Who pays stays authored on one screen.

**Tests**

- [ ] `carries a charge's saved split through a terms save untouched` — load a lease whose fee is split
      `200 / 50 / 50`, save the lease changing something else entirely, assert the resubmitted body
      still carries all three shares.
- [ ] `carries no split for a charge that has none` — the shared-by-all case is unchanged.
- [ ] `the lease editor panel renders no tenant control` — a guard against this milestone quietly
      growing into the editor the spec says it must not become.

| Flow Card | |
|---|---|
| **Trigger** | the owner saves the lease editor with an unrelated change |
| **1** | the terms mapper in `rent-agreement.models.ts` |
| **2 — holds the business rules** | carrying `tenantShares` forward (requirement 22) |
| **3** | `PUT /api/v1/rent/agreements/{id}/terms` |
| **Fails when** | the split is dropped — the service answers `422`, never a silent reset |
| **Start debugging here** | the terms mapper |

**Commit:** `fix(lease-editor): a terms save carries the fee's split forward (FR 22)`

**STOP — review checkpoint.**

---

## 3. Scope & Context Rules

**In scope:** `add-additional-charge.component` (`.ts`, `.html`, `.spec.ts`) and the charge request and
response models.

**Out of scope, and in another repository:** every service-side change — the columns dropped, the
`payer` → `tenant` rename, the migrations and the Postman collection. Those are planned in
`innago-rent-accounting` and **must not be carried into this plan or this repository**. A plan spanning
two repositories is a plan neither team can execute; the only thing that crosses the boundary here is
the release-order dependency recorded in Setup.

**Also out of scope:** the lease editor's own charge writer, pending the open question in Setup; the
invoice list's `payerLabel`, which reads an **invoice's** `tenantIds` — a different field on a different
response, untouched by any of this.

### Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Divide money or percentage | **Money** | percentage, then multiply | `$300 / 3` must be `100.00` each. Dividing the percentage yields `99.99 / 99.99 / 100.02`. *Source: user, 2026-09-16.* |
| 2 | Where leftover cents go | **One each to the first rows** | all to the first row; all to the largest | Six renters on `$100` leave four cents; stacking them over-bills one renter by three. *Source: user, 2026-09-17.* |
| 3 | Recording the typed unit | **Per-row flag, `sharePercent` sent only when typed** | always send both; derive on the server | `200.00` and `66.67%` of `$300` are different rows. Mirrors what the service stores. |
| 4 | A mismatched total | **Block, keep the rows, offer reset** | auto-correct; block and clear | An owner who typed three numbers and got one wrong wants all three visible. *Chosen by the user from three options, 2026-09-17.* |
| 5 | Shared-by-all on the wire | **Omit `tenantShares`** | send `[]` | Both are read identically; omission states "not specified" rather than "specified as nobody". |
| 6 | Milestone 5's assertion | **Type-level** | asserting the rendered label only | A label test passes while the field is still declared and merely unread, which is the state this slice exists to leave behind. |

---

## 4. Verification

Run after **every** milestone, before the next begins.

- [ ] `npm test` — all green.
- [ ] `npm run build` — no errors, no new warnings.
- [ ] Manual: tick **two** of three renters on a `$100` fee, confirm `50.00 / 50.00` — a clean divide.
- [ ] Manual: tick **all three**, confirm `33.34 / 33.33 / 33.33` — the odd cent on the first row. This
      is the pair worth checking together: a clean divide passes under either remainder rule.
- [ ] Manual: type `200` on one row of a `$300` three-renter fee, confirm the save is blocked and names
      `$300.00` against the typed total.
- [ ] Manual: save a valid split, reload, confirm the fee names the right renters.

---

## 5. Git & Rollback

Branch: `abhishek/the-owner-types-each-share`.

Each milestone is one commit. Milestones 1–3 are additive UI only and revert with `git revert` alone.

**Milestone 4 changes what is sent** — reverting it returns the page to `tenantIds`, which the service
still accepts, so it is safe in either direction while the service is on v105–v108.

**Milestones 5 and 6 are the coupled ones.** Once the service has dropped `tenantIds` from the response,
reverting Milestone 5 restores a read of a field that no longer exists and empties the label. After the
service's Milestone 5 ships, **roll forward rather than back**.

---

## 6. Final Validation

- [ ] All five milestones committed, `npm test` and `npm run build` green.
- [ ] Requirements 17–21 each named by at least one test.
- [ ] The page sends `tenantShares` and never `tenantIds`.
- [ ] The charge response model declares no `tenantIds` member.
- [ ] The service team has been told Milestones 5 and 6 shipped, so their Milestone 5 can start.
- [ ] The open question about the lease editor is answered, or carried forward explicitly.
