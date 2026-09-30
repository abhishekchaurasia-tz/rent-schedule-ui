**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v19

# A deposit is billed to whoever holds it

The split editor reads one field off the roster — `tenantId` — and divides every fee across everybody
on it. A **deposit** is not billed that way, and the drawer now says so.

> *"It is billed to the renters who carry a deposit share on the lease, which is not always the same
> set as the rent share. A renter recorded at nothing of the deposit is not billed a deposit fee, even
> though the same person is billed every other kind of fee. This is worth a frame if you think a
> manager would be surprised by it — **we were**."* — `additional-charge-every-case.html`

**This is one milestone**, because it is one rule on one computed member.

## 1. Setup & Environment

Repository `rent-schedule-ui`, branch `abhishek/the-cadence-and-the-payload-describe-the-same-fee` —
the same drawer and the same release as the v18 work, whose requirement 34 is what made this visible.

```
npm test -- --watch=false --browsers=ChromeHeadless
```

No backend change, no contract change. Both deposit columns already arrive on every roster row.

### Prerequisites & Open Questions

- **None blocking.** The decision states the rule outright.
- **Open on that page, and not blocked by it:** *"This is worth a frame if you think a manager would be
  surprised by it."* A frame would improve how the surprise reads; the arithmetic below is correct
  without one.

## 2. Milestone-Based Implementation

### Milestone 1 — The deposit drawer divides across deposit holders (requirement 37)

`tenant-split-editor` gains one input, `depositFee`, and `coveredTenants` consults the roster's
deposit columns when it is set. A renter carries a deposit share when `deposit > 0` or
`depositPercent > 0`; one who carries none stays listed and reads *Not charged this fee*, which the
existing caption already produces for any uncovered renter.

| | |
|---|---|
| Production files | `tenant-split-editor.component.ts`, `additional-charge-panel.component.html` |
| Rules | requirement 37 |
| Tests | `FR37_ADepositFee_DividesAcrossDepositHoldersOnly`, `FR37_ARenterWithNoDepositShare_IsListedAsNotCharged`, `FR37_ADepositFeeReachingNobody_IsStillSaveable`, `FR37_AnOrdinaryFee_IgnoresTheDepositColumns` |

**Flow Card** — *trigger:* owner opens the deposit drawer on a lease whose renters hold different
deposit shares. `rent-agreement-create.component.html:767` `[depositOnly]="true"` →
`additional-charge-panel.component.html` `[depositFee]="depositOnly"` →
**`tenant-split-editor.component.ts#coveredTenants` — the business rule lives here** → `rows` →
the table. *Fails when:* a renter holding no deposit is shown owing a share of the deposit, and the
figures on screen add up to a division the service will not raise. *Start debugging here:*
`tenant-split-editor.component.ts#coveredTenants`.

**Commit:** `fix(ui): a deposit fee divides across the renters who hold a deposit`

`STOP — review checkpoint`

## 3. Scope & Context Rules

**In scope:** the deposit drawer, which only the lease editor opens.

**Out of scope:** the payload. A deposit fee is `Shared`, so no shares are sent for it at all — this
changes only what the owner is shown. Also out of scope: deciding deposit-ness from the line items
rather than from the host's flag. The decision says *"A fee counts as a deposit when its line items are
deposit items"*, and the panel already enforces that from the other side by restricting the catalog
scope to `DepositOnly`, so the two cannot disagree today.

### Technical Decisions

| Decision | Chosen | Rejected | Source |
|---|---|---|---|
| How the editor learns the fee is a deposit | A `depositFee` input, passed from the panel's existing `depositOnly` | Inspecting the line items inside the editor | The editor never sees the items; the panel already restricts them to the deposit catalog, so the flag and the items cannot disagree |
| What "carries a deposit share" means | `deposit > 0 \|\| (depositPercent ?? 0) > 0` | `deposit !== 0` alone | A share stated as a percentage leaves `deposit` at `0`; reading only the amount would drop a renter who holds a percentage of the deposit |
| A renter with no deposit share | Listed, uncovered, *Not charged this fee* | Hidden from the table | Seeing who is **not** on a fee is half of reading a split, and this is the one case the decision calls surprising — hiding it is how the surprise reaches production |

## 4. Verification

`npm test -- --watch=false --browsers=ChromeHeadless` green, and the four tests above present. The
suite stood at **497** before this plan.

## 5. Git & Rollback

One commit. Rolling it back restores an even division across the rent roster — wrong, but harmless to
stored data, because a deposit fee sends no shares either way.

## 6. Final Validation

**No existing case changed.** The rule had no test either way, so nothing asserted the behaviour this
replaces. Suite 497 → 502, all green.

**One case beyond the plan**: `FR37_ADepositHeldAsAPercentage_StillCounts`. A deposit stated as a
percentage leaves the amount column at zero, so an implementation reading only `deposit` would drop a
renter holding half the deposit — the same defect in a second costume.

- [x] Requirement 37 named by at least one test. *Five `FR37_` cases.*
- [x] A deposit fee divides across deposit holders only, and an ordinary fee is unchanged.
      *`FR37_ADepositFee_DividesAcrossDepositHoldersOnly` and `FR37_AnOrdinaryFee_IgnoresTheDepositColumns`
      run the same roster both ways: 450/450 against 300/300/300.*
- [x] A renter holding no deposit reads *Not charged this fee* rather than disappearing.
- [x] A deposit fee that reaches nobody still saves. *No rows, no blocker.*
- [x] The spec's v19 changelog row links to this plan.
