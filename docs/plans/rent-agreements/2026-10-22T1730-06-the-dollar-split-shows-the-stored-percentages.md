**Spec:** [`docs/specs/rent-agreements/06-add-tenants-ui.md`](../../specs/rent-agreements/06-add-tenants-ui.md) — v4

# A split typed in dollars shows the percentages Billing stores

Reported by the user on 2026-10-22 with a screenshot: rent 300 typed as `100 / 100 / 100` in `$` mode showed
`33.33 %` on every row and a total of **99.99%**. Billing stored `33.34 / 33.33 / 33.33` (100%) for the same save,
so the screen disagreed with the record only in the derived column.

| # | What | Requirement |
|---|---|---|
| 1 | `$` mode rounds each row's percentage on its own | 15 |

## 1. Setup & Environment

Repository `rent-schedule-ui`, branch `abhishek/the-dollar-split-shows-the-stored-percentages`, cut with
`--no-track` from `origin/main` at `5c2827f` on 2026-10-22.

```
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build
```

### Prerequisites & Open Questions

None.

### Depth scan — every place this screen derives one column of a pair from the other

| Site (`add-tenants.component.ts`) | Today | v4 |
|---|---|---|
| `onRentAmountChanged` / `onDepositAmountChanged` | This row's percent = `round(amount / total)` | Every row's percent from all the amounts (`percentsFromAmounts`) |
| `buildSavedTenantGroup` (null percent) | Per row, the same rounding | `applySavedTenants` re-derives the lane from all the amounts |
| `rebalanceEqually` | `percentsFromAmounts` (v3) | Unchanged (its amounts always total the lane) |
| `onRentPercentChanged` / `onDepositPercentChanged` | This row's amount = `round(% × total)` | Unchanged — see Technical Decisions |
| `buildTenantGroup` | One new row from a percent | Unchanged |

### Reuse

| Need | Existing |
|---|---|
| Percentages from amounts, leftover hundredth to the first rows with a share | `percentsFromAmounts` in `tenant-split.util.ts` (v3) |

## 2. Milestone-Based Implementation

### Milestone 1 — `$` mode percentages

1. Tests (`tenant-split.util.spec.ts`, `add-tenants.component.spec.ts`): `percentsFromAmounts([100, 100, 100], 300)`
   is `33.34 / 33.33 / 33.33`; `[100, 0, 0]` of 300 is `33.33 / 0 / 0`; typing `100 / 100 / 100` in `$` mode shows
   `33.34 / 33.33 / 33.33` and a 100% total; a saved set with null percentages re-opens with the same figures.
2. Code: `percentsFromAmounts` aims at the amounts' own share of the total instead of always 100%;
   `onRentAmountChanged` / `onDepositAmountChanged` re-derive the whole lane; `applySavedTenants` does the same for a
   lane re-opened in `$` mode.

## 3. Scope & Context Rules

- In scope: the tenants screen's derived percent column in `$` mode, and its helper.
- Out of scope: Billing (it already stores these figures); the fee screens.

### Technical Decisions

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| `$` mode percent | All rows from all amounts, leftover hundredth to the first row with an amount | Round each row | Matches what Billing stores (v42 FR 22a); per-row rounding showed 99.99%. |
| Amounts short of the total | Show their own share (`100 / 0 / 0` of 300 → `33.33 / 0 / 0`) | Top up to 100% | A row being typed is not yet the split; topping up put `33.34` on a lone row. |
| `%` mode amount | Unchanged, per row | Re-divide the money from all percentages | Re-dividing moves rows nobody touched (`33.34 %` of 300 is `100.02`); the save already reconciles (requirement 14). |

## 4. Verification

`ng test` and `ng build` pass. Live: rent 300, three renters, `$` mode `100 / 100 / 100` shows
`33.34 / 33.33 / 33.33` and 100%. Do not continue if a check fails.

## 5. Git & Rollback

One commit after asking the user; rollback is a revert.

## 6. Final Validation

- [ ] Spec v4 links this plan; this plan links v4.
- [ ] Requirement 15 has a test for each site in the depth scan marked v4.
