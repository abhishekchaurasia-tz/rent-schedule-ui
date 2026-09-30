**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v18

# The drawer shows what the data says, not which screen it is on

The fee drawer decides what to render from **which screen opened it**. The product decision says it
must decide from **the fee and the roster**, and gives the three states it may show. This plan closes
the distance in three slices.

> *"The same drawer everywhere. What it shows is decided by the data, never by which screen it was
> opened from."* — `additional-charge-every-case.html`, prepared for the design follow-up call of
> 24 September 2026.

## 1. Setup & Environment

Repository `rent-schedule-ui`, branch `abhishek/the-cadence-and-the-payload-describe-the-same-fee`
(this plan continues it — the same drawer, the same release).

```
npm ci
npm test -- --watch=false --browsers=ChromeHeadless
```

No backend change. No new endpoint, no new field: the roster, `splitMode` and `isGroupInvoice` are
all already reachable from both screens.

### Prerequisites & Open Questions

- **None blocking.** Every rule here is stated on the product page, including the Edit Terms gap,
  which that page names as work rather than a question.
- **Still open on that page, and not blocked by it:** a design frame for the greyed-out state A, and
  the wording for a fee on the rent invoice. Both are drawings for states this plan builds from the
  text already given.

## 2. Milestone-Based Implementation

### Milestone 1 — Edit Terms hands the drawer its roster (requirement 34)

The lease editor calls `RentAgreementService.getTenants(id)` on load of an existing agreement — the
same call the Add Additional Charge page makes, for the same two facts — and passes `[tenants]` and
`[isGroupInvoice]` to both `<app-additional-charge-panel>` blocks. On the create path there is no
agreement id, so the roster stays empty and the drawer shows state A, which is now true rather than
accidental.

| | |
|---|---|
| Production files | `rent-agreement-create.component.ts`, `rent-agreement-create.component.html` |
| Rules | requirement 34 |
| Tests | `FR34_EditingASavedLease_HandsTheDrawerItsRoster`, `FR34_CreatingALease_HandsTheDrawerAnEmptyRoster` |

**Flow Card** — *trigger:* owner presses **Edit** on a fee from a saved lease's Edit Terms screen.
`rent-agreement-create.component.ts#loadAgreement` → `RentAgreementService#getTenants` →
`rent-agreement-create.component.ts#agreementTenants` (signal) →
`rent-agreement-create.component.html` `[tenants]` → `additional-charge-panel.component.html:344`
`@if (tenants; as roster)` → **`tenant-split-editor.component.ts#rosterRows` — the business rules
live here**. *Fails when:* the drawer shows *"This lease has no renters saved yet"* on a lease that
has renters, and *Split per Tenant* stays disabled. *Start debugging here:*
`rent-agreement-create.component.ts#agreementTenants`.

**Commit:** `fix(ui): edit terms hands the fee drawer its roster`

`STOP — review checkpoint`

### Milestone 2 — A fee on the rent invoice shows its shares, not its setting (requirements 34C, 35)

The panel currently hides the whole split region for an attached fee. Split the one gate in two: the
**mode control** goes, the **share table** stays and turns read-only, and the line
*"No setting — the rent invoice has already decided how many invoices there are and who is on them."*
takes the mode control's place.

| | |
|---|---|
| Production files | `additional-charge-panel.component.html`, `tenant-split-editor.component.ts`, `tenant-split-editor.component.html` |
| Rules | requirements 34C, 35 |
| Tests | `FR35_AFeeOnTheRentInvoice_ShowsNoModeControl`, `FR35_AFeeOnTheRentInvoice_ShowsItsSharesReadOnly`, `FR35_AFeeOnTheRentInvoice_SendsNoModeAndNoShares` |

**Flow Card** — *trigger:* owner ticks **Add it to the rent invoice** on a fee with renters.
`additional-charge-panel.component.html:344` → `tenant-split-editor.component.ts#ridesRentInvoice`
(new input) → **`tenant-split-editor.component.html` — the business rules live here** →
`additional-charge-panel.component.ts#buildRequest` (unchanged: still sends neither).
*Fails when:* ticking the box makes the renters vanish from the drawer, so the owner cannot see what
anyone owes. *Start debugging here:* `tenant-split-editor.component.ts#ridesRentInvoice`.

**Commit:** `fix(ui): a fee on the rent invoice shows its shares and no setting`

`STOP — review checkpoint`

### Milestone 3 — Each renter's caption names where their share lands (requirement 36)

Four captions, not two. `isGroupInvoice` returns to the split editor for the two rent-invoice arms
only — requirement 31 keeps the standalone arms free of it.

| | |
|---|---|
| Production files | `tenant-split-editor.component.ts`, `tenant-split-editor.component.html` |
| Rules | requirement 36 |
| Tests | `FR36_SharedOnItsOwnInvoice_SaysOnOneInvoice`, `FR36_SplitPerTenant_NumbersEachInvoice`, `FR36_OnTheRentInvoiceOfAGroupLease_SaysTheSharedRentInvoice`, `FR36_OnTheRentInvoiceOfAPerRenterLease_SaysTheirOwnRentInvoice` |

**Flow Card** — *trigger:* the drawer renders any roster row.
`tenant-split-editor.component.ts#rosterRows` → **`#shareDestination` — the business rules live
here** → `tenant-split-editor.component.html` caption span. *Fails when:* a renter on a *Split per
Tenant* fee is told *"Billed on its own invoice"* with no count, and a renter on a rent-invoice fee
is told the same thing as one on a standalone fee. *Start debugging here:*
`tenant-split-editor.component.ts#shareDestination`.

**Commit:** `feat(ui): each renter's caption names where their share lands`

`STOP — review checkpoint`

## 3. Scope & Context Rules

**In scope:** the fee drawer and the two screens that open it.

**Out of scope:** the payload. Requirements 28 to 33 already settled what goes on the wire and none of
it changes — a fee on the rent invoice still sends no `splitMode`, no `tenantShares`, no `frequency`.
This plan changes only what is **shown**.

### Technical Decisions

| Decision | Chosen | Rejected | Source |
|---|---|---|---|
| Where the lease editor's roster comes from | `RentAgreementService.getTenants(id)` — the existing call | Deriving it from `scheduleRows[].tenants`, which the terms preview already does | It carries `isGroupInvoice` too, which requirement 36 needs, and reusing one call keeps a second roster shape from existing |
| How state C is expressed | One new input on the split editor, `ridesRentInvoice` | A second component for the read-only state | The table, the chips, the even division and the paid column are identical in all three states; forking them would duplicate the file to change one gate |
| Whether state A survives | Yes, on the create path only | Removing it now that Edit Terms is fixed | A lease genuinely can have no renters; the product decision keeps A and B as separate states for exactly that reason |

## 4. Verification

Per milestone: `npm test -- --watch=false --browsers=ChromeHeadless` green, and the new tests named
above present and passing. The full suite stood at **486** before this plan.

## 5. Git & Rollback

One commit per milestone, each a working state. Rolling back any one leaves the drawer on the
previous state machine and the payload untouched — no migration, no stored data, nothing to undo
server-side.

## 6. Final Validation

**Two existing cases changed, and neither changed its subject.**

| Case | Was | Is | Why |
|---|---|---|---|
| `additional-charge-panel` — *hides the renter control for a fee that rides the rental invoice* | the whole editor is `null` | the editor stays, and `input[name="splitMode"]` count is `0` | It conflated refusing a **typed** figure with hiding a **shown** one. Renamed to *hides the setting but not the shares*. |
| `tenant-split-editor` — *says how each share is billed, from the FEE and not from the lease (FR 31)* | `Billed on its own invoice` / `one invoice for the lease` | `Invoice 1 of 2` / `On one invoice` | Wording only. FR 31 still holds and this case still proves it: the lease flips and the caption does not. |

**One case this work added was then removed**: `FR36_AFeeOnItsOwnInvoice_IgnoresHowTheLeaseBills` asserted exactly what the FR 31 case above already asserts, so it was dropped rather than kept as a second copy.

- [x] Requirements 34, 35 and 36 each named by at least one test. *Eleven `FR3N_` cases across the
      two specs.*
- [x] The drawer reads no screen identity: no `@if` on this panel branches on where it was opened.
      *The only remaining branches are `depositOnly`, which is what the fee **is** rather than where it
      was opened from, and `@if (tenants; as roster)`, which is the roster itself.*
- [x] Edit Terms reaches state B on a lease with renters; the create path still reaches state A.
- [x] A fee on the rent invoice shows a read-only share table and no mode control. *And divides across
      the whole roster, not the renters someone had picked before ticking the box — which the plan did
      not anticipate and the decision’s cases 5 and 6 require.*
- [x] All four captions appear, and `isGroupInvoice` is read only in the two rent-invoice arms. *One
      read site, inside the `ridesRentInvoice` branch of `captions`.*
- [x] The spec's v18 changelog row links to this plan.
