**Spec:** [`docs/specs/rent-agreements/05-rent-agreement-lifecycle-ui.md`](../../specs/rent-agreements/05-rent-agreement-lifecycle-ui.md) — v2, requirements 13–15
**Enabled by:** backend `01-rent-agreement.md` v76 FR-113 — `terminationEffectiveDate` and `archivedOn` on the detail response

---

## Checklist

- [x] **The backend ships the two fields.** Verified against the running API on 2026-09-02: a
      terminated agreement's `GET` returns `terminationEffectiveDate: "2026-09-01"`,
      `archivedOn: null`; an archived one returns `status: "Archived"`,
      `archivedOn: "2026-09-02T11:14:59+00:00"`, `terminationEffectiveDate: null`.
- [x] **The component already takes `status` as a signal input**, so adding two more follows the same
      pattern and inherits the reactivity fix the v1 plan had to make.
- [x] **v1's own status table already promised this.** *"`Terminating`, `Terminated` → the recorded
      end date"* — the row existed and the component could not honour it, which is why this is a
      completion rather than a new idea.
- [x] **Should an archived-and-terminated lease show both dates, or only the one that matters?**
      Requirement 14 says both; showing only the archival date was rejected because the tenancy's
      actual end is the fact a person needs. It was flagged here as worth re-checking once rendered.
      **Answered by looking at it: both, and it does not read as cluttered** — see *Verified by
      running it*. Rendering it did change one thing, though: the label became `Archived on`.

---

## Technical Approach

### What is actually missing, stated precisely

Nothing about the flow changes. The dates already exist, are already returned, and are already
displayed — **once**, in the transient success banner
(`rent-agreement-lifecycle.component.html:129`, `Ends {{ result.effectiveDate | date }}`). That
banner is bound to `terminateResult()`, a signal set by the POST response and cleared by the next
page load.

So what a user sees a minute later is the surviving note at line 46-51: *"A termination is already
recorded for this lease, so it can no longer be terminated again — only archived."* Correct, and
silent on the only question the screen exists to answer.

The change is therefore small and entirely additive: **two optional inputs, and a panel that renders
them.** No service call, no new request, no state.

### Two inputs, both optional, and the optionality is deliberate

```ts
readonly terminationEffectiveDate = input<string | null>(null);
readonly archivedOn = input<string | null>(null);
```

Optional rather than `input.required`, for the reason requirement 15 gives: the component must stay
correct against a backend that predates FR-113. A required input would make the component
un-renderable against one, and the failure would be a runtime error in the host template rather than
a missing line of text.

**Signal inputs, not `@Input` fields.** This is not a style choice — the v1 plan records the defect:
a `computed()` reading a plain `@Input` evaluates once and caches, so after terminating, the Terminate
button stayed on screen until a reload. Every new derived value here goes through the same signal
graph, so the panel updates when the host re-passes after a reload.

### The panel, and what it says in each state

One block, driven by whether each date is present rather than by `status`. Keying it off the dates is
what makes requirement 14 fall out for free: an archived-and-terminated lease has both, so both
render, without the component having to re-derive FR-105's precedence — which is the backend's
reporting rule and not this component's business.

| State | Rendered |
|---|---|
| termination recorded, not archived | **Ends** *(date)* — plus v1's "only archived" note |
| archived, no termination | **Archived on** *(date)* |
| both recorded | **Ends** *(date)* and **Archived on** *(date)* |
| neither, or dates absent | v1's wording exactly, unchanged |

`| date: 'mediumDate'` for the effective date, matching the success banner so the same value does not
change format between the banner and the panel. `archivedOn` is a `timestamptz` and is rendered as a
date only — the time it was recorded is audit detail, not something a property manager reads off a
lease screen.

### What is deliberately not built

- **No "12 days remaining".** Requirement 15 forbids it and requirement 8 already established why:
  the property's clock is the server's, and a client-side countdown would read as authoritative while
  drifting from it. The backend has `todayUtc` on the response and even that is UTC rather than the
  property's zone.
- **No change to the success banner.** It is doing its job; the panel is what survives it.
- **No new host reload.** Requirement 11's `changed` event already causes one, and the host already
  re-passes `status` after it — the two new inputs ride the same path.

---

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Input optionality | Two `input<string \| null>(null)` | `input.required` | Requirement 15: the component must render against a backend without FR-113. A required input turns a missing field into a runtime error in the host template. |
| 2 | Signal inputs vs `@Input` | Signal inputs | Plain `@Input` fields | The v1 plan's recorded defect: a `computed()` over a plain `@Input` caches, and the Terminate button survived a termination until reload. Not a style preference. |
| 3 | What drives the panel | The **presence of each date** | Branch on `status` | Requirement 14 then needs no code: both dates present renders both, and the component never re-derives FR-105's precedence, which belongs to the backend. |
| 4 | Archival date granularity | Date only | Date and time | `archivedOn` is a `timestamptz`, but the time it was recorded is audit detail. A lease screen answers "when did this end", not "at what minute was the record written". |
| 5 | Days-remaining indicator | Not built | Compute from `todayUtc`; compute from the browser clock | Requirement 15, and requirement 8's precedent. The browser clock is not the property's, and `todayUtc` is not either. |
| 6 | Both dates on an archived lease | Show both | Show only the archival date | The tenancy's actual end is the fact a person needs; `status` reporting `Archived` is a labelling rule, not a statement that the termination date stopped mattering. *Flagged in the Checklist, then confirmed by rendering it — two rows read cleanly. The label became `Archived on`, because a bare `Archived` echoed the status chip beside it.* |

---

## Data Model & Schema Changes

No schema. One TypeScript interface gains two optional fields, mirroring the backend response:

```ts
// rent-agreement.models.ts — RentAgreementDetailResponse
/** v76 FR-113 — the day the lease ends early, or null when not terminated. */
terminationEffectiveDate?: string | null;

/** v76 FR-113 — when the lease was archived, or null when not archived. */
archivedOn?: string | null;
```

Optional (`?`) as well as nullable, so a response from a pre-FR-113 backend still type-checks — the
same reason decision 1 makes the inputs optional.

---

## Task Checklist

- [x] Add the two optional fields to `RentAgreementDetailResponse` in
      `src/app/rent-agreements/rent-agreement.models.ts`, with doc comments naming FR-113.
- [x] Add the two signal inputs to `rent-agreement-lifecycle.component.ts`, with a `hasEndDate` /
      `hasArchivedDate` pair of computeds so the template branches on presence rather than on
      `status`.
- [x] Add the panel to `rent-agreement-lifecycle.component.html`, above v1's `isEnding` note, and
      leave that note in place — it explains the missing Terminate button, which the date does not.
- [x] Style it in `rent-agreement-lifecycle.component.scss` as a quiet definition list, not a banner:
      banners in this component mean "something just happened", and this is standing state.
- [x] Pass both from the host in `rent-agreement-create.component.html`, beside the existing
      `[status]`.
- [x] Tests, written first, in `rent-agreement-lifecycle.component.spec.ts`:
      - `Terminating` with a date → the date renders, and v1's note still renders.
      - `Archived` with only `archivedOn` → the archival date renders, no end date.
      - `Archived` with **both** → both render (requirement 14).
      - `Terminating` with `terminationEffectiveDate: null` → v1's wording, **no empty row**
        (requirement 15's fallback).
      - `Active` → no panel at all.
      - **The input flipped mid-life** — set `Active`, then set `Terminating` with a date, and assert
        the date appears without re-creating the component. This is the one that would have caught
        v1's caching defect, and it is why it is listed rather than assumed.
- [x] `npx ng test --watch=false --browsers=ChromeHeadless` green.
- [x] `npx ng build` clean.

---

## Test Plan

| Requirement | Proven by |
|---|---|
| 13 — the effective date persists | `shows the effective date when a termination is recorded`, plus the flipped-input test proving it survives a re-pass rather than only an initial render |
| 14 — both dates when both facts hold | `shows both dates when the lease is archived and terminated` |
| 15 — from the response, with a fallback | `falls back to the v1 note when the date is absent`, and the absence of any date arithmetic in the component |

### Run it, do not only assert it

The v1 plan's two real defects — the caching `computed()` and the full-width Activate button — were
both found by **running the app**, not by the suite, because every spec set its inputs once. So after
the suite is green:

1. Start the API and the UI.
2. Create a month-to-month lease, activate it, terminate it with a future date.
3. **Reload the page.** The success banner is gone; the panel must still say when the lease ends.
   That reload is the whole requirement — before v2 this is the step where the date vanished.
4. Archive the same lease and reload again: both dates, and no actions offered.
5. Look at it. A cluttered panel is decision 6's open question answering itself.

---

## Verified by running it

287 specs pass (280 before, +7) and `ng build` is clean — one pre-existing budget warning on
`rent-agreement-create.component.scss`, untouched by this change. But the suite is not the evidence
that matters here, for the reason the Test Plan gave: **the requirement is that the date survives a
reload**, and every spec sets its inputs once.

So both apps were started — API on `:5169`, UI on `:4200` — a month-to-month lease was created and
activated through the real endpoints, terminated effective `2026-10-17`, and the Edit Lease screen
driven with Playwright.

### FR 13 — the date survives a reload

| | Panel | Buttons |
|---|---|---|
| First load, no success banner | `ENDS Oct 17, 2026` | Archive lease |
| **After an explicit `reload()`** | `ENDS Oct 17, 2026` | Archive lease |

Before v2 both rows read `(no panel)` and the note carried the whole message. The v1 note still
renders beside the date, which is requirement 13's other half — it explains the missing Terminate
button, which a date cannot.

### FR 14 — both dates on an archived lease

The same lease was then archived and re-read:

```text
PANEL : ENDS Oct 17, 2026   ARCHIVED ON Sep 2, 2026
BTNS  : (none)
```

`status` reports `Archived` and the termination date is still shown, which is exactly the case
requirement 14 exists for. It also confirms decision 3's placement: the panel sits outside the
archived/else split, so it renders in the branch an archived lease actually takes.

### Decision 6's open question, answered by looking

The Checklist flagged that the two-date panel might read as cluttered. It does not — two aligned
rows, quiet grey labels, bold values. **The question is closed, and no change was needed.**

### One thing the screenshot caught that no test would

The label was `Archived`, and the status chip beside the row already reads `ARCHIVED`. Rendered, the
row read as an echo of the chip rather than as two separate facts. It is now **`Archived on`**, which
sounds like a date label and stops competing with the chip.

No test asserted the label — the specs check that the dates appear, not what they are called — so
this was only ever findable by looking at it. That is the third defect in this component's history
found by running the app rather than by the suite; the other two are in the v1 plan.

---

## Out of scope, stated

- **Any countdown or "days left" indicator** — decision 5.
- **Exposing `version`** so the component could send the real one instead of `1`. Requirement 12's
  reasoning is unchanged and the detail response still does not carry it.
- **Un-terminate and un-archive.** The backend has neither (FR-107), so there is nothing to build a
  control for.
- **The list screen.** There is no list query in the backend — `IRentAgreementReadQueries` exposes
  only `GetDetailAsync` — so there is no other screen to carry these dates yet.
