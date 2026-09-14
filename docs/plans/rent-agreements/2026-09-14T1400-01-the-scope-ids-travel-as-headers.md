**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v21
**Author:** Abhishek Chaurasia · **Created:** 2026-09-14

# The scope ids travel as headers

Implements **requirement 12** (a–f): `propertyOwnerId` leaves the create request body, an `accountId`
joins the form beside it, both are published to a small scope service, and one HTTP interceptor attaches
them as `OrganizationId` and `PropertyOwnerId` on every Billing API call.

This is the **client half of one breaking release**. Its server half is
`innago-rent-accounting` → [`docs/specs/rent-agreement/01-rent-agreement.md`](../../../../innago-rent-accounting/docs/specs/rent-agreement/01-rent-agreement.md)
v89–v90 (FR-127, FR-128), delivered by that repo's plan
`2026-09-14T1200-01-stamp-the-account-on-every-agreement.md`. **Neither half works alone** — see
*Prerequisites & Open Questions*.

---

## Setup & Environment

**Toolchain.** The Node and Angular versions already pinned in `package.json`; no new dependency is
added — `withInterceptors` and `HttpInterceptorFn` are part of `@angular/common/http`, which the app
already uses.

**Files touched:**

| File | Milestone | Why |
|---|---|---|
| `src/app/request-scope.service.ts` | M1 | **New.** Holds the two scope ids, seeded from what was remembered or from a fresh invented value (12b, 12c) |
| `src/app/scope-headers.interceptor.ts` | M1 | **New.** Attaches both headers (12d, 12e) |
| `src/app/app.config.ts` | M1 | Registers the interceptor — the file currently registers none |
| `src/app/app.component.ts` / `.html` / `.scss` | M1 | The settings box in the sidebar, visible from every screen (12b) |
| `src/app/rent-agreements/rent-agreement.models.ts` | M2 | `CreateRentAgreementRequest` loses `propertyOwnerId` (12a) |
| `src/app/rent-agreements/rent-agreement-create.component.ts` | M2 | Stops putting the owner in the request body (12a) |

**Revised 2026-09-14 (second pass).** The first draft put an `accountId` control on the lease form and
had the create component publish the scope. That is replaced by a **settings box in the shell** — see
spec D1's reversal. The service and interceptor survive unchanged in purpose; what feeds them moved
from a hidden form control to a visible input, and M2 shrank to removing the body field.

**Commands:**

```bash
npm install
npm test          # ng test
npm run build     # ng build
```

**Running against the API.** `environment.ts` points at `http://localhost:5169`; `proxy.conf.dev.json`
and `proxy.conf.qa.json` are unchanged — headers need no proxy configuration.

### Prerequisites & Open Questions

1. **The server half must be merged and running before this is verified end to end.** Until
   `innago-rent-accounting` Milestone 3 lands, its `POST /rent/agreements` still requires
   `propertyOwnerId` **in the body** and will reject a request built by M2 of this plan. Unit tests here
   do not depend on it; **manual and e2e verification does.**
2. **Release order is a genuine decision and it is not this plan's to make.** Neither half is
   independently deployable (requirement 12f). Agree the sequencing — same deploy, or server first
   behind a short window — before either is released. This is recorded here rather than assumed.
3. **The account id has no real source and will not have one in this version.** It is a
   `crypto.randomUUID()` stand-in (12b, decision D1). Every lease created by this build gets its own
   account, which is fine for exercising the header and is not fine as data anyone reports on.
4. **`e2e/` is not updated by this plan.** If any Playwright spec asserts the create request body, it
   will need the same edit; check before release rather than discovering it in CI — the check is a task
   in M2.

---

## Milestone-Based Implementation

### Milestone 1 — Both headers ride every API call

**Implements:** requirement 12c (the published scope), 12d (the interceptor), 12e (the accepted cost).
**Depends on:** nothing.
**Expected outcome:** any Billing API request made while a scope is published carries both headers;
requests made before anything is published carry neither; non-API URLs are untouched. Nothing about the
create screen has changed yet, so the app still works exactly as it does today.

**Production files (3):** `request-scope.service.ts` (new), `scope-headers.interceptor.ts` (new),
`app.config.ts`.

#### Tasks

- [ ] **Write the failing tests first** — `src/app/rent-agreements/scope-headers.interceptor.spec.ts`:
      `Req12d_ScopePublished_AttachesBothHeaders`,
      `Req12d_NoScopePublished_AttachesNeitherHeader`,
      `Req12d_NonApiUrl_IsUntouched`,
      `Req12e_EveryApiRequest_CarriesTheHeadersNotJustTheCreate`.
      The last one is not redundant: it pins the **known cost** the spec accepts, so a later reader sees
      it was chosen rather than overlooked.
- [ ] Create `src/app/rent-agreements/request-scope.service.ts` — `providedIn: 'root'`, two
      `signal<string | null>(null)` values (`accountId`, `propertyOwnerId`) and one `publish({accountId,
      propertyOwnerId})` method. No generation of ids here: the form owns them (12b), this only carries
      them. Document that in the class doc comment — the split is the thing a later reader will
      question.
- [ ] Create `src/app/rent-agreements/scope-headers.interceptor.ts` as an `HttpInterceptorFn`. Attach
      both headers **only** when the request URL starts with `environment.apiBaseUrl` **and** both scope
      values are non-null. Anything else passes through untouched — an empty header is worse than an
      absent one, because the server rejects the former with a message about a malformed id.
- [ ] Register it in `src/app/app.config.ts`:
      `provideHttpClient(withInterceptors([scopeHeadersInterceptor]))`. This file registers no
      interceptors today, so the import of `withInterceptors` is new.
- [ ] Run `npm test` and `npm run build`. Both green before the commit.
- [ ] **STOP — review checkpoint.** Report: files added and changed, requirement 12c/12d/12e now
      covered, the test names added, the Flow Card corrected against reality, and the commit made. **Do
      not start Milestone 2 until the user says to continue.**

#### Flow Card — M1 Both headers ride every API call

**Trigger:** any `HttpClient` call made after `RequestScopeService.publish(...)` has run.

| # | Where | What happens |
|---|-------|--------------|
| 1 | `app.config.ts` → `provideHttpClient(withInterceptors([...]))` | Puts the interceptor in the chain; previously there was no chain |
| 2 | `scope-headers.interceptor.ts` → `scopeHeadersInterceptor` | **The rules live here — 12d, 12e.** Checks the URL prefix and that both values are published, then clones the request with both headers |
| 3 | `request-scope.service.ts` → `RequestScopeService.accountId()` / `.propertyOwnerId()` | Supplies the values; returns `null` until something publishes |
| 4 | the outbound request | Carries `OrganizationId` and `PropertyOwnerId` |

**Rules covered:** 12c, 12d, 12e
**Tests:** `Req12d_ScopePublished_AttachesBothHeaders`,
`Req12d_NoScopePublished_AttachesNeitherHeader`, `Req12d_NonApiUrl_IsUntouched`,
`Req12e_EveryApiRequest_CarriesTheHeadersNotJustTheCreate`
**Fails when:** nothing published → request goes out with no headers, and the server answers `400` for
the missing header · a non-API URL → no headers, by design · one value published and not the other →
**neither** header is sent, deliberately, so a half-published scope fails the same way an unpublished
one does rather than in a new way
**Start debugging here:** `scopeHeadersInterceptor` — one function, and the first line tells you
whether it decided to act.

**Reviewer's 10-minute path:** read `scope-headers.interceptor.spec.ts`; it is four cases and the whole
milestone.

---

### Milestone 2 — The create screen stops sending the owner in the body

**Implements:** requirement 12a (the body loses a field), 12b (the account joins the form), and the
publish half of 12c.
**Depends on:** Milestone 1.
**Blocked for release by:** the server half — see *Prerequisites* 1 and 2. **The commit is safe; the
release is not, alone.**
**Expected outcome:** the create request body no longer contains `propertyOwnerId`; both ids are
published before any save can run; the edit page republishes the owner it loaded from the server.

**Production files (2):** `rent-agreement.models.ts`, `rent-agreement-create.component.ts`.

#### Tasks

- [ ] **Write the failing tests first** — extend
      `src/app/rent-agreements/rent-agreement-create.component.spec.ts`:
      `Req12a_SaveRequest_OmitsPropertyOwnerIdFromTheBody`,
      `Req12b_FormInit_SeedsAnAccountId`,
      `Req12c_FormInit_PublishesBothIdsToTheScope`,
      `Req12c_EditPagePatchesOwnerFromServer_RepublishesIt`,
      `Req12a_PropertyOwnerIdControl_StillDrivesTheChargePanelBinding`.
      The last one is the regression guard that matters: the field is leaving the *body*, not the form,
      and the line-item scoping bindings (component lines 739, 752) are the thing most likely to be
      broken by an over-enthusiastic removal.
- [ ] In `rent-agreement.models.ts`, remove `propertyOwnerId: string;` from `CreateRentAgreementRequest`
      (L158–173). **Leave `RentAgreementDetailResponse.propertyOwnerId` alone** — `GET` still returns it
      and the edit page still reads it.
- [ ] In `rent-agreement-create.component.ts`, add `accountId: [crypto.randomUUID(), Validators.required]`
      to the form group beside the three existing seeded ids (L334–337).
- [ ] In the same component, publish both ids to `RequestScopeService`: once after the form is built,
      and again inside the edit-mode `patchValue` path (L436–448) where the owner arrives from the
      server. Two call sites, because there are two moments the values can change — a single publish in
      the constructor would leave the edit page sending the invented owner instead of the real one.
- [ ] Remove `propertyOwnerId: value.propertyOwnerId,` from the request literal (L1245). Change nothing
      else in that literal.
- [ ] Check `e2e/` for any spec asserting the create request body; update or note it (*Prerequisites* 4).
- [ ] Run `npm test` and `npm run build`. Both green before the commit.
- [ ] **STOP — review checkpoint.** Report: files changed, requirement 12a/12b/12c now covered, the test
      names added, whether any `e2e/` spec needed updating, the Flow Card corrected against reality, and
      the commit made. **Then stop for the release conversation** — this commit must not reach an
      environment before the server half.

#### Flow Card — M2 The create screen stops sending the owner in the body

**Trigger:** the manager presses Save on `/rent-agreements/create`.

| # | Where | What happens |
|---|-------|--------------|
| 1 | `rent-agreement-create.component.ts` constructor | Seeds `accountId` and `propertyOwnerId` with `crypto.randomUUID()`, then publishes both |
| 2 | `rent-agreement-create.component.ts` edit-mode `patchValue` (L436–448) | Republishes the owner the server returned, so edit mode never sends an invented one |
| 3 | `rent-agreement-create.component.ts` → `save()` (L1243–1268) | **The rules live here — 12a, 12b.** Builds `CreateRentAgreementRequest` **without** `propertyOwnerId` |
| 4 | `rent-agreements.service.ts` → `create()` | Unchanged — it posts the body it is given |
| 5 | `scope-headers.interceptor.ts` | M1's interceptor adds both headers on the way out |

**Rules covered:** 12a, 12b, 12c
**Tests:** `Req12a_SaveRequest_OmitsPropertyOwnerIdFromTheBody`, `Req12b_FormInit_SeedsAnAccountId`,
`Req12c_FormInit_PublishesBothIdsToTheScope`,
`Req12c_EditPagePatchesOwnerFromServer_RepublishesIt`,
`Req12a_PropertyOwnerIdControl_StillDrivesTheChargePanelBinding`
**Fails when:** released without the server half → every save is `400` for a missing header, nothing is
saved, no existing lease is touched · released after the server half → every save is `400` because the
body still carries the owner and the header does not exist · the charge panel loses its owner binding →
the line-item picker scopes to nothing, which is the silent failure this milestone's last test exists to
prevent
**Start debugging here:** `RentAgreementCreateComponent.save()` — the request literal is where the field
was removed; if the body is right, the problem is M1's interceptor.

**Reviewer's 10-minute path:** read `Req12a_SaveRequest_OmitsPropertyOwnerIdFromTheBody` and
`Req12a_PropertyOwnerIdControl_StillDrivesTheChargePanelBinding` together — one proves the field left
the body, the other proves it did not leave the form.

---

## Scope & Context Rules

**May be modified:** only the five files in *Setup & Environment*, plus the two spec files named in the
task lists.

**Must not be touched:**

- **`RentAgreementDetailResponse.propertyOwnerId`** or anything reading it. `GET` still returns the
  owner and the edit page still patches from it (spec 12a).
- **The `propertyOwnerId` form control, and its bindings at component lines 739 and 752.** The field is
  leaving the request body, not the form. Removing the control breaks line-item catalog scoping.
- **The invoicing and line-item calls** that send `propertyOwnerId` as a **query parameter**
  (`invoice-list.component.ts`, `line-items.service.ts`). The backend did not move those; `02-invoicing.md`
  owns them.
- **`rent-agreements.service.ts`.** With the interceptor doing the work (decision D2), the service is
  unchanged. If you find yourself adding headers there, the interceptor is not wired correctly.
- **Any authentication, token, or login code.** None exists and this plan adds none.

**Standing prohibitions:** no new dependencies, no architectural change, no scope expansion without
approval, and no attempt to make either half independently releasable — requirement 12f says it is not.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Where the account id comes from | A form control seeded with `crypto.randomUUID()` | One value per environment in `environment.ts`; a field the user fills | Matches the three ids already seeded that way and needs no new config. *Source: confirmed by the user 2026-09-14, spec D1.* |
| 2 | How the headers are attached | A single `HttpInterceptorFn` | Setting them on `rent-agreements.service.ts.create()` only | It is the seam a bearer token will later use, so the wiring outlives the stand-in. *Source: confirmed by the user 2026-09-14, spec D2.* |
| 3 | The interceptor's blast radius | Scoped to `environment.apiBaseUrl`, and silent until a scope is published | Attaching unconditionally | An interceptor that stamps every URL would leak the ids to anything the app ever calls; one that sends empty headers turns "not ready yet" into a malformed-id error |
| 4 | A scope service between form and interceptor | A `providedIn: 'root'` service with two signals | Reading the form from the interceptor; a global variable | An interceptor has no access to a component's form, and the edit page changes the owner after load — the service is the smallest thing that makes both true |
| 5 | Half-published scope | Send **neither** header | Send whichever is available | One header present and one absent fails in a new way for no benefit; failing identically to "nothing published" keeps one failure mode instead of three |
| 6 | `propertyOwnerId` stays a form control | Kept | Removed with the body field | It scopes the line-item catalog through two template bindings and is patched from the server in edit mode. Removing it is the most likely way this change breaks something unrelated |

---

## Verification

**Run after every task; do not continue if either fails:**

```bash
npm test
npm run build
```

**Do not begin the next milestone until the user has said to continue.**

| Check | Proves | Requirement |
|---|---|---|
| `Req12d_ScopePublished_AttachesBothHeaders` | Both headers are attached when a scope exists | 12d |
| `Req12d_NoScopePublished_AttachesNeitherHeader` | No empty headers are ever sent | 12d |
| `Req12d_NonApiUrl_IsUntouched` | The interceptor is scoped to the API | 12d |
| `Req12e_EveryApiRequest_CarriesTheHeadersNotJustTheCreate` | The accepted cost is deliberate and pinned | 12e |
| `Req12a_SaveRequest_OmitsPropertyOwnerIdFromTheBody` | The body field is gone | 12a |
| `Req12b_FormInit_SeedsAnAccountId` | The account exists on the form | 12b |
| `Req12c_FormInit_PublishesBothIdsToTheScope` · `Req12c_EditPagePatchesOwnerFromServer_RepublishesIt` | Both moments that set the scope publish it | 12c |
| `Req12a_PropertyOwnerIdControl_StillDrivesTheChargePanelBinding` | The form control survived the body change | 12a |

**Manual verification, only once the server half is running** (*Prerequisites* 1): create a lease from
the UI; confirm `201`, confirm in the browser's network tab that the request carries both headers and no
`propertyOwnerId` in the body, and confirm the stored `rent_agreement.account_id` and
`property_owner_id` match the headers sent.

---

## Git & Rollback

| Milestone | Commit point | Message |
|---|---|---|
| M1 | After the four interceptor tests pass | `feat(rent-agreements): attach the scope ids as headers on every Billing API call (req 12c–12e)` |
| M2 | After the create-component tests pass | `feat(rent-agreements)!: stop sending propertyOwnerId in the create body (req 12a, 12b)` |

M1 alone is **safe to release**: it adds headers nobody reads yet, and the body is unchanged, so the
current server still works. M2 is the breaking half. Both revert cleanly with `git revert` — there is no
persisted state on this side — and reverting M2 restores the old body, which is the escape hatch if the
server half has to be rolled back.

---

## Final Validation

- [ ] This plan's first line points at `docs/specs/rent-agreements/01-rent-agreement-edit-ui.md` and
      that file exists; its v21 changelog row links back to this plan file; both relative links resolve.
- [ ] Authorship is recorded on both sides: this header names Abhishek Chaurasia and 2026-09-14, and the
      spec's v21 changelog row carries the same author and date.
- [ ] Every part of requirement 12 is named by at least one test: 12a (body omits it, form keeps it),
      12b (account seeded), 12c (published at both moments), 12d (attached, scoped, silent when
      unpublished), 12e (the cost is pinned). 12f is a release fact, not a testable one — it is checked
      by the item below.
- [ ] **The server half is merged and the release order agreed** (*Prerequisites* 1 and 2). This is the
      one item a green suite does not satisfy.
- [ ] `npm test` passes · `npm run build` passes.
- [ ] `e2e/` checked for create-body assertions.
- [ ] The line-item catalog scoping still works — the charge panel receives an owner.
- [ ] No new dependency, no auth code, no change to the invoicing query parameters.
