## Changelog

| Version | Date | Summary | Plan |
|---------|------|---------|------|
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
3. The system shall render every **active** tenant the tenants endpoint returns, each with its
   `tenantId`, its recorded rent share and its recorded deposit share, and a stable stand-in name
   derived from the id — the same derivation the ADD TENANTS screen uses, so the same tenant reads
   as the same person on both screens.
4. The system shall let the user select **any number** of those tenants, including none and all,
   with per-row checkboxes plus "Select all" and "Clear" actions.
5. The system shall treat an empty selection as *"every active tenant shares this fee"* — sending
   `tenantIds: []`, which is the backend's own meaning for the empty list (FR-058) — and shall say so
   on screen, so an empty selection is never mistaken for an unfinished one.
6. When the tenants endpoint answers `204 No Content` (the lease exists but step 2 was never saved),
   the system shall say so, offer a link to that lease's ADD TENANTS screen, and still allow a
   shared fee to be added; it shall not present a tenant picker with nothing in it.
7. The system shall open the existing `AdditionalChargePanelComponent` for fee authoring, passing
   the loaded lease's `propertyOwnerId`, `startDate` and `endDate` so the panel's catalog fetch and
   its candidate-date selects work exactly as they do on the lease screen.
8. On the panel's `created` event the system shall `POST /rent/agreements/{id}/additional-charges`
   **once**, with the panel's charge fields at the body root plus the selected `tenantIds`, and shall
   close the panel only after the request succeeds — a failed submission keeps the authored fee on
   screen instead of discarding it.
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

## Constraints

- **Additive only.** `POST …/additional-charges` cannot edit or remove; the page must not imply it can.
- **One charge per submission.** The endpoint takes exactly one charge, so the page submits once per
  panel `created` event and never batches.
- **No tenant-profile service exists.** The tenants endpoint stores shares against a `tenantId` and
  carries no personal fields, so every name/email on this screen is a local stand-in derived from the
  id (the same gap the ADD TENANTS screen documents). Only the `tenantId` leaves the screen.
- **The panel is reused, not forked.** `AdditionalChargePanelComponent` keeps its current inputs and
  its `created`/`closed` outputs; the tenant selection lives on the host page, not in the panel, so
  the lease screen is unaffected.
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
| `tenantIds` | `string[]` | No | **Empty = shared by every active tenant** (FR-058) |
| `items` | `AdditionalChargeItemCreationRequest[]` | Yes | Non-empty |

Response: `RentAgreementAdditionalChargeResponse` — the persisted charge, which also carries
`tenantIds` echoed back (backend `RentAgreementAdditionalChargeResponse.TenantIds`); the UI model
gains that field so the added-charge list can render who pays without re-deriving it.

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
