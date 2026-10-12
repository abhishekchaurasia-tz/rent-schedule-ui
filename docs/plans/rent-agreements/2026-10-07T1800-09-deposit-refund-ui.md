**Spec:** [`docs/specs/rent-agreements/09-deposit-refund-ui.md`](../../specs/rent-agreements/09-deposit-refund-ui.md) — v1 · [`docs/specs/rent-agreements/04-invoice-list-ui.md`](../../specs/rent-agreements/04-invoice-list-ui.md) — v10
**Author:** Piyush Raj · **Created:** 2026-10-07

# The deposit goes back through Billing

Billing now fronts every refund of a deposit invoice it raised — backend `15-deposit-refund.md` v2:
one read (`GET /invoices/{id}/deposit-refund`) and three writes (return, cancel, remove), each checked
by Billing before it is forwarded to Finance. Nothing in this application can call any of them, so
nothing can drive them end to end before the owner app is pointed at them. This plan builds the
screen that does: the production owner app's *Refund Deposit* → *Return Deposit* → *Return Offline* /
*Return Online* flow and its *Funds Returned* block, on this app's own styling.

## 1. Setup & Environment

Repository `rent-schedule-ui`, worktree `rent-schedule-ui-deposit-refund`, branch
`Piyush/deposit-refund-billing-invoices` cut from `origin/main`. `node_modules` is a symlink to the
main checkout's (git-ignored by `/node_modules`), so no install is needed.

```
npm test -- --watch=false --browsers=ChromeHeadless
npm run build
```

Baseline before this work: **532 specs, all passing.**

**No backend change.** All four endpoints are built and specified in `innago-billing`; nothing there
is edited by this plan.

### Prerequisites & Open Questions

**None blocking.** Each of these was checked rather than assumed:

| Question | Answer |
|---|---|
| Which member carries the Problem Details code? | **`errorCode`.** `Innago.BuildingBlocks.Api` 9.5.2 writes `Error.Code` there and `InvoiceReadEndpointTests` assert on that name. The handoff note says `code`; the client reads `errorCode` and falls back to `code`. |
| What does the server already say for `submission_unconfirmed`? | *"The payment service did not confirm the request. Check Funds Returned before trying again."* — so the client renders `detail` verbatim and adds behaviour (close, re-read), not words. |
| Where can the owner's bank account come from? | Nowhere this app can reach — merlin's `Home/DropDown/GetPropertyOwnerBankDetails`. The panel types it, labelled field by field. |
| Spec number? | **09.** 07 and 08 are taken by the invoice download and activity-timeline UIs in flight on another branch. |
| Where is the page reached from? | The Invoices list's row menu (spec 04 v10), the sidebar, and `?invoiceId=`. **Not** the Update Invoice page: its files are being changed on that other branch, and a link there is a one-line follow-up once it lands. |

## 2. Milestone-Based Implementation

### Milestone 1 — The four calls, typed (spec 09 contract)

`deposit-refund.models.ts` mirrors the wire: snake_case unions for `status`, `method` and `mode`, the
response, and `CreateDepositRefundRequest` with `ownerBank` and `backupAddress` optional.
`DepositRefundService` is four one-line `HttpClient` calls; it decides nothing.

| | |
|---|---|
| Production files | `invoices/deposit-refund.models.ts`, `invoices/deposit-refund.service.ts` |
| Rules | contract |
| Tests | `get() reads …/deposit-refund`, `create() posts the request body unchanged`, `cancel() posts with no body and resolves on 204`, `remove() sends DELETE and resolves on 204`, `propagates a 422 with its problem body` |

**Commit:** `feat(deposit-refund): the four Billing calls, typed`

`STOP — review checkpoint`

### Milestone 2 — Reading a refusal, and naming a payer (FR 2, 13, 14, 18)

`deposit-refund.util.ts`:

- `describeProblem(err)` → `{ message, code }`: `detail` verbatim, else the status line; `errorCode`,
  else `code`, else `null`.
- `isMoney(value)` — finite, ≥ 0, at most two decimals, with an epsilon so binary floating point does
  not turn `0.29` into a refusal; `roundMoney(value)` for every sum.
- `tenantDisplayName(tenantId, name)` — the server's name, else the stand-in from
  `placeholderTenantIdentity`, so one tenant is one person across the app.

| | |
|---|---|
| Production files | `invoices/deposit-refund.util.ts` |
| Rules | FR 2, 13, 14, 18 |
| Tests | `reads detail and errorCode`, `falls back to code when errorCode is absent`, `falls back to the status line`, `isMoney accepts two decimals and refuses three, negatives and NaN`, `roundMoney removes floating point noise`, `prefers the server name and falls back to the stand-in` |

**Commit:** `feat(deposit-refund): problem details, money and names`

`STOP — review checkpoint`

### Milestone 3 — The page: the view, the action, Funds Returned (FR 1–4, 15–17, 19)

`DepositRefundComponent` at `/invoices/deposit-refund`, copying the Update Invoice page's lookup box
(GUID check, `?invoiceId=` on init) and the Invoices list's ⋮ row menu (fixed-position, rendered as a
sibling of the scrolling table, confirm step inside the menu).

Gating is the server's flags and nothing else: *Refund Deposit* renders on
`isDepositInvoice && isFullyPaid`, is disabled with *"Deposit has already been refunded."* on
`isDepositFullyRefunded`, and `openPanel()` re-checks `canRefundDeposit` so the panel cannot be reached
around the disabled button. Row actions read `canCancel` / `canRemove` per row.

**Flow Card** — *trigger:* the owner opens a deposit row's menu on the Invoices list and picks
**Deposit Refund**.
`invoice-list.component.html` link → `/invoices/deposit-refund?invoiceId=…` →
`DepositRefundComponent#ngOnInit` → **`#load` — the GUID check lives here** → `DepositRefundService.get`
→ `GET /api/v1/invoices/{id}/deposit-refund` → Billing reads Finance live → the view renders flags,
action, Funds Returned, totals.
*Fails when:* Finance cannot be read — `502 payment_service_unavailable` — and the page shows the
detail, never zeros.
*Start debugging here:* the `GET`'s response in the network tab; every figure on screen is a field of it.

| | |
|---|---|
| Production files | `invoices/deposit-refund.component.ts`, `.html`, `.scss` |
| Rules | FR 1, 2, 3, 4, 15, 16, 17, 19 |
| Tests | `refuses a malformed id inline and issues no request`, `loads ?invoiceId= on open`, `reports a 502 with its detail and shows no figures`, `a non-deposit invoice shows the notice and no action`, `a deposit not fully paid shows no action`, `Refund Deposit is enabled when refundable`, `Refund Deposit is disabled with the tooltip when fully refunded`, `openPanel refuses when canRefundDeposit is false`, `renders one Funds Returned row per entry with labels and N/A for cash`, `renders the five totals as served`, `offers Cancel only when canCancel and Remove only when canRemove`, `no menu when a row allows neither`, `cancel posts after confirmation, confirms and re-reads`, `remove deletes after confirmation, confirms and re-reads`, `a refused cancel shows the detail`, `an unconfirmed remove also re-reads`, `a scope change re-reads the view` |

**Commit:** `feat(deposit-refund): the refund view, its action and Funds Returned`

`STOP — review checkpoint`

### Milestone 4 — Return Deposit: offline and online (FR 5–14)

`ReturnDepositPanelComponent` — inputs `view` and `submitting`, outputs `submitted` and `closed`, the
same host/panel split as `AdditionalChargePanelComponent`: the panel builds and checks the request,
the host sends it and owns the outcome.

- **Offline:** a `FormArray` row per `tenants[]` entry. A method change to Cash disables and clears
  the number box (a `valueChanges` subscription, so it holds however the value is set).
- **Online:** one `FormGroup` — tenant, amount, interest, the seven bank fields, and an optional
  backup address behind a checkbox.
- **`validate()`** returns every reason as a sentence; `submit()` marks the attempt, refuses while the
  list is non-empty, and otherwise emits the request built by `buildRequest()`. After the first attempt
  the list is live, so it shrinks as the owner fixes things.

The host (`DepositRefundComponent#onReturnSubmitted`) posts once, ignores re-entry, and on the answer:
`202` → close, success sentence by mode, re-read; `400`/`422`/`502 payment_service_unavailable` →
floating error above the open panel; `502 submission_unconfirmed` → close, warn, re-read.

**Flow Card** — *trigger:* the owner enters $9 by Check #1042 for one tenant and presses Return
Deposit.
`return-deposit-panel.component.ts#submit` → **`#validate` — the client mirror of BR-17/BR-19 lives
here** → `#buildRequest` (drops zero-amount rows, no `checkNumber` on cash) → `(submitted)` →
`deposit-refund.component.ts#onReturnSubmitted` → `DepositRefundService.create` →
`POST /api/v1/invoices/{id}/deposit-refunds` → Billing re-checks on a fresh Finance read and forwards
once → `202` → success banner, `refresh()`.
*Fails when:* a client check drifts from the server's — the server still refuses with `422`, and the
floating banner shows its sentence; the panel keeps the entries.
*Start debugging here:* `validate()`'s return value for the entries on screen.

| | |
|---|---|
| Production files | `invoices/return-deposit-panel.component.ts`, `.html`, `.scss`; `invoices/deposit-refund.component.ts`, `.html` |
| Rules | FR 5, 6, 7, 8, 8a, 9, 10, 11, 12, 13, 14 |
| Tests | panel: `builds one offline row per tenant`, `cash clears and disables the number`, `running totals`, `refuses principal above remaining with the server's sentence`, `refuses no amount at all`, `refuses three decimals and negatives`, `requires the check and money order number, at most 25`, `refuses interest without an amount`, `sends only rows with an amount, and no checkNumber on cash`, `switching mode keeps both forms`, `online requires one tenant, the bank fields and a whole-number account type`, `online backup address rules`, `online request carries ownerBank, the address only when included, and no method`, `emits nothing while submitting`. Page: `posts the panel's request once`, `202 closes, confirms by mode and re-reads`, `422 keeps the panel open and shows the detail and code`, `submission_unconfirmed closes, warns and re-reads` |

**Commit:** `feat(deposit-refund): return the deposit offline or online`

`STOP — review checkpoint`

### Milestone 5 — Reaching it (FR 1; spec 04 FR 27)

A lazy `loadComponent` route at `invoices/deposit-refund`, declared beside `invoices/update`; a
sidebar link; and one row-menu link on the Invoices list for `invoiceType === 'deposit'`.

| | |
|---|---|
| Production files | `app.routes.ts`, `app.component.html`, `invoices/invoice-list.component.ts`, `.html` |
| Rules | FR 1; spec 04 FR 27 |
| Tests | `invoice-list: a deposit row's menu links to Deposit Refund`, `invoice-list: a rent row's menu does not` |

**Commit:** `feat(deposit-refund): reachable from the Invoices list and the sidebar`

`STOP — review checkpoint`

## 3. Scope & Context Rules

**Touched:** the five new production files and their four specs under `src/app/invoices/`,
`invoice-list.component.{ts,html,spec.ts}`, `app.routes.ts`, `app.component.html`, spec 09 (new),
spec 04 (v10 row, FR 27), and this plan.

**Not touched, deliberately:**

- **`update-proposed-invoice.*`.** Being changed on another branch (invoice download, spec 07); a link
  from there is a follow-up.
- **`scope-headers.interceptor.ts`.** The four calls are ordinary `HttpClient` calls under
  `apiBaseUrl` and already carry the scope headers or the bearer.
- **`src/styles.scss`.** The page reuses `.banner`, `.panel-overlay`, `.close-btn` and `.link-btn`
  as they are; nothing new is promoted to global unless a component breaches its budget.
- **Anything in `innago-billing`.**

### Technical Decisions

| # | Decision | Chosen | Rejected, and why |
|---|---|---|---|
| 1 | Where the screen lives | A page of its own at `/invoices/deposit-refund` | *A section of the Update Invoice page* — that page corrects a proposal and its files are mid-change elsewhere; *a panel on the Invoices list* — Funds Returned and its row actions need a page's room |
| 2 | Who sends the write | The page; the panel emits the request | *The panel posts itself* — the outcome (close, banner, re-read) is the page's, exactly as the fee panel leaves `POST …/additional-charges` to its host |
| 3 | The owner's bank account | Typed fields, labelled with their source and that three are already encrypted | *A bank dropdown* — the list is merlin's and unreachable; *one JSON box* — invites malformed input with no field-level message |
| 4 | Client validation | Mirror BR-17/BR-19 sentence for sentence, plus FR 8a | *Leave it to the server* — the owner app checks first, and a `400` lists one rule at a time; *stricter rules* — invents limits the server does not have (interest has no ceiling, D7) |
| 5 | Interest with no amount | Refused client-side (FR 8a) | *Send it* — BR-18 drops the row and the interest silently; *drop it quietly too* — loses what the owner typed with no word |
| 6 | `submission_unconfirmed` | Close, re-read, warn | *Keep the panel open* — one click from queueing the same return twice, which is exactly what the server's sentence warns against |
| 7 | Cancel/Remove failures | A page banner | *Inside the row menu*, as the Invoices list does — the re-read after `submission_unconfirmed` can remove the row and the menu with it, taking the message along |
| 8 | Dates on Funds Returned | The server's date part, full value on hover | *`DatePipe` in local time* — can move a return across midnight; the app shows dates as the server states them elsewhere |
| 9 | Names | Server name, else the stand-in person | *The short id* — the same tenant then reads as a person on the Invoices list and a hex string here |

## 4. Verification

```
npm test -- --watch=false --browsers=ChromeHeadless
npm run build
```

- Every milestone's tests red before its production code, green after.
- The whole suite green: 532 existing specs unchanged, plus the new ones.
- Production build clean: initial bundle under 800 kB (the new page is a lazy chunk), and each new
  component's styles under the 6 kB per-component warning.
- Manually, against a local Billing API with Finance reachable: open a fully paid deposit invoice from
  the Invoices list, return part of it by check, confirm the `202` banner and — once Finance's consumer
  has run — the row under *Funds Returned*; remove it; confirm a principal above *Remaining* is refused
  with *"Amount to return should be less than remaining amount"* before any request is sent.

## 5. Git & Rollback

Branch `Piyush/deposit-refund-billing-invoices` off `origin/main`, one commit per milestone, each a
working state — **made only on the user's confirmation**. Rollback is a revert: nothing is migrated,
nothing is persisted, and no other screen depends on the new files.

## 6. Final Validation

**601 pass, 0 fail**, up from 532: 69 new — service 5, util 9, panel 25, page 28, Invoices list 2. No
existing test was rewritten.

**Red was confirmed after the fact, by mutation.** Tests and code were written in the same pass, so
seven rules were broken deliberately in the production files and the invoices specs re-run: the
principal cap, the cash rule, the zero-amount filter, the `submission_unconfirmed` branch, the
`openPanel` guard, the `errorCode` read and the deposit-type gate. **11 specs failed, every one of them
written for one of those seven rules, and none other**; the files were then restored byte for byte.

**`npm run build` is clean of errors.** Initial total **335.74 kB** (budget 800 kB); the page is its own
lazy chunk, `deposit-refund-component`, 38.71 kB raw. Neither new component's styles trips the 6 kB
warning. Two warnings print, both **pre-existing and untouched**: `rent-agreement-create.component.scss`
(6.92 kB) and `invoice-list.component.scss` (7.14 kB) — both byte-identical to `origin/main`.

**Not run:** the manual pass in section 4 needs a local Billing API with Finance reachable, which this
session did not have.

### Diverged from the plan

**The row menu's item reads *Cancel*, so its confirmation's back-out reads *Keep it*.** The brief names
the action *Cancel*; a confirm step offering *Cancel* beside *Yes, cancel it* would have asked the owner
to choose between two cancels.

**The panel's rows read their tenant from the row, not from `view.tenants[$index]`.** Found in review
before hand-off: a scope-change re-read (FR 19) can reorder or shrink the tenants under an open panel,
and positional lookup would have shown one tenant's name and *Deposit Held* against another's entries.
One test pins it.

**A failed re-read clears the view** rather than leaving the previous figures beside the error. Every
figure here sets what may be refunded, and a stale one under an error banner reads as current.

| Requirement | Where it is met |
|---|---|
| 1 | `app.routes.ts` lazy route; `DepositRefundComponent#ngOnInit` / `#load` |
| 2 | `#fetch` error branch — view cleared, `describeProblem` |
| 3 | the *facts* list and the two notices in `deposit-refund.component.html` |
| 4 | `showsRefundAction`, `refundActionDisabled`, `fullyRefundedTooltip`, the `openPanel` guard |
| 5 | `ReturnDepositPanelComponent#chooseMode`, one form per mode |
| 6 | `ngOnInit` row build; `applyCashRule` |
| 7 | `totalHeld`, `enteredInterest`, `amountToReturn`, `remainingAfter` |
| 8, 8a | `validateOffline` / `validateOnline`, live after `attempted` |
| 9 | `buildOfflineRequest` |
| 10 | `validateOnline`, `buildOnlineRequest`, the labelled bank fields |
| 11 | `submit()` guard; `onReturnSubmitted` re-entry guard |
| 12 | `onReturnSubmitted` `next` |
| 13 | `submitError` and the floating banner |
| 14 | `onReturnSubmitted` `SUBMISSION_UNCONFIRMED` branch |
| 15 | the *Funds Returned* table; `statusLabel`, `methodLabel`, `checkNumberLabel`, `datePart` |
| 16 | the row menu; `beginRowAction`, `confirmRowAction` |
| 17 | the totals list |
| 18 | `tenantDisplayName`, `payerLabel`, `tenantName` |
| 19 | `reloadOnScopeChange(() => this.refresh())` |
| spec 04 FR 27 | `InvoiceListComponent#isDepositInvoice` and the row-menu link |
