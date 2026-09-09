## Changelog

| Version | Date | Summary | Plan |
|---------|------|---------|------|
| v1 | 2026-09-09 | **First spec for the tenants step — written because a save on this screen reports something it had never shown.** The screen itself is not new: `AddTenantsComponent` has existed since the wizard was built, and requirements 1–10 below **document it as found**, so there is a record to compare against next time. **The one behavioural change is requirement 11.** *Reported 2026-09-08: raising a tenant's share from 0% did not change an already-billed month.* The backend intends that — a cycle already due keeps the split it was billed with (backend requirement 104, decided at its spec v37) — and since **backend FR 155** it says so: a successful `PUT …/tenants` carries `skippedCycles`, each naming the cycle, its due date, and the reason `cycle_already_due`. **`skippedCycles` appeared nowhere in this repository** — no model field, no component code, no template branch — which is the same defect that `01-rent-agreement-edit-ui.md` v19 fixed for `blockedRemovals` one day earlier, in the same shape, on the sibling screen. So the owner read "Tenants saved." and then met a bill that disagreed with the roster, with nothing on screen connecting the two. **Reported beside the success banner, not instead of it:** the save did apply, and every month that had not been billed yet did take the new split — calling it a failure would be as wrong as saying nothing. **No navigation hold, unlike v19's fix:** this screen does not navigate on save, so the banner is rendered onto a page the user is already looking at. Two limits carried over deliberately from v19: the server's `message` is shown **verbatim**, because the wording belongs to whoever owns the rule; and the cycle is **named, not linked**, since a filtered route into `/invoices` does not exist. | [2026-09-09T1500-06-surface-skipped-cycles](../../plans/rent-agreements/2026-09-09T1500-06-surface-skipped-cycles.md) |

## Overview

`AddTenantsComponent` (`src/app/rent-agreements/add-tenants.component.ts`) is **step 2 of the lease
wizard** — reached at `/rent-agreements/:id/tenants`, from the Edit Lease screen. It owns the renter
set and the two invoicing decisions that go with it: whether the tenants are billed on one shared
invoice (`isGroupInvoice`) and whether a partial payment may be recorded
(`partialPaymentAllowed`). It reads `GET /rent-agreements/{id}` for the lease's full rent and
deposit, `GET /rent-agreements/{id}/tenants` for what step 2 already holds, and saves the whole set
with `PUT /rent-agreements/{id}/tenants`. It is also where the wizard ends, so it hosts
`ActivateLeaseComponent`.

This spec covers the UI's own behaviour and its wire contract. The backend's behaviour — how a share
revision reaches the proposals, which cycles are protected from it, and why — is specified in the
`innago-rent-accounting` repo's [`docs/specs/rent-agreement-tenants/03-rent-agreement-tenants.md`](
https://github.com/innago-property-management/innago-billing/blob/main/docs/specs/rent-agreement-tenants/03-rent-agreement-tenants.md)
and `docs/specs/invoice-generation/06-unified-invoice-generation.md` (requirement 104 for the
protection, FR 155 for the report). This document cross-links them rather than duplicating them.

## Business Scope

A property manager says who is renting and what each of them owes. On a brand-new lease that is a
blank screen with one row at 100%; on a lease already saved it is a revision — add a fifth tenant,
move a share from 70/30 to 40/60, switch from one shared invoice to one per person.

**Stakeholder:** the property manager, working on a lease they can already see and edit.

**Success looks like:** the screen shows the split the server actually holds, saving it replaces the
whole set in one call, and the screen states plainly what the save did — **including the part it
deliberately did not do**, which is the months that were already billed.

**Explicitly not in scope:** anything about a tenant *as a person*. There is no tenant directory in
this application and the endpoint stores no personal fields, so names, email and mobile are
placeholders (see Constraints).

## Functional Requirements

Requirements 1–10 describe the screen **as it already behaved** when this spec was written;
requirement 11 is the only one added with it.

1. The system shall decide its mode from `GET /rent-agreements/{id}/tenants`: a `204` (empty body)
   means step 2 was never saved, so the screen opens **blank in create mode** with one row at 100%;
   a body means it was, so the screen opens **prefilled in edit mode**.
2. The system shall carry each saved row's **`tenantId` across exactly** and never re-mint it — it
   is the only identity the server reconciles a re-save against — and shall show it on the row so it
   can be checked against the API by eye.
3. The system shall **not** re-split evenly after a prefill. An even split is a create-mode default,
   and running it over saved rows would replace the split the owner entered with an even one.
4. In **create** mode the system shall re-spread the rent and deposit totals evenly whenever a row is
   added or removed, with the **last row absorbing the rounding remainder** so the percentages sum to
   exactly 100.
5. In **edit** mode the system shall start an added row at **zero** and move nothing else, and shall
   likewise leave the remaining rows untouched when a row is removed.
6. The system shall keep each row's percent and dollar figures paired — editing either recomputes the
   other from the lease's full rent or deposit — and shall re-open a saved set in the unit it was
   entered in, treating a **null percent as "a fixed dollar amount was typed here"**.
7. The system shall **never block Save on the totals**. The backend places no requirement on a split
   summing to 100% or to the lease's full rent, so the screen surfaces the running totals and leaves
   the judgement to the user.
8. The system shall save the roster as a **whole-set replace** in one call, and shall treat a removed
   row as a **deactivation, not a deletion** — the row is simply absent from the set, and invoices
   already raised against that tenant survive.
9. On a successful save the system shall report the tenant ids now stored and shall switch itself to
   **edit** mode **without a reload**, recording the saved set from the request that was just
   accepted. On a failure it shall show the server's problem `detail` when there is one.
10. The system shall offer **activation** on this screen, and after an activation shall re-read the
    **lease only** — never the tenants, which would discard an edit in progress.
11. The system shall **surface every entry in `skippedCycles`** on a successful save — the cycle's
    scheduled date and the server's `message` **verbatim** — and shall
    **not** present it as a save failure, since the save succeeded and every cycle that had not been
    billed yet did take the new split. When `skippedCycles` is absent, `null`, or empty, nothing is
    shown. The cycle is **named, not linked**: no route into a filtered invoice list exists.

## Constraints

- **Placeholder identities.** There is no tenant-profile service in this application, and
  `PUT …/tenants` stores shares against a `tenantId` and nothing else. First/last name, email and
  mobile are therefore placeholders on **every** row, **derived from that row's `tenantId`** via
  `placeholderTenantIdentity` so a row keeps the same person for as long as it exists and comes back
  as the same person after a save. Both names are `required`, so pre-filling is also what makes a
  fresh row saveable at all. Every field stays editable; nothing but the `tenantId` is sent.
- **This screen does not navigate on save.** It is the last step of the wizard, so a report rendered
  after a save is rendered onto a page the user is still on — which is why requirement 11 needs no
  equivalent of `01-rent-agreement-edit-ui.md` v19's navigation hold.
- **The server's `message` is rendered verbatim.** The wording of a protection rule belongs to
  whoever owns the rule; re-phrasing it here would put two versions of one rule in two repositories.
- **`skippedCycles` is optional on the wire.** It is typed `?: BlockedRemovalResponse[] | null` and
  read as `?? []`, so a server that predates backend FR 155 behaves exactly as before.
- **An even split is percentage-first.** `$300` across three rows bills `99.99 / 99.99 / 100.02`,
  because the last row absorbs the percentage remainder rather than the dollar remainder. Accepted.

## Contract

### Component state (relevant signals)

| Signal | Type | Meaning |
|--------|------|---------|
| `loadedAgreement` | `RentAgreementDetailResponse \| null` | The lease, read for `fullRent` and `deposit` |
| `savedTenants` | `AgreementTenantsResponse \| null` | What the server holds for step 2; `null` is the `204`. The one signal that decides the mode |
| `mode` | `'create' \| 'edit'` | Derived from `savedTenants` |
| `rentSplitUnit` / `depositSplitUnit` | `'percent' \| 'dollar'` | Which column is editable; the other is derived and greyed out |
| `saveError` | `string \| null` | The server's problem `detail`, or a status line |
| `saveResult` | `{ tenantIds: string[] } \| null` | The accepted save |
| `skippedCycles` | `BlockedRemovalResponse[]` | The cycles the save deliberately did not reach (v1). Empty when the server reports none |

### Wire shapes (see `rent-agreement.models.ts`)

`SaveAgreementTenantsResponse.skippedCycles?: BlockedRemovalResponse[] | null` — present on a
**`200`**, alongside the echoed `tenantIds`. Same shape as `RentAgreementDetailResponse.blockedRemovals`
(`01-rent-agreement-edit-ui.md` v19), reused rather than copied because it answers the same question:
*what did this successful save not do?* Each entry carries `kind`, `id`, `scheduledDate`,
`invoiceId`, `reason` (`cycle_already_due` here) and a display `message`.

`AgreementTenantShareResponse.rentPercent` / `depositPercent` — **nullable**. A `null` is how the
server records that a fixed dollar amount was entered, and is what requirement 6 re-opens the screen
on.

## Out of Scope

- Anything about a tenant as a person — a directory, a profile, an invitation, real contact details.
- Acting on a skipped cycle. Re-billing an already-due month at the new split is a backend decision
  (its spec 06 decision **D-1**, still open) and would need an endpoint that does not exist.
- Linking a skipped cycle to its invoice: `04-invoice-list-ui.md` owns the invoice list, and it has
  no route contract for a filtered view.
- Validating that a split sums to 100% — deliberately, per requirement 7.
