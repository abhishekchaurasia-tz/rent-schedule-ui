**Spec:** [`docs/specs/rent-agreements/06-add-tenants-ui.md`](../../specs/rent-agreements/06-add-tenants-ui.md) — v2

# A removal says which fees it reaches

Removing a renter stops a *Split per Tenant* fee from using the figures the manager typed. The screen
where the removal happens says nothing about it.

> *"Row 2 is the one place a manager can still be surprised, and it is the only one left on this page…
> **Should the manager be told when this happens — on the screen where they removed the renter? We think
> yes**, using the notice that screen already shows for months it deliberately left alone."*
> — `additional-charge-every-case.html`, confirmed by the user 2026-09-30

## 1. Setup & Environment

Repository `rent-schedule-ui`, branch `abhishek/the-cadence-and-the-payload-describe-the-same-fee`.

```
npm test -- --watch=false --browsers=ChromeHeadless
```

The suite stood at **506** before this plan. **No API change** — the service already sends every field
this needs.

### Prerequisites & Open Questions

**None.** The decision was the product page's one open question on this screen, and the user answered it
on 2026-09-30.

## 2. Milestone-Based Implementation

### Milestone 1 — The response model reads `splitMode` (requirement 12)

The service has sent `splitMode` on every charge since its v122 and this repository has never declared
it. Without it the screen cannot tell a *Shared* fee's stored rows — a record of how it divided
(service BR-30) — from a *Split per Tenant* fee's, which are an instruction. Only the second is worth
warning about, so this is what makes the requirement possible rather than a guess.

| | |
|---|---|
| Production files | `rent-agreement.models.ts` |
| Rules | requirement 12 |
| Tests | covered by Milestone 2's cases; a field declaration asserts nothing on its own |

**Commit:** `feat(ui): the charge response declares the split mode it has always carried`

`STOP — review checkpoint`

### Milestone 2 — The removal names the fees it reaches (requirement 12)

`AddTenantsComponent` gains a computed over the loaded agreement's charges: every fee whose
`splitMode` is `PerTenant`, that is not on the rent invoice, that has not taken money, and whose
`tenantShares` name a renter the form no longer carries. The template renders them in the warning
banner the screen already uses for `skippedCycles`.

| | |
|---|---|
| Production files | `add-tenants.component.ts`, `add-tenants.component.html` |
| Rules | requirement 12 |
| Tests | `FR12_RemovingANamedRenter_NamesTheFeesItReaches`, `FR12_RemovingARenterNoFeeNames_SaysNothing`, `FR12_ASharedFee_IsNeverNamed`, `FR12_AFeeOnTheRentInvoice_IsNeverNamed`, `FR12_APaidFee_IsNeverNamed` |

**Flow Card** — *trigger:* the manager presses Remove on a renter row.
`add-tenants.component.ts#removeTenant` → **`#feesLosingTheirTypedFigures` — the business rule lives
here** → `add-tenants.component.html` warning banner. *Fails when:* a manager removes a renter named on
a `$300` fee, saves, and later finds that fee dividing `$150/$150` across two people with nothing having
said so. *Start debugging here:* `feesLosingTheirTypedFigures`.

**Commit:** `feat(ui): removing a renter names the fees it stops reaching`

`STOP — review checkpoint`

## 3. Scope & Context Rules

**In scope:** the ADD TENANTS screen, before the save.

**Out of scope:** changing what is sent or what the service does. The fee's stored rows are not rewritten
by a removal — they are intersected with the live roster when the fee is billed — and this plan does not
alter that. It only says so.

**Also out of scope:** the fee drawer. A fee that has taken money already freezes its renters there
(spec `02` requirement 38), and a removal cannot reach it.

### Technical Decisions

| Decision | Chosen | Rejected | Source |
|---|---|---|---|
| Where the fact comes from | Computed on this screen from the loaded agreement | A new field on the `PUT …/tenants` response | The screen already has every charge with its `splitMode` and `tenantShares`; an API change would add a round trip and a contract for something the client can already see |
| When it is said | **Before** the save, beside the removal | After the save, like requirement 11's `skippedCycles` | This is a consequence of a removal not yet committed. Saying it afterwards reports a decision the manager can no longer reconsider |
| The wording | The figures **will no longer be used** | The figures are **replaced**, as the product page says | The service does not rewrite the rows. A manager who reopens the fee and finds their figures intact would be right to distrust a screen that said they were gone |
| Which fees qualify | *Split per Tenant*, off the rent invoice, unpaid, naming the removed renter | Any fee carrying `tenantShares` | A *Shared* fee stores rows too, as a record of how it divided (service BR-30). Warning about it would be warning about nothing |

## 4. Verification

`npm test -- --watch=false --browsers=ChromeHeadless` green, and the five tests above present.

## 5. Git & Rollback

Two commits. Rolling back either leaves the screen as it is today — silent — and changes nothing that is
stored or sent.

## 6. Final Validation

**No existing case changed.** Suite 506 → 511.

**One thing the plan did not anticipate.** The rule reads the form, and a `FormArray` is not reactive to
Angular's signal graph — a computed over it would answer from whenever it last happened to run. The ids
are mirrored into a signal instead, refreshed at **all four** sites that change the roster: prefill,
add, remove, and the clear that precedes prefill. Syncing only the remove would have left the notice
stale on the screen it matters most on — the one opened on a saved lease.

- [x] Requirement 12 named by at least one test. *Five `FR12_` cases.*
- [x] Removing a renter named on a *Split per Tenant* fee names that fee, before the save.
- [x] A *Shared* fee, a fee on the rent invoice, and a paid fee are never named. *The Shared case is the one a `tenantShares.length` test gets wrong, and is why `splitMode` had to be read.*
- [x] Removing a renter no fee names says nothing. *Without it, rendering the notice unconditionally would pass every other case.*
- [x] The notice says the figures will no longer be **used**, not that they were erased.
- [x] The spec's v2 changelog row links to this plan.
