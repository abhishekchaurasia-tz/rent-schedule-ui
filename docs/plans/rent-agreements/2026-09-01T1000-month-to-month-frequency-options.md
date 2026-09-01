## Checklist

- [x] Read the backend rule rather than assuming it. Both
      `PreviewRentScheduleQueryValidator` and `FirstRentalDueDateOptionsQueryValidator` carry the same
      single rule: `!(Frequency == Semesterly && LeaseTermType == MonthToMonth)` →
      *"Semi-annual frequency is not supported for month-to-month leases."*
- [x] **Only Semesterly is refused.** `custom` is allowed with month-to-month — the rule names one
      frequency and no other. See *Technical Decisions* 2.
- [x] Three components offer this choice, each with its own copy of the same six-entry list: the lease
      create/edit form, the schedule preview, and the additional-fee panel.
- [x] All three templates already iterate a `frequencies` member, so narrowing that member reaches every
      picker with no template change.

Open question raised with the user, not blocking: the request named four supported frequencies
(monthly, bi-monthly, weekly, bi-weekly), which omits **Custom**. The backend accepts Custom on a
month-to-month lease, so it is still offered — removing it would take away something that works.
Flagged in the reply; a one-line change to `frequenciesFor` if they want it gone too.

## Technical Approach

**One shared rule, three pickers.**

`src/app/rent-schedule/frequency-options.util.ts` holds the six-entry list once and exposes the rule
in the two directions the screens need it:

- `frequenciesFor(leaseTermType)` — what a picker may offer. Drops Semi-Annual for month-to-month.
- `isFrequencyAllowed(frequency, leaseTermType)` — what a form already holding a value asks before the
  term type changes underneath it.

Each component replaces its `readonly frequencies = [...]` field with a **getter** over
`frequenciesFor(this.leaseTermType)`. A getter rather than a computed field because it must re-read on
every change detection — that is what makes the option vanish the moment the term flips, with no
subscription to keep in sync.

**The narrowing alone is not enough**, and the gap is the part worth building carefully: a form already
sitting on Semi-Annual when the term switches would keep that value in a control whose option list no
longer contains it. The `<select>` renders blank, the user sees no explanation, and the save fails on a
field that is not on screen. So each component also resets to Monthly when the term change invalidates
the current pick:

- **Lease form** and **preview** — a `leaseTermType.valueChanges` subscription.
- **Fee panel** — in `ngOnInit`, *after* `applyInitialCharge`, because a saved charge may itself carry
  a Semi-Annual frequency on a lease since reopened as month-to-month. The panel is created fresh per
  use, so open time is when its lease is known.

The panel also gains a `leaseTermType` getter deriving the term the same way its candidate-date request
already does — a lease with no end date is month-to-month — rather than adding an input the two hosts
would have to supply consistently.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Where the rule lives | One shared util, three getters | Repeat the filter in each component; a validator that reports the clash after the fact | Three copies of a list was already the setup, and it is three places for one to fall out of step. A validator would let the user finish a form that could never be saved — the point is that the option is never offered |
| 2 | Whether Custom is also dropped | **Kept** for month-to-month | Drop it, matching the four frequencies the request listed | The backend allows it: the validator names Semesterly alone. Removing it would silently delete a working combination, and the UI would then be stricter than the contract with nothing recording why. Raised with the user instead of decided quietly |
| 3 | Hide or disable Semi-Annual | Hide | Show it disabled with a tooltip | The list is a plain `<select>`; a disabled `<option>` reads as a rendering fault more often than as a rule. The term-type control sits right beside it, so the cause is discoverable by changing it back |
| 4 | What an invalidated selection falls back to | `monthly` | Clear it; leave it | Clearing leaves a required control empty and the form unsubmittable for a reason the user did not cause. Monthly is the default every one of these forms already starts on |
| 5 | Where the panel checks | `ngOnInit`, after `applyInitialCharge` | In the constructor; on an `@Input` setter | Before the prefill the frequency is still the default, so the check would pass and then be undone by a saved Semi-Annual value. The panel is constructed fresh per open, so its lease cannot change under it |
| 6 | How the panel knows the term | Derived from `leaseEndDate` | A new `@Input leaseTermType` | Its candidate-date request already derives it exactly this way. A second input would be a second source for one fact, and both hosts would have to remember to pass it |

## Data Model & Schema Changes

None. No wire change and no backend change — this stops the client from sending a combination the
backend already refuses.

## Task Checklist

- [x] `src/app/rent-schedule/frequency-options.util.ts` — `RENT_FREQUENCIES`, `frequenciesFor`,
      `isFrequencyAllowed`, with the backend rule and the Custom carve-out documented.
- [x] `src/app/rent-schedule/frequency-options.util.spec.ts` — both directions of the rule, Custom kept,
      and that narrowing does not mutate the shared list.
- [x] `src/app/rent-schedule/rent-schedule-preview.component.ts` — getter + term-change reset.
- [x] `src/app/rent-agreements/rent-agreement-create.component.ts` — getter + term-change reset.
- [x] `src/app/rent-agreements/additional-charge-panel.component.ts` — `leaseTermType` getter, options
      getter, and the post-prefill reset in `ngOnInit`.
- [x] `src/app/rent-schedule/rent-schedule-preview.component.spec.ts` — four cases: offered for fixed,
      dropped for month-to-month, reset when the term switches under a Semi-Annual pick, and an
      already-valid pick left alone.
- [x] No template change needed — all three already iterate `frequencies`.
- [x] `npx ng test --watch=false --browsers=ChromeHeadless` (241 passing) and `npx ng build` clean.

## Test Plan

The case that matters is the switch, not the list: a picker that merely hides the option still leaves a
form holding it. `'falls back to Monthly when the term switches away from under a Semi-Annual
selection'` covers that, and its companion `'leaves an already-valid frequency alone'` proves the reset
is conditional rather than a blanket clear on every term change.

Run: `npx ng test --watch=false --browsers=ChromeHeadless`.
