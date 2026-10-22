**Spec:** [`docs/specs/rent-agreements/06-add-tenants-ui.md`](../../specs/rent-agreements/06-add-tenants-ui.md) — v3

# The tenant split keeps the typed amounts

Billing `03-rent-agreement-tenants.md` v42 (innago-billing#323) made the amount the authority for rent and
deposit shares: the amounts sent are stored and billed as they are, and amounts that do not total the rent are
refused. This screen worked its amounts out from percentages row by row, so it sent amounts Billing now keeps
(`99.99 / 99.99 / 100.02` for 300 across three) or refuses (`50.01 + 50.01` for 100.01 at 50 / 50).

| # | What | Requirement |
|---|---|---|
| 1 | The even split spreads percentages and sends their rounded amounts | 13 |
| 2 | A save in `%` mode can send amounts a cent off the rent | 14 |

## 1. Setup & Environment

Repository `rent-schedule-ui`, branch `abhishek/the-tenant-split-keeps-the-typed-amounts`, cut with `--no-track` from
`origin/main` at `dc79c22` on 2026-10-22.

```
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build
```

### Prerequisites & Open Questions

None. Requested by the user on 2026-10-22.

### Depth scan — every place this screen works out a share

| Site (`add-tenants.component.ts`) | Today | v3 |
|---|---|---|
| `rebalanceEqually` | Even percentages; amount = `round(% × total)` per row | `divideEvenly` on the money; percentages from the amounts |
| `buildTenantGroup` | One row at 100 % | Unchanged |
| `onRentPercentChanged` / `onDepositPercentChanged` | Row amount = `round(% × total)` | Unchanged on screen; the save reconciles (requirement 14) |
| `onRentAmountChanged` / `onDepositAmountChanged` | Row percent from amount | Unchanged |
| `save` | Sends the form's figures | Sends the amounts on screen when they total the lane; `%` mode that misses it: divided from the percentages |
| `buildSavedTenantGroup` | Reads stored figures | Unchanged (Billing returns both) |

### Reuse

| Need | Existing |
|---|---|
| Divide money in cents, leftover to the first rows | `divideEvenly` in `tenant-split.util.ts` |

## 2. Milestone-Based Implementation

### Milestone 1 — Even split and save

1. Tests (`add-tenants.component.spec.ts`): three renters on rent 300 and deposit 300 show `100` each and
   `33.34 / 33.33 / 33.33 %`; saving that even split sends `100 / 100 / 100`; a `%` save of 50 / 50 on rent 100.01
   sends `50.01 + 50.00`; a `$` save sends the typed amounts; the existing two-renter tests still hold.
2. Code: two helpers in `tenant-split.util.ts` (`percentsFromAmounts`, `divideByPercents`), `rebalanceEqually`, `save`
   (with `amountsToSend` choosing per lane between the amounts on screen and `divideByPercents`).

## 3. Scope & Context Rules

- In scope: the tenants screen and its two helpers.
- Out of scope: Billing (its own branch), the fee screens (they already divide the money).

### Technical Decisions

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Even split | Divide the money | Divide 100 % | Matches Billing v42; 300 / 3 is 100 each. |
| `%` mode save | The amounts on screen when they total the rent; else divide the rent by the percentages, leftover cent to the first | Round each row; always divide by the percentages | Each-row rounding misses the total by a cent. Always dividing sent `100.02 / 99.99 / 99.99` for an even split of 300 shown as `100` each (found in the live check): a 2-place percentage cannot carry the money back. |
| Percent shown | Two places, leftover hundredth to the first payer | Six places | Billing stores two places. |

## 4. Verification

`ng test` and `ng build` pass. Live, against Billing's v42 branch: three renters on rent 300 save and bill `100.00`
each. Do not continue if a check fails.

## 5. Git & Rollback

One commit after asking the user; rollback is a revert.

## 6. Final Validation

- [ ] Spec v3 links this plan; this plan links v3.
- [ ] Requirements 13 and 14 each have a test.
