**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v1

## Checklist

- [x] The backend endpoint exists and is reachable: `POST /api/v1/rent/agreements/{id}/additional-charges`
      (`RentAgreementController.AddAdditionalCharge`).
- [x] Its wire shape is confirmed by reading `AddAdditionalChargeCommandJsonConverter`:
      `Charge = BuildAdditionalCharge(document.RootElement, …)` — **the charge is the body root**, not
      nested under `charge`. `isManualInvoice` is read from the root too, and is optional.
- [x] The response body is the charge alone (`response.Charge`), not the `AddAdditionalChargeResponse`
      wrapper — so `alreadyExisted` and `unbilledLines` never reach the client, and the page must not
      pretend to render them.
- [x] `GET /api/v1/rent/agreements/{id}/tenants` already has a client method (`getTenants`) that maps
      `204` to `null`; no service change needed for it.
- [x] The tenants endpoint carries **no personal fields** — `tenantId` plus shares. The stand-in-person
      derivation already exists as a `private static` inside `AddTenantsComponent`; it must be shared
      rather than copied.
- [x] Feature folder: this belongs to the existing `rent-agreements` feature — it is the same
      capability (a lease and its fees) that `01-rent-agreement-edit-ui.md` already covers. No new
      folder, no user question needed.

Open questions: none. Everything the page needs is settled by the endpoint contracts above.

## Technical Approach

**One new page component, one reused panel, one new service method.**

`AddAdditionalChargeComponent` at `/rent-agreements/additional-charges` holds three stages in one
screen, each gated on the previous one:

1. **Identify the lease.** A `FormControl` id box validated against the same `GUID_PATTERN` the Open
   Lease screen uses. `load()` runs `forkJoin(getById(id), getTenants(id))` so the two reads happen
   concurrently and the screen flips to "loaded" once, rather than in two visible steps. A failed
   load clears everything and renders the error.
2. **Pick who pays.** The tenants come back as `AgreementTenantShareResponse[]`; the selection is a
   `signal<ReadonlySet<string>>` of tenant ids, toggled per row. **An empty set is a meaningful
   state, not an unfinished one** — it is what the backend reads as "shared by every active tenant"
   (FR-058) — so the screen states that explicitly next to the list instead of demanding a selection.
   A `204` (step 2 never saved) is rendered as its own case with a link to that lease's ADD TENANTS
   screen, not as an empty picker.
3. **Author and submit the fee.** `AdditionalChargePanelComponent` is used **unchanged**: the page
   passes `propertyOwnerId`, `leaseStartDate`, `leaseEndDate` and `leaseMonthToMonthInvoiceCount`
   from the loaded lease and listens on `created`. The tenant selection is spread onto the emitted
   charge at the page level, which is why the panel needs no new input — the panel authors *what* the
   fee is, the page decides *who* it lands on.

**Why the panel is not given a `tenantIds` input.** The lease screen hosts the same panel and has no
tenant selection at all (its charges are saved through `PUT …/terms`, whose charge shape does carry
`tenantIds` but which that screen does not collect). Adding an input would put a control on the lease
screen that nothing there can fill, and would make the panel's emitted request mean different things
on the two hosts. Keeping the selection on the host keeps the panel a pure fee-authoring widget.

**Why submission is not fire-and-forget.** The panel emits no `id`, so the endpoint's idempotency key
is unavailable and a retry creates a second charge. The page therefore keeps `submitting` true for
the duration of the request, leaves the panel open until the `POST` succeeds, and renders the failure
in the panel's host page so the authored fee survives a `422`.

**The stand-in identity is extracted, not duplicated.** `AddTenantsComponent.placeholderIdentity` is
moved verbatim to `src/app/shared/tenant-identity.util.ts` as `placeholderTenantIdentity`, and that
component now delegates to it. Both screens then name the same tenant id the same way, which is the
only thing that makes the tenant list on this page recognisable at all.

Files created:

- `src/app/shared/tenant-identity.util.ts` (+ `.spec.ts`)
- `src/app/rent-agreements/add-additional-charge.component.ts` / `.html` / `.scss` (+ `.spec.ts`)

Files changed:

- `src/app/rent-agreements/rent-agreement.models.ts` — `tenantIds` on the charge request and on the
  charge response; a new `AddAdditionalChargeRequest`.
- `src/app/rent-agreements/rent-agreements.service.ts` — `addAdditionalCharge()`.
- `src/app/rent-agreements/add-tenants.component.ts` — delegates to the shared util.
- `src/app/app.routes.ts`, `src/app/app.component.html` — route and sidebar link.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Where the page lives | A standalone page at `/rent-agreements/additional-charges` with an id box | A tab on the lease-edit screen; a `/rent-agreements/:id/additional-charges` deep link | The user asked for a page that takes an agreement id (*"add additional ka ek page hoga usme rent agreement id dalenge"*). It also mirrors Open Lease, the only other id-box entry point. Source: user 2026-08-31 |
| 2 | Body shape for the `POST` | Charge fields at the **root**, `tenantIds` alongside | Nesting under a `charge` member, mirroring `AddAdditionalChargeCommand`'s C# shape | The command's JSON converter reads `document.RootElement` as the charge; a nested body would deserialize to a charge with every required field missing and fail as `400` |
| 3 | Meaning of an empty tenant selection | Send `tenantIds: []` and label it "shared by all active tenants" | Block submission until at least one tenant is ticked; default to all-ticked | Empty **is** the backend's shared-fee encoding (FR-058). Blocking would make the common case unreachable; defaulting to all-ticked would send a redundant explicit list that then goes stale if the roster changes |
| 4 | Where the tenant selection lives | On the host page | As a new `@Input`/`@Output` pair on `AdditionalChargePanelComponent` | The lease screen hosts the same panel and has nothing to fill such an input with; keeping it out preserves the panel's single responsibility and leaves the lease screen untouched |
| 5 | `isManualInvoice` | Not sent at all | Send `false`; expose a checkbox | The backend documents it as accepted-and-ignored (every invoice this route raises is `Manual`). A checkbox would offer a choice that changes nothing |
| 6 | Panel lifetime on failure | Stays open; error rendered by the host | Close on `created`, render the error on the page behind it | Closing discards the authored fee, so a `422` on, say, the deposit-mixing rule would cost the user the whole form |
| 7 | Stand-in tenant names | Extract `placeholderIdentity` to `shared/tenant-identity.util.ts`, both screens delegate | Copy the function into the new component; show raw ids only | Two copies drift, and raw GUIDs make a tenant picker unusable. The util is cross-feature by definition, so `shared/` is where the conventions put it |
| 8 | Month-to-month invoice count for the panel | Derived as `scheduleRows.length` when the lease has no `endDate` | Add a field to the detail response; pass `null` | The detail response has no such field, and `null` would make the panel's candidate-date fetch return an empty list for month-to-month leases. Row count is exactly what that count means |
| 9 | Route loading | `loadComponent` — the only lazy route in the app | Eager `component:` like its siblings; raise `angular.json`'s 800 kB budget | Measured: eager, the initial bundle went 791.71 kB → 809.34 kB and broke the budget. Deferring one deliberately-navigated screen beats relaxing the guardrail for every screen. The lazy chunk is 17.47 kB |
| 10 | A charge loaded by the lease screen keeps its `tenantIds` | `toChargeCreationRequest` carries the field across | Leave it dropped as before | `PUT …/terms` resubmits the complete charge, so without this the first lease-screen save after this page ships would silently widen a subset fee back to everyone — a data loss this feature itself creates |

## Data Model & Schema Changes

None. This is a client-side screen over existing endpoints — no persistence, no migration, no backend
change. The only "schema" delta is on the TypeScript wire models: `tenantIds?: string[]` added to
`AdditionalChargeCreationRequest` (optional, so the lease screen's existing payloads are unchanged)
and to `RentAgreementAdditionalChargeResponse` (optional, mirroring the backend field the create/edit
responses already carry), plus a new `AddAdditionalChargeRequest` alias for the append body.

## Task Checklist

- [x] `src/app/shared/tenant-identity.util.ts` — export `TenantIdentity` and
      `placeholderTenantIdentity(tenantId)`, moved verbatim from `AddTenantsComponent` (FNV walk,
      name tables, 4-hex suffix).
- [x] `src/app/shared/tenant-identity.util.spec.ts` — prove the derivation is stable for one id and
      differs across ids, and that a non-hex id still yields a `0000` suffix.
- [x] `src/app/rent-agreements/add-tenants.component.ts` — delete the private statics, import and
      call `placeholderTenantIdentity`.
- [x] `src/app/rent-agreements/rent-agreement.models.ts` — add `tenantIds?: string[]` to
      `AdditionalChargeCreationRequest` and `RentAgreementAdditionalChargeResponse`; add
      `AddAdditionalChargeRequest`.
- [x] `src/app/rent-agreements/rent-agreements.service.ts` — `addAdditionalCharge(agreementId,
      request)` posting to `${baseUrl}/${agreementId}/additional-charges`.
- [x] `src/app/rent-agreements/rent-agreements.service.spec.ts` — assert the URL, the method, and
      that the body carries the charge fields at the root with `tenantIds`.
- [x] `src/app/rent-agreements/add-additional-charge.component.ts` — the page: id validation,
      `forkJoin` load, tenant selection signals, panel host, submit, added-charge list, error mapping.
- [x] `src/app/rent-agreements/add-additional-charge.component.html` / `.scss` — the three stages,
      styled to match the Open Lease / ADD TENANTS screens.
- [x] `src/app/rent-agreements/add-additional-charge.component.spec.ts` — the behaviours in the
      Test Plan below.
- [x] `src/app/app.routes.ts` — a **lazy** `loadComponent` route at `rent-agreements/additional-charges`,
      placed **before** the `:id`-parameterised routes (decision 9).
- [x] `src/app/app.component.html` — sidebar link "Add Additional Fee".
- [x] `src/app/rent-agreements/rent-agreement.models.ts` — `toChargeCreationRequest` carries `tenantIds`
      across, so the lease screen cannot silently widen a subset fee (decision 10).
- [x] `npx ng test --watch=false --browsers=ChromeHeadless` and `npx ng build` both clean.

## Test Plan

`add-additional-charge.component.spec.ts` (Karma/Jasmine + `HttpClientTestingModule`, matching the
existing component specs):

1. **FR-1** — `load()` with a non-GUID sets the inline error and issues **no** HTTP request.
2. **FR-2** — a valid id issues exactly two requests (`GET {id}` and `GET {id}/tenants`) and renders
   the tenant picker only after both flush.
3. **FR-3/4** — every returned tenant renders with its id and shares; `toggleTenant` adds then
   removes an id; `selectAllTenants` selects all; `clearTenantSelection` empties the set.
4. **FR-5** — submitting with an empty selection sends `tenantIds: []`.
5. **FR-6** — a `204` from the tenants endpoint renders the "no tenants saved" case, not an empty
   picker, and still permits a submission.
6. **FR-7** — the hosted panel receives the loaded lease's `propertyOwnerId`, `startDate` and
   `endDate`.
7. **FR-8** — `onChargeCreated` posts **once** to `{id}/additional-charges` with the emitted charge's
   fields at the body root plus the selected `tenantIds`, and the panel closes only after the
   response flushes.
8. **FR-9** — the flushed charge appears in the added-charge list with its server id.
9. **FR-10** — a `422` with a Problem Details `detail` renders that string, keeps the panel open, and
   leaves the loaded lease in place.
10. **FR-11** — the submitted body has no `isManualInvoice` key.

`rent-agreements.service.spec.ts` gains one case for `addAdditionalCharge`'s URL, method and body.
`tenant-identity.util.spec.ts` covers the extraction. Full suite:
`npx ng test --watch=false --browsers=ChromeHeadless`.
