**Spec:** [`docs/specs/rent-agreements/08-invoice-activity-timeline-ui.md`](../../specs/rent-agreements/08-invoice-activity-timeline-ui.md) — v1

# The invoice can be asked what happened to it

The Update Invoice page can correct an invoice, show every figure on it, and now save it as a PDF.
What it cannot do is answer the question a correction creates: *who changed this, and from what?*

Billing has been recording the answer all along and never reading it back. Every invoice **is** its
event stream — `InvoiceRaised`, then `InvoiceCorrected`, `InvoiceMarkedOverdue`, `PaymentRecorded`,
`InvoiceVoided`, `InvoiceDeleted` — and each one carries an `EventActor` whose own remarks say it
exists *"so the audit trail required by FR-25 can be derived from the stream alone"*. The read side
never took that up: `InvoiceProjection` folds the events into the invoice's current face and discards
the sequence, leaving the rest as, in its own words, *"inert history"*.

`12-invoice-history.md` v4 is the reader that was always implied, and it has been exercised against a
running service. This plan is the client of it.

## 1. Setup & Environment

Repository `rent-schedule-ui`, branch `Piyush/invoice-activity-timeline-ui`.

```
npm test -- --watch=false --browsers=ChromeHeadless
```

The suite stands at **559**, of which **3 fail before this change and after it** — two
`scopeHeadersInterceptor` cases (`Req15e_NonApiUrl_NeverReceivesTheToken`,
`Req12d_NonApiUrl_IsUntouched`) and one `RentAgreementCreateComponent` case
(`FR34_EditingASavedLease_HandsTheDrawerItsRoster`), all of them asserting against
`http://localhost:5169` while the local `environment.apiBaseUrl` is now `''`. They are the same three
spec `07`'s plan recorded, they are untouched by this work, and fixing them is a different change with
a different spec.

**No backend change.** The endpoint, the fold, the sentence catalog and the Identity lookup all exist
and are specified; nothing in `innago-billing` is edited by this plan.

### Prerequisites & Open Questions

Three things were checked against the backend source rather than assumed, and one of them contradicts
the backend spec's own prose.

| Question | Answer |
|---|---|
| Is the paging field `page` or `pageNumber`? | **`pageNumber`.** Backend `12`'s sample response prints `"page": 1`, but the endpoint returns `Innago.BuildingBlocks.Application.PagedResult<T>`, whose member is `PageNumber`, and nothing renames it on the way out (`BuildingBlocks.Application/PagedResult.cs:19`). The *query parameter* is `page`; the *response field* is `pageNumber`. This is why the existing `PagedResult<T>` is reused rather than a second interface written from the sample. |
| Do the enums arrive `snake_case`, like every other enum this app reads? | **No — PascalCase.** `InvoiceHistoryCardResponse.From` maps each one with `.ToString()` into a `string` property, so `JsonStringEnumConverter(SnakeCaseLower)` never sees it. Verified in `InvoiceHistoryCardResponse.cs`, `HistoryActorResponse.cs` and `InvoiceHistoryEntryResponse.cs`. |
| Does an uncorrectable, deleted or voided invoice have a history? | **Yes, in full**, ending with the card that records the removal (**BR-27**) — the same rule `GET /invoices/{id}` follows. So the timeline will not be gated on the page's `isCorrectable`, for the same reason the download is not. |

The qa endpoint was reached through the dev-server proxy and answers `401` at the gateway without a
bearer, exactly as `GET /invoices/{id}` does — routing confirmed, contract not exercised end to end
from this application yet.

## 2. Milestone-Based Implementation

### Milestone 1 — The wire shapes (requirements 6, 7)

`invoice-history.models.ts`: `InvoiceHistoryCard`, `InvoiceHistoryEntry`, `HistoryActor`, the two
enum unions, and `InvoiceHistoryQuery`.

The two things worth writing down are written down in the file, because both are places a reader's
instinct is wrong:

- the enums are **PascalCase** while every neighbour in `invoice.models.ts` is `snake_case`, and the
  reason is the `.ToString()` mapping rather than an inconsistency to normalise;
- `InvoiceHistoryActivityType` has **no creation member** (**BR-04**) and **five unproduced members**
  (**BR-25**), so a renderer needs a default branch and the absence of a creation badge is not an
  omission to fill.

| | |
|---|---|
| Production files | `invoices/invoice-history.models.ts` |
| Rules | requirements 6, 7 |
| Tests | none of its own — the types are exercised by Milestone 2's fixtures, which are the backend spec's worked example verbatim |

### Milestone 2 — The read (requirements 1–5, 8–12)

`InvoiceHistoryService.getHistory(invoiceId, query?)` → `Observable<PagedResult<InvoiceHistoryCard>>`.

A separate service from `InvoicesService` because it reads a different resource — the invoice's past,
out of `mt_events`, through a different handler — not merely a different route.

`toParams` omits either paging member that is absent, the same discipline as
`InvoicesService.toParams` and for the same reason: `pageSize=` is an invalid page size rather than
the absence of one. The ordinary call therefore sends a bare URL and takes the server's page 1 of 50,
which for every invoice this application has seen is the whole history.

| | |
|---|---|
| Production files | `invoices/invoice-history.service.ts` |
| Rules | requirements 1, 2, 3, 4, 5, 8, 9, 10, 11, 12 |
| Tests | `asks for the timeline with no paging parameters and no scope of its own`, `sends page and pageSize when the caller names them`, `omits the member the caller did not name`, `answers the cards in the order they arrived`, `keeps both sentences of a single edit on one card, in sequence order`, `reports the paging envelope the server sent`, `treats an empty page as a success`, `accepts a card whose actor has no id and no name`, `propagates a 404 with its Problem Details body readable as JSON`, `reads a deleted invoice history, ending with the deletion card` |

## 3. Validation

| | |
|---|---|
| `npx tsc --noEmit` | clean, both `tsconfig.app.json` and `tsconfig.spec.json` |
| New tests | **10, all green**, run in isolation and in the full suite |
| Full suite | **556 passing, 3 failing** — the same three as before the change, named above |
| qa routing | `GET /billing/api/v1/invoices/{id}/history` through the dev-server proxy answers `401` at the gateway without a bearer, exactly as `GET /invoices/{id}` does |

**Not yet proven:** a real timeline from the qa service. That needs a pasted bearer and a component to
read it with, and the second of those is the next version.

## 4. What this plan deliberately does not build

**The timeline on screen.** No component renders a card. That is the next version, and the rules it
has to honour are already fixed by the backend and recorded in the spec's *Out of Scope* so that
version can argue about layout and nothing else — render `occurredAtDisplay` rather than
`occurredAt`, interpolate `text` and never `[innerHTML]` it, re-sort nothing, track by `groupId`,
print nothing where a name is `null`, default-branch the badge, and distinguish an empty page from a
`404`.

Shipping the client ahead of the component is the same split spec `07` used, and it is worth the same
remark: a service that answers a typed page is provable against the backend's own worked example
today, while a layout is not provable against anything until somebody looks at it.
