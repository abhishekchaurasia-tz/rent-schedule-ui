**Spec:** [`docs/specs/rent-agreements/10-deposit-application-ui.md`](../../specs/rent-agreements/10-deposit-application-ui.md) — v1 · [`docs/specs/rent-agreements/09-deposit-refund-ui.md`](../../specs/rent-agreements/09-deposit-refund-ui.md) — v3

# Deposit Application — Apply It

## Setup & Environment

- Angular 19, `rent-schedule-ui`, on `main` (the user's instruction: no new branch). Baseline: 669 specs green.
- No packages added. Backend: Billing `Piyush/deposit-application` (spec `16-deposit-application.md` v1).
- Commands: `npx ng build --configuration development` · `npx ng test --watch=false --browsers=ChromeHeadless`.

### Prerequisites & Open Questions

- The layout follows the owner app screenshots the user attached on 2026-10-09 (*Refund Deposit* menu,
  *Apply Deposit* panel).
- None open.

## Milestone-Based Implementation

### M1 — Models and service (FR 3, 9–11)

- [x] `src/app/invoices/deposit-application.models.ts` — the wire shapes.
- [x] `src/app/invoices/deposit-application.service.ts` — `get`, `apply`, `remove`; spec first.

### M2 — The Apply Deposit panel (FR 4–9)

- [x] `src/app/invoices/apply-deposit-panel.component.{ts,html,scss}` — summary card, maintenance rows,
      open-invoice rows, running totals, the server's checks, one `applicationId` per opening.
- [x] `apply-deposit-panel.component.spec.ts` first.

### M3 — The page (FR 1–3, 10, 11)

- [x] `deposit-refund.component.*` — *Refund Deposit* becomes the *Return It* / *Apply It* menu; the
      apply flow; *Funds Applied to Other Invoices* with *Remove*.
- [x] `deposit-refund.component.spec.ts` — the one test that clicked *Refund Deposit* to open the Return
      panel now clicks *Return It*; new tests for the menu, the apply flow and the block.

## Scope & Context Rules

- **May modify:** the files above, spec 09 (changelog row and FR 4/5 wording), this plan.
- **Must not modify:** the Return Deposit panel, the refund service, any other screen.
- The page reads the application context only when `totals.totalApplied` > 0 or when *Apply It* is
  pressed, so a deposit with nothing applied makes exactly the calls it made before.

### Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Where Apply lives | The Deposit Refund page, behind the *Refund Deposit* menu | A new page | The owner app puts both under one button on one invoice |
| 2 | Idempotency | `applicationId` from `crypto.randomUUID()`, once per panel opening | One per press | A press after a lost answer must be the same submission (backend BR-13) |
| 3 | When *Funds Applied* is read | Only when `totalApplied` > 0, and after every write | On every load | No extra call for a deposit with nothing applied; existing page tests unchanged |

## Verification

**Do not continue to the next milestone if any check fails.**

- `npx ng build --configuration development` clean.
- `npx ng test --watch=false --browsers=ChromeHeadless` green: baseline + new specs.

## Git & Rollback

- Work on `main`, uncommitted until the user confirms (their instruction and the global rule).
- Rollback: the change is additive apart from the *Refund Deposit* button; reverting the commit restores it.

## Final Validation

- [x] Spec ↔ plan links resolve both ways.
- [x] Build and tests green.
- [x] The Return Deposit flow is unchanged apart from being reached through *Return It*.
