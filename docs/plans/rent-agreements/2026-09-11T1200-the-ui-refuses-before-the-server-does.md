**Spec:** [`docs/specs/rent-agreements/03-update-proposed-invoice-ui.md`](../../specs/rent-agreements/03-update-proposed-invoice-ui.md) — v7

## Checklist

- [x] Checked what backend spec `07` v10 actually asks of this app, rather than assuming a backend
      change needs a frontend one. Five requirements landed there; **three need nothing here**:
      - **FR 30/31 (line order)** — this app sorts invoice lines **nowhere**. Grepped `src/app` for
        `.sort(`, `orderBy` and `sortBy`: no matches outside specs. The order the API now guarantees
        reaches the screen untouched, so the ordering work is already done by not having done anything.
      - **FR 34 (position is never client-supplied)** — no request model carries one, and none was
        added.
      - **FR 38 (an emptied invoice is voided)** — `invoice-list.component.ts` already knows the
        `voided` status and already hides Delete/Void on a row that has it, so an invoice the backend
        withdraws renders correctly on the next search.
- [x] **FR 37 — the deposit line.** `removeLine` guarded only "at least one line". A deposit invoice may
      carry a `Credit` beside its deposit, so removing the deposit leaves **two minus one** — not empty,
      past the guard, and a deposit invoice billing no deposit. Added `isLastDepositLine`.
- [x] **FR 35 — the zero amount.** The row validators are `min(0.01)` on quantity and rate, which are
      exactly the input guards the backend had before v10 and exactly what lets `0.01 × 0.40` through.
      Added `zeroAmountRows`, reading the **product** after rounding toward zero at two places.
- [x] Both new guards were **shown to fail with the guard removed** — 2 of 43 specs on this screen,
      one per rule. A rule test that has never failed has not been shown to test anything.
- [x] **v7 — the rent line too.** Reported by the user: the screen still offered to remove it and it
      still went. That was v6 behaving as specified — backend `07` v10 recorded rent as unprotected —
      and v11 reverses that reading. `isLastDepositLine` becomes `isLastSubjectLine`, asking the invoice
      what it exists to bill rather than growing a second branch, which is how the backend states it too.
      The spec that pinned rent as removable is **inverted**, and two cases added: a fee may still go,
      and an invoice that never billed rent is untouched.
- [x] Full suite green: **328 specs**.

## Technical Approach

Both rules already exist and are enforced on the server. Neither change here makes anything newly
possible — they move a refusal from *after* submit to *before* it, which is what the backend spec's
decision **D5** chose: the API refuses **and** the UI does not offer the control. This screen had only
the first half of that, and a server refusal a user meets after pressing Save is a worse version of the
same rule.

**Nothing was broken.** `describeError` renders the RFC 9457 `detail`, and both new backend errors carry
legible messages, so a user who tripped either would have been told what was wrong — just later than
they should have been, and after a round trip.

**`isLastDepositLine` reads the row, not the count.** It refuses only when the row being removed is
deposit-shaped *and* it is the last such row; a deposit invoice's credit line stays removable, and a
rent invoice is untouched by the rule. Borrowing the deposit rule for rent would be wrong in the other
direction: rent is optional on a proposal, so dropping the rent line is a supported edit.

**`zeroAmountRows` rounds the way the server rounds.** `Math.floor(quantity * rate * 100) / 100`
mirrors `MidpointRounding.ToZero`, with a `1e-9` epsilon so binary floating point cannot turn a
legitimate one-cent line into a refusal. A spec pins that case, so the rule reads as "not zero" rather
than "not small" — a cent is exactly what a three-way even split leaves on one tenant's share.

## Technical Decisions

| # | Decision | Chosen | Rejected | Why |
|---|---|---|---|---|
| 1 | Where the deposit rule lives | **In `removeLine`, beside the emptiness guard** | A disabled button in the template only | A template-only guard is a suggestion. The component is what the specs drive and what a future caller reaches |
| 2 | Where the zero rule lives | **In `submit`, on the product** | A `Validators` entry per field | The per-field validators are already there and are precisely what cannot see this — the fault is in the product, and only submit has every row's product at once |
| 3 | Whether to name the offending rows | **Yes, one-based, in the notice** | A generic "fix the highlighted rows" | The existing invalid-form notice is already generic; a rule whose cause is invisible in both fields needs to say which row it means |
| 4 | Whether to mirror the backend's `!= 0` | **No — `=== 0` here** | Matching the backend literally | A negative amount cannot be typed into this form: both fields are `min(0.01)`. The backend's shape exists to keep credit lines possible later, which is a decision about *its* domain, not this screen's |

## Test Plan

| Spec | Proves |
|---|---|
| `refuses to remove a deposit invoice's last deposit line, though the set would not be empty` | FR 21 — the case the emptiness guard misses |
| `lets a deposit invoice drop its credit line, because the deposit is what must survive` | FR 21 does not over-reach |
| `lets a rent invoice drop its rent line, which the backend permits` | FR 21 is not borrowed for rent |
| `refuses a line whose quantity × rate rounds away to zero, before any request` | FR 22, and that no request is issued |
| `accepts a line worth one cent, so the rule reads as "not zero" and not "not small"` | FR 22's boundary |
