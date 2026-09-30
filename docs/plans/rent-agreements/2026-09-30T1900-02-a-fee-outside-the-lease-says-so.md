**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v21

# A fee outside the lease says so

A one-off fee can be dated anywhere. The Due Date picker carries no `min` and no `max`, and nothing on
the panel ever compares that date to the lease it belongs to. A fee dated six months before the tenancy
began is authored, saved and billed in exactly the same silence as one dated inside the term — and its
invoice arrives **overdue**, which is the whole point of back-dating it and is nowhere said.

> *"invoice banegi, bas user ko warning show hoga out of lease jane pe"*
> — the user, 2026-09-30

The service is being opened at both ends to match (see **Prerequisites**). This plan is the half that
tells the owner what they are about to do.

## 1. Setup & Environment

Repository `rent-schedule-ui`, branch `abhishek/the-cadence-and-the-payload-describe-the-same-fee`.

```
npm test -- --watch=false --browsers=ChromeHeadless
```

The suite stood at **511** before this plan.

**No API call changes, no new field, and nothing sent differently.** `leaseStartDate` and `leaseEndDate`
are already `@Input`s on `AdditionalChargePanelComponent`, and **all four screens that open it already
pass both** — verified by grep, not assumed:

| Screen | Call site |
|---|---|
| Add Additional Fee | `add-additional-charge.component.html:176` |
| Lease editor — fee panel | `rent-agreement-create.component.html:754` |
| Lease editor — deposit panel | `rent-agreement-create.component.html:771` |
| Invoices | `invoice-list.component.html:401` |

So the warning lands on every one of them without a single call site changing.

### Prerequisites & Open Questions

**One, and it is recorded in the spec as A-2 rather than assumed away.**

The billing service bounded a one-off charge by **both** ends of the lease until 2026-09-30. Its spec
`06` requirement 220 opened the **lower** one that day; the **upper** one still refuses with
`invoice.due_date_after_lease_end` and a `422`. The user's decision is that both ends are accepted and
the owner is warned rather than refused, so the service is being changed to match — **in its own repo,
under its own spec and plan.**

| | |
|---|---|
| **Milestone 1** (before the lease's start) | ships and is correct **today** — the service already accepts it |
| **Milestone 2** (after the lease's end) | is correct **only once the service's upper bound opens** |

Milestone 2 is written here because the decision covers it, and it is sequenced second so that the half
which is already true can land on its own. **If the service's upper bound is kept instead**, Milestone 2
does not ship as written: its arm must block Save rather than warn, which is the reading this app
already took in `2026-09-11T1200-the-ui-refuses-before-the-server-does`.

## 2. Milestone-Based Implementation

### Milestone 1 — A back-dated fee says its invoice will be overdue (requirement 39)

`AdditionalChargePanelComponent` gains one computed reading the form's `dueDate` against
`leaseStartDate`. It answers only for a **one-off** fee — the Due Date control exists only under
`@if (!isRecurring)` — and only when a date has been picked, so clearing the field clears the warning
rather than leaving the last one on screen.

The template renders it in the `banner warn` this app already uses, placed under the Due Date field so
the warning sits with the control that caused it.

| | |
|---|---|
| Production files | `additional-charge-panel.component.ts`, `additional-charge-panel.component.html` |
| Rules | requirement 39 (lower arm) |
| Tests | `FR39_AFeeDatedBeforeTheLeaseStarts_SaysItWillBeOverdue`, `FR39_AFeeDatedInsideTheTerm_SaysNothing`, `FR39_ARecurringFee_SaysNothing`, `FR39_ClearingTheDueDate_ClearsTheWarning` |

**Flow Card** — *trigger:* the owner picks a Due Date earlier than the lease's start.
`additional-charge-panel.component.html` Due Date datepicker → `#dueDate` valueChanges →
**`#dueDateOutsideTheLease` — the business rule lives here** → `banner warn` under the field.
*Fails when:* an owner dates a repair fee to last March, saves without a word, and first learns the
invoice is overdue when the tenant asks why they have been billed late. *Start debugging here:*
`dueDateOutsideTheLease`.

**Commit:** `feat(ui): a back-dated fee says its invoice will be overdue`

`STOP — review checkpoint`

### Milestone 2 — A fee past the lease's end says so (requirement 39)

The same computed gains its upper arm: `dueDate` after `leaseEndDate`, **gated on an end existing at
all**. On a month-to-month lease `leaseEndDate` arrives `null` — which this panel already reads to
derive `leaseTermType` — and a lease with no last day has no date that can be after it.

| | |
|---|---|
| Production files | `additional-charge-panel.component.ts`, `additional-charge-panel.component.html` |
| Rules | requirement 39 (upper arm) |
| Tests | `FR39_AFeeDatedAfterTheLeaseEnds_SaysSo`, `FR39_AMonthToMonthLease_NeverWarnsAboutTheEnd`, `FR39_AFeeOnTheLeasesLastDay_SaysNothing` |

**Flow Card** — *trigger:* the owner picks a Due Date later than a fixed-term lease's end.
`additional-charge-panel.component.html` Due Date datepicker → `#dueDate` valueChanges →
**`#dueDateOutsideTheLease` — the business rule lives here** → `banner warn` under the field.
*Fails when:* on a month-to-month lease, where there is no end, every date warns — the loudest possible
version of a warning that means nothing. *Start debugging here:* the `leaseEndDate` null guard inside
`dueDateOutsideTheLease`.

**Commit:** `feat(ui): a fee past the lease's end says so`

`STOP — review checkpoint`

## 3. Scope & Context Rules

**In scope:** the one-off **Due Date** on `AdditionalChargePanelComponent`, before the save.

**Out of scope — the recurring window.** A recurring fee's Start and End dates are bounded by the
service's **generation window**, a different rule with a different reason, which requirement 220 does
not touch. Warning about it here would have this screen assert something the service does not.
*(Confirmed by the user 2026-09-30.)*

**Out of scope — blocking anything.** Save stays enabled, the picker gains no `max` and keeps no `min`,
and no control is disabled. A fee dated before the lease begins is the ordinary way to bill work
already done.

**Out of scope — the service.** The upper bound's removal is the billing repository's work, under its
own spec and plan. Nothing in this plan is written there.

### Technical Decisions

| Decision | Chosen | Rejected | Source |
|---|---|---|---|
| Warn, or refuse | **Warn**, Save stays enabled | Refuse before the server does, as `03`'s D5 did | The user, 2026-09-30: *"invoice banegi, bas user ko warning show hoga"*. D5's reasoning was that the server refuses anyway — which stops being true once both bounds open |
| Where the dates come from | The `leaseStartDate` / `leaseEndDate` inputs already on the panel | A new lookup, or passing the whole agreement | Both are already passed by all four call sites. Nothing to add and nothing to wire |
| How month-to-month is told apart | `leaseEndDate === null` | A new `leaseTermType` input | The panel already derives `leaseTermType` from exactly that expression. A second source of the same truth is a second thing to keep in step |
| Where the warning renders | `banner warn`, under the Due Date field | A `mat-error` on the field, or a dialog on Save | `mat-error` renders only on an *invalid* control, and this control is valid. A dialog on Save arrives after the decision |
| One computed or two | **One**, answering which arm (or neither) | A boolean per arm | The two arms are one question about one field. Two booleans can both be true, which is a state no date can be in |

## 4. Verification

`npm test -- --watch=false --browsers=ChromeHeadless` green, with the seven tests above present.

**Each arm shown to fail with its own guard removed.** A warning that has never been absent has not been
shown to depend on anything — which is what the two duplicated cases on the service side proved by
passing before their own fix.

## 5. Git & Rollback

Two commits, one per milestone. Rolling back either leaves the panel as it is today — silent — and
changes nothing that is stored or sent. Milestone 1 stands alone if Milestone 2 is held for the service.

## 6. Final Validation

*To be filled at execution.*

- [ ] Requirement 39 named by at least one test.
- [ ] A fee dated before the lease's start warns, and saves.
- [ ] A fee dated after a fixed-term lease's end warns.
- [ ] A month-to-month lease never produces the upper warning, however far out the date.
- [ ] A fee dated on the lease's **last day** warns about nothing — the bound is inclusive.
- [ ] A fee dated inside the term warns about nothing.
- [ ] A recurring fee warns about nothing, whatever its Start and End dates.
- [ ] Clearing the Due Date clears the warning.
- [ ] All four screens that open the panel get it, because none of them changed.
- [ ] **A-2 answered** — the service accepts a date past the lease's end, or Milestone 2 is reworked to
      block rather than warn.
