## Changelog

| Version | Date | Summary | Plan |
|---------|------|---------|------|
| v2 | 2026-09-30 | **Removing a renter quietly stops a fee's typed figures from being used, and this screen says nothing.** New **requirement 12**. *Confirmed by the user 2026-09-30, answering the question `additional-charge-every-case.html` left open — that page names this screen and calls it "the one place a manager can still be surprised, and it is the only one left".* **What happens today.** A fee set to *Split per Tenant* naming Alice, Bob and Carol is billed by intersecting its payer list with the live roster. Remove Carol and the fee still bills \$300, now divided across Alice and Bob — the figures the manager typed for three people are no longer used. Nothing on the removal screen mentions it. **Computed here, not reported by the server.** `PUT …/tenants` answers with `tenantIds` and `skippedCycles` and says nothing about fees; it does not need to, because this screen already loads the agreement and every charge on it carries `splitMode` and `tenantShares`. **The gap is that this repository has never read `splitMode`** — the service has sent it since its v122 and no model here declares it, so the screen cannot today tell a *Shared* fee's stored rows (a record of how it divided, service BR-30) from a *Split per Tenant* fee's (an instruction). Only the second kind is worth a warning, so the field is what makes the requirement possible. **Said before the save**, unlike requirement 11 which reports what the server did: this is a consequence of a removal the manager has not committed yet. **The wording corrects the decision on one point.** That page says the figures are *replaced*; the service does not rewrite them — the rows stay as saved and are intersected at billing time. The notice says they **will no longer be used**, because a manager who reopens the fee and finds their figures intact would be right to distrust a screen that claimed otherwise. **No API change and no new endpoint** — one field added to a response model that already receives it. | [2026-09-30T1200-06-a-removal-says-which-fees-it-reaches](../../plans/rent-agreements/2026-09-30T1200-06-a-removal-says-which-fees-it-reaches.md) |
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

12. **v2** — Where removing a renter would leave a fee's **typed figures no longer describing who is
    billed**, the system shall say so **before the save**, naming those fees.

    **The one place a manager can still be surprised.** The product decision
    (`additional-charge-every-case.html`) says so outright and asks for this screen by name:

    > *"Row 2 is the one place a manager can still be surprised, and it is the only one left on this
    > page. A departure replaces typed figures even on Split per Tenant, because those figures were
    > written for a group of people that no longer exists. **Should the manager be told when this
    > happens — on the screen where they removed the renter? We think yes**, using the notice that
    > screen already shows for months it deliberately left alone."*

    *(Confirmed by the user 2026-09-30.)*

    **Which fees qualify, and which deliberately do not:**

    | The fee | On removing one of its renters | Told? |
    |---|---|---|
    | **Split per Tenant**, naming the removed renter | the remaining named renters divide the whole fee; what was typed no longer describes them | **yes** |
    | **Split per Tenant**, not naming them | nothing changes | no |
    | **Shared Lease** | it always followed the roster; its stored rows are a record, not an instruction (service BR-30) | no |
    | **On the rent invoice** | it follows whoever that invoice bills, and holds no setting of its own | no |

    **Computed on this screen, not reported by the server.** `PUT …/tenants` answers with
    `tenantIds` and `skippedCycles` and says nothing about fees. It does not need to: this screen
    already loads the agreement, and every charge on it carries `splitMode` and its `tenantShares`.
    **The one thing missing is that this repository never reads `splitMode`** — the service has sent it
    since its v122, and no model here declares it.

    **Said before the save, not after it** — unlike requirement 11, which reports what the server did.
    This is a consequence of a removal the manager has not committed yet, so it belongs beside the
    decision while it can still be reconsidered.

    **The wording states what actually happens, which is not quite what the decision says.** That page
    says the figures are *replaced*; the service does not rewrite them. The stored rows stay exactly as
    they were saved, and a departed renter is dropped when the fee is billed — the payer list is
    intersected with the live roster and the total re-divides across those who remain. So the notice
    shall say the typed figures **will no longer be used**, not that they have been erased: a manager
    who reopens the fee and finds their figures intact would be right to distrust a screen that said
    otherwise.

    **A fee that has taken money is out of scope**, because its renters are already frozen and a
    removal cannot reach it (spec `02` requirement 38; service requirement 218).

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
