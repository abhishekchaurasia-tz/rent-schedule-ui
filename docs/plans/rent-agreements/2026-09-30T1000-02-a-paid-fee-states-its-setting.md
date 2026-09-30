**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v20

# A paid fee states its setting

A fee that has taken money shows two disabled radios and a set of renter checkboxes that are not
disabled at all. The boxes tick nothing, change nothing, and say nothing.

> *"Once frozen, should the setting appear as plain text rather than a greyed-out control — we think
> yes, because **a disabled radio invites clicking and explains nothing**."*
> — `additional-charge-every-case.html`, confirmed by the user 2026-09-30

**One milestone**, because it is one state of one component.

## 1. Setup & Environment

Repository `rent-schedule-ui`, branch `abhishek/the-cadence-and-the-payload-describe-the-same-fee` —
the same drawer and the same release as v17 to v19.

```
npm test -- --watch=false --browsers=ChromeHeadless
```

The suite stood at **502** before this plan. No API change: the service already refuses a mode or payer
change on a paid fee (spec `06` requirement 218, BR-31), whatever this screen renders.

### Prerequisites & Open Questions

**None.** The decision this turns on was the one open question on the product page, and the user
answered it on 2026-09-30.

## 2. Milestone-Based Implementation

### Milestone 1 — The setting is stated, and the renters stop inviting a click (requirement 38)

The mode block gains a third branch. `ridesRentInvoice()` already replaces the setting with a sentence;
`whoOwesIsSettled()` now does the same, naming the setting in force. The renter checkbox takes
`whoOwesIsSettled()` into its `disabled` binding, which is the half requirement 33 never built.

| | |
|---|---|
| Production files | `tenant-split-editor.component.html` |
| Rules | requirement 38 |
| Tests | `FR38_APaidFee_StatesItsSettingAsText`, `FR38_APaidFee_OffersNoModeRadios`, `FR38_APaidFee_DisablesTheRenterCheckboxes`, `FR38_AnUnpaidFee_KeepsItsRadiosAndCheckboxes` |

**Flow Card** — *trigger:* the owner reopens a fee that has taken a payment.
`rent-agreement-create.component.ts#editingChargeHasTakenMoney` →
`additional-charge-panel.component.html` `[chargeHasTakenMoney]` →
`tenant-split-editor.component.ts#whoOwesIsSettled` →
**`tenant-split-editor.component.html` — the business rule lives here**. *Fails when:* the owner clicks
a renter checkbox on a paid fee and nothing happens, with no reason given. *Start debugging here:*
`whoOwesIsSettled`.

**Commit:** `fix(ui): a paid fee states its setting instead of greying it out`

`STOP — review checkpoint`

## 3. Scope & Context Rules

**In scope:** what the drawer renders for a fee that has taken money.

**Out of scope:** the amounts, which stay editable. That is deliberate and requirement 33 already
explains it — the service performs a reprice on a paid fee, so locking the whole fee would forbid an
edit the system itself carries out.

**Also out of scope:** the guards in `setSplitMode` and `toggleTenant`. They stay as they are. They are
what makes the rule true rather than merely rendered, and this requirement changes only what the owner
is shown and invited to click.

### Technical Decisions

| Decision | Chosen | Rejected | Source |
|---|---|---|---|
| How the frozen setting reads | Plain text naming the setting in force | Disabled radios, as v17 built | User, 2026-09-30, from the product page: a disabled radio invites clicking and explains nothing |
| Where the branch goes | A third arm beside `ridesRentInvoice()`, in the same block | A separate component | The two states say the same kind of thing — *there is no decision here, and here is why* — and the rent-invoice arm already argues that case in its own comment |
| The renter checkboxes | Disabled when the fee is settled | Left enabled, as today | Requirement 33's own first line says the renters are read-only too; only the mode was built. A control that is not disabled and does nothing is worse than a greyed one |

## 4. Verification

`npm test -- --watch=false --browsers=ChromeHeadless` green, and the four tests above present.

## 5. Git & Rollback

One commit. Rolling it back restores the disabled radios and the clickable checkboxes; nothing is
stored differently either way.

## 6. Final Validation

**One existing case changed, and it kept its subject.** `locks both mode controls and says why` became
`states the mode instead of offering it, and says why`: it asserted two disabled radios, and now asserts
that none is offered and the setting is named. Its two text assertions are untouched. Suite 502 → 506.

- [x] Requirement 38 named by at least one test. *Four `FR38_` cases.*
- [x] A paid fee renders no `input[name="splitMode"]`, and names its setting in words.
- [x] A paid fee's renter checkboxes are disabled.
- [x] An unpaid fee is unchanged — radios and checkboxes both live. *`FR38_AnUnpaidFee_KeepsItsRadiosAndCheckboxes`, without which hiding the radios unconditionally would pass every other case.*
- [x] The notice explaining why is still on screen.
- [x] The spec's v20 changelog row links to this plan.
