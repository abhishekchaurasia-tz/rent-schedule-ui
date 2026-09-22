## Changelog

| Version | Date | Summary | Plan |
|---------|------|---------|------|
| v14 | 2026-09-22 | **The mode the owner picked goes on the wire, and typing a share stops meaning anything about who pays.** New **FR 26**; **FR 25 is corrected — its naming half is reversed.** *Decided by the user 2026-09-22, resolving a direct conflict between this spec and the service.* **The conflict.** v13 made *typing any share* the instruction that a fee **names** its renters, so a *Shared Lease* fee with figures in it stopped covering renters added later. The service decided the opposite on 2026-09-21 and shipped it in `06-unified-invoice-generation.md` v122 (**BR-30**): a fee recorded as `Shared` resolves its payers from the **live roster** every time it is billed, and its stored rows are a *record of how it divided at save*, not a list of who owes it. Both could not hold. **BR-30 wins.** Naming is now what the **mode control** says and nothing else. **What this page must send.** The service added an optional `splitMode` field taking `Shared` or `PerTenant`. Until this page sends it the service falls back to what the payer-row count used to mean — *a body carrying a split is `PerTenant`* — so a *Shared Lease* fee whose owner typed figures is recorded as `PerTenant` today and silently stops following the roster. **That is a live defect and FR 26 is its fix.** **What the screen loses.** v13 put a notice beside the shares saying that naming costs coverage of future renters. The notice is right and its trigger is wrong: it belongs to the **mode control**, not to the first keystroke in a share box. **What stays from v13:** both modes keep the same share boxes and the same unit control, which was the other half of FR 25 and is unaffected. | [2026-09-22T1400-02-the-mode-goes-on-the-wire](../../plans/rent-agreements/2026-09-22T1400-02-the-mode-goes-on-the-wire.md) |
| v13 | 2026-09-21 | **Shared Lease gains the same share boxes as Split per Tenant, and naming a share is what makes a fee stop covering renters added later — said on screen instead of discovered.** New **FR 25**; **FR 5 is corrected**. *Raised by the user 2026-09-21: the percentage control added in v11 is not on the Shared Lease option, which is where they looked for it, and they want the same capability there.* **Why it was not there, and why that was the wrong answer.** Shared Lease sends no `tenantShares`, so there was nothing to state a percentage against; the boxes lived in *Split per Tenant*, which pre-ticks everybody and covers the same people. That is true, and it is useless — the owner has to already know it to find the feature. **The conflict the two modes were keeping apart.** A fee with **no** split resolves against the **live roster** every time an invoice is built: a renter who joins in March is charged it from March. A fee that **names** people only ever **shrinks** — `named.Where(roster.Contains)` drops a renter who leaves and never adds one who joins. So *"shared by everyone, now and later"* and *"Alice 60 %, Bob 40 %"* cannot both hold, and the page was reconciling them by hiding one. **FR 25 puts the boxes on both modes and states the cost where the owner pays it.** Typing any share, in either unit, makes the fee **name** the current renters, and the page says so in the same breath: *a renter added later will not be charged this fee*. Clearing the shares returns it to genuinely shared. **Rejected, and recorded so it is not re-litigated:** keeping the roster live **and** the percentages stated needs weights that re-normalise as the roster changes — a new backend concept, a rule for what a joiner is owed, and a reopening of BR-01. **No backend change and no contract change**: a body the service already accepts, from a mode that could not previously build one. | [2026-09-21T1700-02-naming-a-share-is-a-decision](../../plans/rent-agreements/2026-09-21T1700-02-naming-a-share-is-a-decision.md) |
| v12 | 2026-09-21 | **FR 24 is answered, and the answer is that there is nothing to disclose.** *Decided by the user 2026-09-21, from measurements taken after v11 shipped.* v11 recorded that switching the split’s unit moves the money by a cent — an even `$300` three ways is `100.00` each, `33.33 %` of `300` is `99.99` — and asked how loudly the page should say so. **The premise was wrong.** `100.00 / 100.00 / 100.00` has no expression as three **two-decimal** percentages of `300`, but it has one at six: `33.334 / 33.333 / 33.333` totals a hundred exactly and each row resolves back to `$100.00`. **So the percentages are divided, not rounded** — by the same money-first residue rule the amounts already use, whole units each with the leftover one at a time to the first rows. **Six places because that is what the column holds**: `additional_charge_tenant_share.share_percent` is `numeric(9,6)`, so the figure the page sends is the figure the service stores, losslessly. *An earlier recommendation in this work said three places; it is wrong and is recorded as such — three totals a hundred but the money stops surviving the round trip above roughly `$500`, and a `$1,500` fee across six renters moves a cent. Six held for every total measured, to `$12,345.67` across seven.* **The residue never lands on a row the owner typed**, only on the ones the page derived: answering `66.670001` to somebody who entered `66.67` is the page balancing its books with their input. **No backend change and no contract change.** | [2026-09-21T1400-02-the-unit-belongs-to-the-split](../../plans/rent-agreements/2026-09-21T1400-02-the-unit-belongs-to-the-split.md) |
| v11 | 2026-09-21 | **Switching one row to `%` produces a save the server always refuses, because the unit belongs to the split and this page treats it as a property of the row.** **FR 18, 19 and 20 are corrected; new FR 24.** *Found 2026-09-21 by checking this page against the service’s own rule, after the same gap was closed on the API side.* **The defect.** `toTenantShareInputs` attaches `sharePercent` only to rows typed **as** a percentage. The service sums the **stated** percentages and requires exactly `100.00` — so a two-renter `$300` fee with one row switched to `%` and typed `70` sends one stated percentage of `70`, and is refused `422 additional_charge.tenant_share_percentages_do_not_total_one_hundred`. The screen shows `210.00 / 90.00`, the amounts total the fee exactly, and Save is enabled. *Measured 2026-09-21 by running `tenant-split.util.ts` against the rule as `ValidateTenantShares` implements it.* **Only a split where every row is typed as a percentage survives**, and nothing on screen says so. **FR 18 is corrected: the unit is the split’s, not the row’s** — one control above the table, so the payload can only ever be all-percent or all-amount, which is the shape the service accepts. **FR 20 is corrected twice over:** `sharePercent` rides on **every** row when the split is in percent, and it carries **what the owner typed**, not a figure re-derived from the rounded amount — the derivation quietly turns a split authored as `33.334 / 33.333 / 33.333` into three `33.33`s totalling `99.99`, which is the same refusal by another route. **FR 19 gains a percentage arm**, so the page refuses before the server does, as it already does for the money. **New FR 24 — switching the unit moves the money, and the page must say so.** Carrying a row across at its derived percentage re-applies it: an even `$300` three ways is `100.00` each, and `33.33 %` of `300` is `99.99`. The rows become `99.99 / 100.01 / 100.00` because the owner changed how they were saying it. **This is not fixable by better rounding** — `100.00 / 100.00 / 100.00` has no expression as three percentages of `300`, which is exactly why backend v105 reversed requirement 30 to divide the money. The page discloses the change rather than hiding it. **No backend change and no contract change:** the same fields, in a combination the service already accepts and this page could not produce. | [2026-09-21T1400-02-the-unit-belongs-to-the-split](../../plans/rent-agreements/2026-09-21T1400-02-the-unit-belongs-to-the-split.md) |
| v10 | 2026-09-18 | **The page stops listing the renters, because the fee panel already does.** **FR 3 is corrected.** *Raised by the user 2026-09-18 — no need to show the tenant list when adding a fee from this page.* v8 moved the tenant picker into the fee panel and left a read-only roster card behind on the page "for context", which meant the same people were listed twice on one screen: once with their recorded rent and deposit shares, and again in the split editor with a checkbox and an amount each. **The duplicate is the copy that goes stale**, and it is also the one the owner does not need — they are about to pick renters in the panel, not read about them beforehand. The card is removed. **The two warnings it contained stay, because they are a state rather than a list:** a lease whose step 2 was never saved (`204`) still says so and still links to the ADD TENANTS screen (requirement 6), and a saved-but-empty roster still says a fee will be shared by whoever is added later. **What is genuinely lost is the recorded rent and deposit shares** — FR 3 asked for them and no screen shows them now. That is deliberate rather than overlooked: they describe how the *rent* is split, which is a different question from how this fee is, and nothing on this page acted on them. They can be added to the split editor’s subline if they turn out to be wanted. | — |
| v9 | 2026-09-18 | **Each renter gets a box for what they owe and a box for what they have paid, and the paid slice is finally sent.** New **requirement 23**; the Contract table row for `tenantShares` is corrected. *Asked for by the user 2026-09-18 — two boxes, one for the line item and one for the paid amount, each dividing into shares.* **The field was on the wire the whole time and this spec never recorded it.** `AdditionalChargeTenantShareInput` accepts `tenantId`, `amount`, `sharePercent` **and `alreadyPaid`** — read off the service’s own OpenAPI document at `/openapi/v1.json` on 2026-09-18 rather than assumed — and the response has carried a per-renter `alreadyPaid` since the split shipped. The Contract table here listed only the first three, so the client read the field back, never sent it, and had no box to type it into: the charge carried one `alreadyPaid` figure and the **server** divided it. **That is the hazard requirement 17 exists for** — one division shown and a different one stored — and it was live in the paid column for as long as the amounts column was being carefully protected from it. **The split table now has five columns**: Tenants, Shares, **Amount**, **Paid**, **Owes**. Amount and Paid are both typeable and both divide by the identical rule — money, to the cent, leftover cents one each to the renters at the top of the list, typed boxes left alone while untouched boxes absorb the difference — and they are **independent**, so fixing what one renter owes does not disturb what another has paid. **Owes is derived and never typed into.** **Paid is money only**, because there is no `alreadyPaidPercent` on the wire, so that column has no unit to choose. **Both columns must add up**, and the fee is named first when both are wrong: two messages at once names neither clearly. **A negative Owes is shown, not refused** — the charge itself lets `alreadyPaid` exceed its own total, so a stricter rule per renter would be one this screen invented. Also: the split row carries the renter’s id beside the name. The stand-in identities are drawn from 16 × 16 combinations, so two renters on one lease can read as the same person — hit while checking this in the browser, two rows both called *Bilal Mensah* — and these rows carry different money. **No backend change, no contract change:** a field that was always accepted is now sent. | — |
| v8 | 2026-09-18 | **The split editor moves into the fee panel, so the Invoices page gets the same one and the lease editor still gets none.** **FR 4 and FR 5 are corrected; FR 8 is restored; the *"panel is reused, not forked"* constraint is replaced.** *Raised by the user 2026-09-18, asking why the two screens that add a fee do not look alike.* **Both post to the same endpoint with the same field available, and only one of them could use it.** v7 put the tenant picker and the split on this **page**, because the fee panel is shared with the lease create/edit screens and requirement 22 says those must never gain a renter control. The Invoices page hosts that same panel, so it ended up with no way to say who pays at all — spec `04` FR 19 made that deliberate and pointed the user here for a subset. Two screens, one API, one of them able to send `tenantShares`. **The editor now lives in the panel behind a `tenants` input**, and that input is the whole of requirement 22: a host that passes a roster gets the editor, a host that passes none renders no renter control at all. The lease screens pass none. What was an architectural arrangement is now a single assertion, so a change that renders the editor unconditionally fails a test rather than quietly growing a split editor on the lease editor. **FR 8 stands again.** v7 could not satisfy it: the split divides the fee's money, the total lived inside the panel, and the panel is a drawer over a click-to-close dimmer — so nothing behind it could be typed into and Create had to *stage* the fee for a second, page-level Save. Inside the panel the total is already there, so Create posts once again and this page drops its picker, its staged-fee card, its split signals and its submit guard. **FR 4 moves rather than dies:** the selection is still per-row with the two modes, but it happens in the panel; this page keeps the roster as read-only context, which is all FR 3 ever asked for. **FR 5 is corrected** — an empty selection still means *every active renter shares this fee*, but it is now expressed by sending no `tenantShares`, not by `tenantIds: []`, which v7 FR 20 had already stopped sending. **The arithmetic moves to `tenant-split.util.ts`** because three screens divide a fee now and the rules are the part that must not differ between them; the control surface moves to `tenant-split-editor.component`, which also returns this page's stylesheet to under its budget. **No backend change, no contract change** — the same body, from one more screen. | — |
| v7 | 2026-09-17 | **The page gains the split editor the backend has been waiting for, and stops sending the tenant array.** New **requirements 17-22**. The backend shipped a per-tenant split on 2026-09-17 (`06-unified-invoice-generation.md` v105: `payerShares`, renamed to `tenantShares` in v109) and **this page has never sent it** — it still sends `tenantIds` and lets the server divide evenly. So the one thing the owner asked for, *typing what each renter owes*, is unreachable from the only screen that can say who pays. This version adds the editor: ticking renters fills an even division, each row is editable in **money or percentage**, and the rows must total the fee before the save is allowed. It also stops reading the echoed `tenantIds`, which backend v109 removes from the response — **the label naming who a fee landed on breaks the day that ships**, so this release must land first. | [2026-09-17T2200-02-the-owner-types-each-share](../../plans/rent-agreements/2026-09-17T2200-02-the-owner-types-each-share.md) |
| v6 | 2026-09-10 | **The page could not retry a save, and the one status that most deserves a retry is the one it is most likely to get.** New **requirement 16**; the *"idempotency key is out of reach"* constraint is **withdrawn**. `POST …/additional-charges` has keyed replay off the body's `id` since backend FR 57, and answers `200` rather than `201` when it recognises one — but the panel emits no `id`, so the page had nothing to replay with and could only block its own submit while a request was in flight. The page now mints one (`crypto.randomUUID()`) when the panel does not supply it, which costs nothing and makes the submission replayable, and retries **once** on `409` after 400 ms. The `409` is not hypothetical: it was reproduced against the running service by submitting a fee immediately after activating the lease, while that activation's own post-commit issuing pass still held the agreement. That is a lock that clears in well under a second, and the person on this screen has no way to act on being told about it. **Bounded to one attempt, and to `409` alone** — a `422` or a `404` is the user's to fix and reaches them on the first answer, and an unbounded retry on a write turns one slow request into several. | [2026-09-10T1900-02-replay-a-conflicted-fee](../../plans/rent-agreements/2026-09-10T1900-02-replay-a-conflicted-fee.md) |
| v5 | 2026-09-09 | **A fee could be saved with money on it that will never be billed, and this page said nothing — the third time this repository has discarded a report the backend sends on a success.** New **requirement 15**. `POST …/additional-charges` answers with the saved charge *plus* `unbilledLines`: the lines this save could bill nowhere, because every invoice they could have gone on has already taken a payment, and a paid invoice is corrected with a credit or a void rather than an edit (backend FR 101 / spec 04 v8 FR 41). The backend's own contract says it *"is never null, and never absent, so a client reads it unconditionally"* and that *"the defect being closed is not the refusal but the silence"* — **and `grep -rn "unbilledLines" src/` returned nothing at all.** So the owner entered a fee, saw it land in the committed list, and had no way to learn that part of its money reaches no invoice. **Rendered inside the charge's own card, not as a page banner**, because this page adds fees one after another: a disclosure keyed to the fee stays true while a "latest save" banner is overwritten by the next fee, which the third test pins. It is styled `warn` and leaves `submitError` untouched — the fee *was* saved, and the line stays on it. **The pattern, now recorded rather than rediscovered:** `blockedRemovals` (spec 01 v19), `skippedCycles` (spec 06 v1) and now `unbilledLines` were all reported on a `200` and all dropped. Two more remain unread — the schedule preview's `warnings` and `blocked` — and are named in the plan as the next slices rather than left to be found a fourth time. | [2026-09-09T1600-02-surface-unbilled-lines](../../plans/rent-agreements/2026-09-09T1600-02-surface-unbilled-lines.md) |
| v4 | 2026-09-01 | **The fee panel drops Semi-Annual when the lease is month-to-month.** A recurring charge's cadence is resolved against the lease window by the same candidate-date endpoint the lease form uses, and it refuses Semesterly + month-to-month — so the option would have produced a `400` mid-form with nothing on screen to explain it. The panel derives the term from `leaseEndDate` (no end date ⇒ month-to-month), exactly as its candidate-date request already does, and resets a disallowed frequency to Monthly at open time, after any prefill. See spec `01` v18 for the shared rule. | [2026-09-01T1000-month-to-month-frequency-options](../../plans/rent-agreements/2026-09-01T1000-month-to-month-frequency-options.md) |
| v3 | 2026-08-31 | **Picking a line item seeds the row's description with that item's name — but only when the description is still empty.** Picking an item is nearly always followed by typing the same word, so this saves the common keystroke; the emptiness check is what keeps it from being a data loss on the other path, where re-opening a saved charge to correct its type would otherwise overwrite whatever the property owner actually wrote. Applies to both arms of the picker — an existing catalog entry and a typed new item type — and treats a whitespace-only description as empty. New FR 14. (The panel is shared, so the Add Lease/Edit Lease screens and the Invoices page's add panel get this too.) | [2026-08-31T2100-line-item-seeds-description](../../plans/rent-agreements/2026-08-31T2100-line-item-seeds-description.md) |
| v1 | 2026-08-31 | **Initial spec: a standalone "Add Additional Fee" page.** Paste a rent agreement id, the page loads the lease (`GET /rent/agreements/{id}`) and its saved tenants (`GET /rent/agreements/{id}/tenants`), the user ticks which tenants the fee is charged to, builds the fee in the **existing** `AdditionalChargePanelComponent` — reused unchanged, no fork — and the page posts it to `POST /rent/agreements/{id}/additional-charges` with the ticked ids as `tenantIds`. Nothing on the lease-edit page changes: that page still batches its charges into `PUT …/terms`, which remains the only path that can edit or remove one. | [2026-08-31T1200-02-add-additional-charge-ui](../../plans/rent-agreements/2026-08-31T1200-02-add-additional-charge-ui.md) |

## Overview

`AddAdditionalChargeComponent` (`src/app/rent-agreements/add-additional-charge.component.ts`) is the
Angular page behind `/rent-agreements/additional-charges`. It appends **one** additional fee to an
**already saved** lease, charged to a chosen subset of that lease's tenants, through the backend's
`POST /rent/agreements/{id}/additional-charges` endpoint (backend spec `01-rent-agreement.md`
FR-054 – FR-062).

It is deliberately a *second* entry point for additional fees, not a replacement for the one on the
lease screen. The lease screen (spec `01-rent-agreement-edit-ui.md`) collects charges into the
lease's own create/edit body and can edit or delete them; this page can only **add**, but it is the
only place that can add one to a lease that is already saved — and the only place that can say *who
pays it*.

The fee itself is built by the existing `AdditionalChargePanelComponent`, imported and used as-is.
This spec adds no new fee-authoring UI; it adds the lease lookup, the tenant picker, and the wiring
to a different endpoint.

## Business Scope

A property manager needs to bill something that was not known when the lease was written — a
utility recharge, a repair cost, a pet fee — after the lease is saved and possibly after it is
active. Two facts drive the screen:

1. **The fee often belongs to some tenants, not all of them.** A lease with four renters may bill a
   parking fee to exactly one. The backend has modelled this since FR-058 (`tenantIds`), but no
   screen has ever sent it, so every fee raised from this UI has been shared by everyone.
2. **The lease is already saved**, so the fee cannot ride the create body. It needs the append
   endpoint, which commits the charge — and, when the charge stands alone on an active lease, the
   invoice it raises — in one transaction.

Success: a manager pastes a lease id, sees that lease's tenants, ticks the ones who owe the fee,
fills in the same fee panel they already know from the lease screen, and gets back the persisted
charge with its real id.

## Functional Requirements

1. The system shall present a rent agreement id input and shall refuse to load anything until the
   entered text is a well-formed GUID, reporting the malformed id inline rather than calling the API.
2. On load, the system shall fetch the lease (`GET /rent/agreements/{id}`) and its saved tenants
   (`GET /rent/agreements/{id}/tenants`) concurrently, and shall render nothing of the fee UI until
   both answer.
3. ~~The system shall render every **active** tenant the tenants endpoint returns, each with its
   `tenantId`, its recorded rent share and its recorded deposit share, and a stable stand-in name
   derived from the id.~~ **Corrected in v10 — this page renders no roster of its own.** It loads the
   roster and hands it to the fee panel, whose split editor is the one place renters are listed: each
   with a stable stand-in name derived from the id — the same derivation the ADD TENANTS screen uses, so
   the same tenant reads as the same person on both screens — the id beside it, a checkbox, and their
   share of the fee.
   **The recorded rent and deposit shares are no longer shown anywhere**, deliberately: they describe
   how the *rent* is divided, which is a different question from how this fee is, and nothing on this
   page ever acted on them.
4. ~~The system shall let the user select **any number** of those tenants, including none and all,
   with per-row checkboxes plus "Select all" and "Clear" actions.~~ **Corrected in v8 — the selection
   moved into the fee panel.** It is still per-row and still allows none and all, but it is made in
   `app-tenant-split-editor` beside the fee it divides, because the split needs that fee's total and the
   Invoices page needs the same control. This page renders the roster as **read-only context** (FR 3)
   and hands it to the panel.
5. The system shall treat an empty selection as *"every active tenant shares this fee"* and shall say
   so on screen, so an empty selection is never mistaken for an unfinished one. **Corrected in v8:** it
   is carried by sending **no `tenantShares`** (requirement 20), not by `tenantIds: []` — that array
   stopped being sent at v7, and this clause still named it. Both mean the same thing to the server;
   omission states *not specified* where an empty list states *specified as nobody*.
   **Corrected again in v13: the selection is no longer the only thing that decides.** A fee names its
   renters when the owner has selected a subset **or has typed any share**, and it is shared when
   neither is true. Shared Lease now carries the same boxes as Split per Tenant (requirement 25), so
   "shared" stopped being a mode the owner is in and became a **state the fee is in** — one they leave
   by typing a figure and return to by clearing them.
6. When the tenants endpoint answers `204 No Content` (the lease exists but step 2 was never saved),
   the system shall say so, offer a link to that lease's ADD TENANTS screen, and still allow a
   shared fee to be added; it shall not present a tenant picker with nothing in it.
7. The system shall open the existing `AdditionalChargePanelComponent` for fee authoring, passing
   the loaded lease's `propertyOwnerId`, `startDate` and `endDate` so the panel's catalog fetch and
   its candidate-date selects work exactly as they do on the lease screen.
8. On the panel's `created` event the system shall `POST /rent/agreements/{id}/additional-charges`
   **once**, with the panel's charge fields at the body root — **the split among them** (requirement 20)
   — and shall close the panel only after the request succeeds; a failed submission keeps the authored
   fee on screen instead of discarding it.
   **Breached by v7 and restored in v8, which is worth recording.** v7 put the split on this page, so
   Create could only *stage* the fee and a second page-level Save posted it: the split divides the fee's
   money, and the page could not see a total that lived inside the panel. Moving the editor into the
   panel removed the reason, not just the symptom — the total is beside the split now, and one click
   both authors and sends.
9. The system shall render each successfully added charge in a running list on the page — its server
   id, its category, its items and total, its recurrence, and who it was charged to — so a manager
   adding several fees in a row can see what has already been committed.
10. The system shall render a failed submission's RFC 9457 `detail` verbatim when the response body
    carries one, falling back to the status line, and shall keep the lease and its tenants loaded so
    the user can correct and retry without re-entering the id.
11. The system shall not send `isManualInvoice`: the backend accepts and ignores it (every invoice
    this route raises is `Manual` regardless), so sending it would assert a decision the client does
    not make.
12. The system shall not offer edit or delete on an added charge — the endpoint is additive only,
    and the lease screen's `PUT …/terms` remains the only path that changes one.
13. `toChargeCreationRequest` shall carry a loaded charge's `tenantIds` back into the request it
    builds, so a fee this page charged to a subset of tenants is not silently widened to everyone the
    next time the lease screen resubmits its complete charge set through `PUT …/terms`.
14. **v3** — Choosing an item in the fee panel — an existing catalog entry or a typed new item type —
    shall copy that item's name into the row's description **only when the description is empty or
    whitespace**, and shall never overwrite one that already says something.
15. **v5** — The system shall surface a saved charge's `unbilledLines` — each line's description and
    amount — **inside that charge's card in the committed list**, and shall keep each charge's
    disclosure independent of every other save, so a later fee that bills fine does not clear an
    earlier fee's. It shall present this as a **disclosure, not a failure**: `submitError` stays
    untouched, the charge stays in the list, and the wording says the fee was saved and what its
    lines could not do. When `unbilledLines` is absent, `null`, or empty, nothing is shown.

16. **v6** — The system shall put an idempotency key on every submission — the panel's `id` when it
    supplies one, otherwise a freshly minted UUID — and on a `409` shall replay that same submission
    **once**, after a short delay, reporting nothing to the user unless the replay also fails. It
    shall not retry any other status, and shall not retry more than once.

17. **v7** — When the owner ticks renters for a fee, the page shall fill a **per-renter split**
    immediately, dividing the fee **evenly in money** and showing each renter's amount and
    percentage. Untick a renter and the remaining rows re-divide. This is the state the page has
    always sent to the server implicitly; v7 makes it visible and editable before the save.
    **The division is of the money, not the percentage.** `$300` across three renters is
    `100.00 / 100.00 / 100.00`, never `99.99 / 99.99 / 100.02`. When the money does not divide, the
    leftover cents go **one each to the first renters in the listed order** — `$100` across three is
    `33.34 / 33.33 / 33.33`, and across six is four rows of `16.67` and two of `16.66`, never one row
    carrying all four cents.
    **v12 — the percentage shown beside each amount is divided by the same rule**, to six decimal
    places, rather than each row being rounded on its own. Rounding independently gave `33.33` three
    times on a `$300` fee, which is `99.99` — a set the service refuses, and the arithmetic that
    moved a cent whenever the unit changed (requirement 24). The rendered figure is unchanged: the
    table still shows two places.
18. **v7, corrected in v11** — The owner shall be able to **type over any row**, and shall choose
    **one unit for the whole split** — money or percentage — from a single control above the table.
    Typing an amount leaves that row's percentage derived; typing a percentage leaves its amount
    derived. The two are not interchangeable: on a `$300` fee, `200.00` typed and `66.67` typed are
    different rows, because `66.67%` of `300` is `200.01`.
    **v11 — the unit belongs to the split, and v7's per-row selector is the defect.** The service sums
    the percentages a request **states** and requires exactly `100.00`. A per-row unit lets the owner
    state one of them, and one percentage never totals a hundred unless it is a hundred — so switching
    a single row to `%` produced a request that could not be accepted, from a screen showing amounts
    that added up perfectly. A split-level unit makes the refused combination **unrepresentable**
    rather than merely validated against.
19. **v7** — The page shall **refuse the save** while the rows do not total the fee exactly, naming
    the difference — *"the shares total $290.00, the fee is $300.00"* — and offering a **reset to an
    even split**. The typed rows are **kept**, never silently corrected: an owner who has typed three
    numbers and got one wrong wants to see all three, not have the page overwrite their work. The
    backend refuses the same state with `422`, so this is the page refusing before the server does,
    which requirement 16 already established as this page's habit.
    **v11 — and while a percentage split does not total `100.00` exactly.** The money arm alone lets
    a split pass here and fail at the service, because the two sums are independent: percentages of
    `33.33 / 33.33 / 33.34` and percentages of `33.334 / 33.333 / 33.333` produce the same amounts and
    only one of them totals a hundred. Named the same way as the money — the total, the target and the
    gap — and the **fee is named first when both are wrong**, as requirement 23 already settles.
20. **v7, corrected in v11** — The page shall send the split as **`tenantShares`** — one entry per
    renter carrying `tenantId`, `amount`, and `sharePercent` **on every row when the split's unit is
    percentage, on none of them otherwise** (v7 sent it per row, which is the defect v11 corrects) —
    and shall
    **stop sending `tenantIds`**. A fee shared by everybody sends **no `tenantShares`**, which is the
    instruction *"every current and future active renter shares this fee"*; it is the same meaning the
    empty `tenantIds` array carried, read off a different shape.
21. **v7** — The page shall name who a fee landed on from the **saved split**, not from an echoed
    tenant array. `chargePayerLabel` reads `charge.tenantIds` today; backend v109 removes that field
    from the response, so the label would silently empty on the day that ships.
    **This requirement is why the release order is not negotiable.** The backend milestone that drops
    `tenantIds` from the response is blocked on this page shipping first, and its plan says so by
    name.

23. **v9** — The split table shall give each renter **two boxes** — the **amount** they are charged
    and the **amount already paid** of it — and shall derive **Owes** from the two, never taking it
    as input. Both boxes shall divide by the same rule as requirement 17 (money, to the cent,
    leftover cents one each to the renters at the top of the list), both shall leave a typed box
    alone while the untouched boxes absorb the difference, and the two shall be **independent**:
    typing what one renter owes shall not disturb what another has paid.
    **The paid slice is sent as `alreadyPaid` on each share, always, even as `0`.** The charge
    carries one already-paid figure and a server left to divide it could divide it differently —
    the same hazard requirement 17 exists for, and it was live in this column while the amounts
    were being protected from it. `AdditionalChargeTenantShareInput` has accepted the field since
    the split shipped; this spec simply never listed it.
    **Money only.** There is no `alreadyPaidPercent` on the wire, so the paid box has no unit to
    choose — the `$`/`%` selector belongs to the amount box alone (requirement 18).
    **The save is refused while either column does not add up** (requirement 19), and the fee is
    named first when both are wrong, because two messages at once names neither clearly. **A
    negative Owes is shown rather than refused:** the charge itself allows `alreadyPaid` to exceed
    its own total, so a stricter rule per renter would be one this screen invented.

24. **v11, answered in v12** — When the owner switches the split's unit, the page shall **carry
    every row's figure across** into the new unit and shall leave **every renter owing exactly what
    they owed**. A percentage shall be **divided, not rounded**: the page shall divide `100` across
    the rows in proportion to the money, to **six decimal places**, handing the leftover **one unit at
    a time to the first rows the page derived** — the same residue rule requirement 17 uses for the
    cents.
    **v11 asked how loudly to warn that the money moves. It moves only because of how the figure was
    carried.** An even `$300` across three renters is `100.00` each. As two-decimal percentages that
    is `33.33` each, and `33.33 %` of `300` is `99.99` — so the rows became
    `99.99 / 100.01 / 100.00` on a change of unit alone. At six places the same split is
    `33.334 / 33.333 / 33.333`: it totals `100.000000` exactly **and** each row resolves back to
    `$100.00`. There is no disclosure to write, because nothing changes.
    **Six places, because that is what the service stores.**
    `additional_charge_tenant_share.share_percent` is `numeric(9,6)`, so a figure carried to six
    places arrives intact and the set still totals the hundred this page checked. Three places was
    considered and **rejected on measurement**: it totals a hundred, but the money stops surviving the
    round trip above roughly `$500`, and a `$1,500` fee across six renters moves a cent.
    **The residue never lands on a row the owner typed.** It goes to the rows the page worked out,
    and only falls back to all of them when every row was authored. Answering `66.670001` to somebody
    who entered `66.67` would be the page rewriting their work to balance its own books.

25. **v13, corrected in v14** — The system shall offer the **same share boxes and the same unit
    control on both modes**, Shared Lease included. ~~and shall treat **typing any share** as the
    instruction that this fee **names** the renters it is showing. While no share has been typed the
    fee stays genuinely shared and no `tenantShares` is sent (requirement 5); the moment one is, the
    whole split goes on the wire exactly as it does from Split per Tenant.~~

    **The naming half is reversed (v14).** Typing a share says **how the fee divides**, never **who
    owes it**. Who owes it is the **mode control** and nothing else. A *Shared Lease* fee with figures
    typed into it is still a shared fee: its split is sent and stored, and it keeps resolving its
    payers from the live roster, so a renter who joins later is charged it.

    **Why the reversal, and why it is not a preference.** The service decided this on 2026-09-21 and
    shipped it in `06-unified-invoice-generation.md` v122 (**BR-30**). A `Shared` charge's stored rows
    are *a record of the division at save time*; a `PerTenant` charge's rows are *the instruction*.
    Inferring the mode from the presence of a split cannot express the first, which is exactly the
    case this page created in v13.

    **The split is still sent whenever it is typed**, on either mode. Requirement 5's *"absent means
    every active renter shares the fee"* is superseded by requirement 26: absence no longer carries an
    instruction, because the instruction now has a field of its own.
    **The page shall say what naming costs, beside the control that does the naming (corrected in
    v14 — it was *beside the shares themselves*).** A fee that names renters **stops covering renters
    added later** — not as a footnote but as the governing behaviour:
    the recompute resolves a named fee with `named.Where(roster.Contains)`, which drops a renter who
    leaves and **never adds one who joins**, while a fee with no split is resolved against the live
    roster on every invoice it reaches. The two are different products and the owner is choosing
    between them with a keystroke, so the consequence belongs on screen and not in this document.
    ~~**Clearing the shares puts it back.** The reset control returns the fee to shared, which is the
    only way back and must therefore be offered wherever the notice appears.~~ **Corrected in v14:**
    picking *Shared Lease* puts it back, and the typed figures survive the switch — they are a
    division, and a division is as meaningful on one mode as on the other.
    ~~**Why not both.** Stated percentages **and** a live roster would need weights that re-normalise
    when the roster changes, a rule for what a renter who joins is owed, and a backend that stores
    something other than a row per named tenant. That is a different feature; this requirement is
    about no longer hiding the choice.~~
    **Answered in v14, and the answer is that the backend now does both.** `06-unified-invoice-generation.md`
    v122 stores a row per payer on **every** charge and records the mode in `additional_charge.split_mode`.
    A `Shared` fee therefore carries stated figures *and* a live roster: the figures are what it divided
    into at save, and the roster is who it bills. Nothing re-normalises, because the stored rows are
    re-divided against the live roster whenever they no longer describe it (**BR-30**).

26. **v14** — The request shall carry **`splitMode`**, set from the **mode control** and from nothing
    else: `"Shared"` when the owner picked Shared Lease, `"PerTenant"` when they picked Split per
    Tenant. It shall be sent on **every** submission, including one that carries no split at all.

    **This is a live defect, not an enhancement.** The field is optional on the service, and a body
    that omits it is read the way the payer-row count used to be read — *a split was sent, so the fee
    names its payers*. So today a *Shared Lease* fee whose owner typed figures is stored as
    `PerTenant` and **silently stops covering renters added later**, which is the opposite of what the
    label on the control promises. The owner is given no sign of it.

    | Mode control | `splitMode` | `tenantShares` | Who the service bills |
    |---|---|---|---|
    | Shared Lease, nothing typed | `"Shared"` | omitted | the live roster, divided evenly |
    | Shared Lease, figures typed | `"Shared"` | the typed split | the live roster; the rows record the division |
    | Split per Tenant | `"PerTenant"` | the typed split | exactly the renters the rows name |

    **The second row is the whole point.** It is the only one the service cannot work out for itself,
    and the only one this page gets wrong today.

    **An unrecognised value is a `400`**, unlike the `isGrouped` and `tenantIds` the service tolerates
    and ignores — this field is read, so a wrong value would change who owes the fee. The page sends
    one of exactly two strings and never a free-typed one.

    **Nothing is read back to drive the control.** The service returns `splitMode` on the charge, and
    this page may show it, but the control's state comes from the owner's own selection within the
    panel. Reading the response back into the control is a separate question and is not this
    requirement.

22. **v7** — The **lease editor** shall carry a charge's saved split forward on every terms save,
    exactly as it carries `tenantIds` today. It **does not gain a split editor** — that screen has no
    tenant picker and is not getting one; who pays is authored on this page alone.
    **Why a pass-through screen needs a requirement of its own.** `PUT …/terms` resubmits the
    complete charge, and an omitted field is not "unchanged" — it is removed. The lease editor
    already carries `tenantIds` for this reason and says so in its own comment: *a fee charged to two
    of four tenants would silently become a fee shared by all four the next time the lease screen
    saved.* The split inherits that hazard the moment it replaces the array.
    **The server catches it too, and the two are not redundant.** Backend requirement 182, as revised
    in its v109, refuses a terms save whose charge already holds shares and submits none. That guard
    turns this from a silent loss into a `422` — which is a visible failure on a screen the owner was
    not editing the fee from, so the client fix is what keeps the lease editor usable.

## Constraints

- **Additive only.** `POST …/additional-charges` cannot edit or remove; the page must not imply it can.
- **One charge per submission.** The endpoint takes exactly one charge, so the page submits once per
  panel `created` event and never batches.
- **No tenant-profile service exists.** The tenants endpoint stores shares against a `tenantId` and
  carries no personal fields, so every name/email on this screen is a local stand-in derived from the
  id (the same gap the ADD TENANTS screen documents). Only the `tenantId` leaves the screen.
- **The panel is reused, not forked** — and from v8 it is the panel that owns the tenant selection.
  `AdditionalChargePanelComponent` gains two inputs, `tenants` and `isGroupInvoice`, and keeps its
  `created`/`closed` outputs; `created` now carries `tenantShares`.
  **A `null` roster is what keeps the lease screens unaffected**, and it is a stronger guarantee than
  the old arrangement. Keeping the picker on the host page protected them by construction — there was
  no renter control in the panel to leak — but it also left the Invoices page unable to split a fee it
  was posting to the very endpoint that accepts one. The input inverts that: the lease screens pass no
  roster and render nothing, which is a condition a test can pin, and requirement 22 has one.
- ~~**Idempotency key is out of reach.**~~ **Withdrawn in v6.** The panel still emits no `id`, but the
  page mints one, so the submission is replayable and requirement 16's retry is safe. The in-flight
  block stays — it stops a second *distinct* submission, which a retry never is.

## Contract

### API Endpoints consumed

| Method | Route | Used for | Notable responses |
|--------|-------|----------|-------------------|
| `GET` | `/api/v1/rent/agreements/{id}` | the lease's `propertyOwnerId`, `startDate`, `endDate`, `status`, `scheduleRows` | `404` unknown lease |
| `GET` | `/api/v1/rent/agreements/{id}/tenants` | the active tenants and their shares | `200` saved set, `204` step 2 never saved, `404` unknown lease |
| `POST` | `/api/v1/rent/agreements/{id}/additional-charges` | append one fee | `201` created, `200` replay, `400` malformed or duplicate `tenantIds`, `404` unknown lease, `409` lifecycle forbids editing, `422` business-rule violation |

### Input / Output models

`AddAdditionalChargeRequest` — **the charge's own fields sit at the body root**, not nested under a
`charge` member (backend `AddAdditionalChargeCommandJsonConverter` reads the root element):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `notes` | `string \| null` | No | Free text |
| `alreadyPaid` | `number` | Yes | `>= 0` |
| `attachedWithRentalInvoice` | `boolean` | Yes | Rides the rent invoice, or stands alone |
| `isRecurring` | `boolean` | Yes | Gates the fields below |
| `dueDate` | `string \| null` (`YYYY-MM-DD`) | Iff not recurring | |
| `frequency` | `RentFrequency \| null` | Iff recurring **and** attached (FR-088) | |
| `frequencyConfig` | `FrequencyConfig \| null` | Iff `frequency` is set | Polymorphic on `frequency` |
| `startDate` | `string \| null` | Iff recurring | |
| `endDate` | `string \| null` | Iff recurring and not open-ended | |
| `hasNoEndDate` | `boolean` | Yes | |
| ~~`tenantIds`~~ | `string[]` | No | **Not sent from v7** (requirement 20). The backend accepts and ignores it for one release, then removes it |
| `tenantShares` | `TenantShareInput[]` | No | **v7, corrected in v9.** One entry per renter: `tenantId`, `amount`, `sharePercent` on every row when the split is in percent and on none otherwise (**corrected in v11**; v7 sent it per row, which the service refuses), and `alreadyPaid` — that renter’s slice of the charge’s already-paid figure. **`alreadyPaid` was missing from this row until v9** while the service had accepted it all along (`AdditionalChargeTenantShareInput`, verified against `/openapi/v1.json`), so the client read it back and never sent it. ~~**Absent means every active renter shares the fee** — the meaning the empty array carried.~~ **Corrected in v14:** absence carries no instruction any more. `splitMode` says who owes the fee, and an absent split means only that the owner typed no figures — the service divides across the live roster and stores that division. Amounts must total the fee exactly, any percentages must total `100.00`, and the paid slices must total the charge’s `alreadyPaid` |
| `splitMode` | `"Shared" \| "PerTenant"` | No | **v14.** Which mode the owner picked, and the only thing that decides **who owes** the fee. Optional on the service, but omitting it is not neutral: the service then falls back to reading a sent split as `PerTenant`, so a *Shared Lease* fee carrying figures is recorded as named and stops following the live roster (requirement 26). An unrecognised value is a `400`, not a tolerated field — it is read, unlike `isGrouped` and `tenantIds` |
| `items` | `AdditionalChargeItemCreationRequest[]` | Yes | Non-empty |

Response: `RentAgreementAdditionalChargeResponse` — the persisted charge. **Backend v109 removes
`tenantIds` from it** (requirement 21), so from v7 the page names who a fee landed on from the
saved split instead. Until that backend release ships the field is still returned; the page must
not read it, because a page that reads a field scheduled for removal is a page that breaks on a
deployment it does not control.

### Class Diagram

```mermaid
classDiagram
    class AddAdditionalChargeComponent {
        +FormControl agreementIdInput
        +signal agreement
        +signal tenants
        +signal selectedTenantIds
        +signal addedCharges
        +load()
        +toggleTenant(tenantId)
        +selectAllTenants()
        +clearTenantSelection()
        +onChargeCreated(charge)
    }
    class AdditionalChargePanelComponent {
        +Input propertyOwnerId
        +Input leaseStartDate
        +Input leaseEndDate
        +Output created
        +Output closed
    }
    class RentAgreementsService {
        +getById(id)
        +getTenants(id)
        +addAdditionalCharge(id, request)
    }
    class TenantIdentityUtil {
        +placeholderTenantIdentity(tenantId)
    }
    AddAdditionalChargeComponent --> AdditionalChargePanelComponent : hosts
    AddAdditionalChargeComponent --> RentAgreementsService : calls
    AddAdditionalChargeComponent --> TenantIdentityUtil : names rows
    AddTenantsComponent --> TenantIdentityUtil : names rows
```

The page persists nothing of its own — it holds no client-side store beyond the signals above — so
this spec carries no Data Model or Table Structure section. The persisted shape is the backend's,
specified in `innago-rent-accounting`'s `docs/specs/rent-agreements/01-rent-agreement.md`.

## Out of Scope

- **Editing or deleting** an additional fee — `PUT …/terms` on the lease screen only.
- **Deposit-flavoured fees.** The panel's `depositOnly` mode is not offered here; a deposit fee is
  added from the lease screen, and the backend refuses a recurring one outright.
- **Searching for a lease.** There is no "list agreements" endpoint, so an id box is the whole
  navigation surface — the same constraint the Open Lease screen documents.
- **Surfacing the raised invoice.** The endpoint's response body is the charge, not the invoice it
  may have raised; the page reports what it is given and does not go looking for the invoice.
