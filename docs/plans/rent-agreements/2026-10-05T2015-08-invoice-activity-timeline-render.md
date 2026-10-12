**Spec:** [`docs/specs/rent-agreements/08-invoice-activity-timeline-ui.md`](../../specs/rent-agreements/08-invoice-activity-timeline-ui.md) — v2

# The history is on the screen

[The previous plan](2026-10-05T1830-08-invoice-activity-timeline-ui.md) shipped `InvoiceHistoryService`
and left the rendering to a later version, on the argument that a typed page is provable against the
backend's worked example while a layout is not provable against anything until somebody looks at it.

Somebody looked, and the page showed nothing — which is the correct behaviour of what was built and
the wrong behaviour of what was wanted. This plan is the layout.

It adds **no requirement that was not already settled**. Spec v2's requirements 13–20 are v1's *Out of
Scope* list promoted: every one of them was fixed by a backend rule before either plan started, and
all they needed was somewhere to be built.

## 1. Setup & Environment

Repository `rent-schedule-ui`, branch `Piyush/invoice-activity-timeline-ui`.

```
npm test -- --watch=false --browsers=ChromeHeadless
```

Baseline before this change: **559 tests, 3 failing** — the two `scopeHeadersInterceptor` cases and
the one `RentAgreementCreateComponent` case that assert against `http://localhost:5169` while the
local `environment.apiBaseUrl` is `''`. Untouched here, as in the previous two plans.

**No backend change**, and no change to `InvoiceHistoryService` or its models — the previous plan's
client is used exactly as it shipped.

### Prerequisites & Open Questions

| Question | Answer |
|---|---|
| A section of the Update Invoice page, or its own component? | **Its own.** That page's stylesheet is already 6.8 kB raw against a 6 kB per-component budget and its class is 750 lines; the invoice list's rows are the obvious second caller, and a component taking an id is reusable where a section of another page is not. |
| Show the actor in the card header? | **No.** Every sentence that has an actor already ends *"… by {name}."*, so a header name prints it twice on every card. Where the server could not resolve one it has already dropped that clause (**BR-21**), so there would be nothing to show — which is also why no placeholder is needed. |
| Refresh the timeline after a correction saves? | **Yes, by re-reading.** A correction appends an event and the timeline is derived from the events, so the card exists the moment the response arrives. Composing the card locally was rejected: it would be the second record that **BR-01** exists to prevent. |

## 2. Milestone-Based Implementation

### Milestone 1 — The component (requirements 13–19)

`InvoiceActivityTimelineComponent`: a signal `input()` for the invoice id, an `effect` that resets and
re-reads when it changes, and signals for the cards, the loading flag, the error, the total and
whether more is held.

`loaded` is a separate signal from `cards().length === 0` on purpose: an empty timeline is a **real
answer** (**BR-04**, **BR-33**), so the "nothing has happened yet" line must not also appear during
the first request or after a failed one.

The template is where most of the requirements live, and each is commented at the line it binds:
`occurredAtDisplay` rather than a `DatePipe` (14), interpolation rather than `[innerHTML]` (15),
`track card.groupId` and `track entry.sequence` with no sort (16), no actor in the header (17).
`badgeClass` carries the default branch (18).

| | |
|---|---|
| Production files | `invoices/invoice-activity-timeline.component.ts` / `.html` / `.scss` |
| Rules | requirements 13, 14, 15, 16, 17, 18, 19 |
| Tests | `asks for nothing until it is given an invoice id`, `reads the timeline when it is given one`, `renders the cards in the order they arrived`, `keeps both sentences of a single edit on one card, in sequence order`, `shows the server-formatted time, not a re-derived one`, `renders an owner-typed value as text and never as markup`, `says nothing has happened rather than reporting an error on an empty timeline`, `reports a 404 as a failure, distinctly from an empty timeline`, `gives a badge it has no rule for the default style`, `renders a card whose actor has no name without inventing one`, `says how much it is not showing when the server holds more`, `clears the previous invoice timeline when the id changes`, `re-reads on reload, showing the card the correction just created` |

### Milestone 2 — The page gives it an id and a nudge (requirements 13, 20)

`UpdateProposedInvoiceComponent` renders `<app-invoice-activity-timeline [invoiceId]="loaded.invoiceId" />`
inside the `@if (invoice(); as loaded)` block — so it is offered for every loaded invoice, deleted and
uncorrectable ones included — and holds a `viewChild` so the save handler can call `reload()`.

A `viewChild` rather than another input because the timeline owns its own fetching. The one thing this
page knows that the timeline cannot is that an event was just appended on its behalf.

**The existing spec file needed a stub, not a fix.** The page now issues a history request on every
loaded invoice, and `httpMock.verify()` failed on 43 of its 55 tests with an open request. The fix is
the convention that file already uses for `FileDownloadService` — replace the service wholesale — which
keeps `verify()` strict for everything the page itself does and leaves the timeline's fetching to the
timeline's spec. What the page owes the child is an id and a nudge, and both are assertable on the spy.

| | |
|---|---|
| Production files | `invoices/update-proposed-invoice.component.ts` / `.html` |
| Rules | requirements 13, 20 |
| Tests | `hands the timeline the loaded invoice id`, `re-reads the timeline after a correction saves`, `does not read a timeline before an invoice is loaded` |

## 3. Validation

| | |
|---|---|
| `npx tsc --noEmit` | clean, both `tsconfig.app.json` and `tsconfig.spec.json` |
| New tests | **16** — 13 on the component, 3 on the page |
| Full suite | **572 passing, 3 failing** — the same three as before, named above |
| `ng build --configuration production` | succeeds. Two component-style budget warnings, both pre-existing (`invoice-list`, `rent-agreement-create`); the new stylesheet is 1.6 kB and `update-proposed-invoice.component.scss` is untouched |
| Dev server | rebuilt clean on the qa configuration; the `update-proposed-invoice` chunk goes 97.05 kB → 121.69 kB |

**Not yet proven:** a real timeline from the qa service. Every card in every test is a fixture built
from the backend spec's worked example, which is a contract check and not an integration one. Seeing
real cards needs a bearer pasted into **Test scope** on a qa invoice that has actually been corrected.
