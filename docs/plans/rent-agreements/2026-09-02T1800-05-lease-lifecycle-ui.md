**Spec:** [`docs/specs/rent-agreements/05-lease-lifecycle-ui.md`](../../specs/rent-agreements/05-lease-lifecycle-ui.md) — v1

# Lease lifecycle UI — terminate and archive

## Checklist

- [x] **Backend is in place.** `POST …/{id}/terminate` and `POST …/{id}/archive` shipped in backend
      spec `01-rent-agreement.md` v74, with 12 endpoint tests and a Postman folder. Request and
      response shapes are taken from those, not guessed.
- [x] **The status field is now trustworthy, and that is what makes this component possible.** Until
      backend v73 the detail response's `status` answered `InProcess` for every lease however long it
      had been active — the response resolved it from a stored column nothing ever wrote. Backend v73
      dropped that column and computes it. Every gating decision here depends on that fix.
- [x] **No new dependency.** Signals + `HttpClient` + the existing `RentAgreementsService`.
- [x] **Version fence understood.** The detail response does not expose the stored `version`, and
      `ActivateLeaseComponent` already sends a constant `1`. The backend fence rejects only a version
      *below* what is stored, so a constant `1` passes after an activation that also sent `1`. Sending
      `1` here is deliberate and matches the sibling component, not an oversight.
- [x] **No open questions.**

## Technical Approach

### One component, two actions

`LeaseLifecycleComponent` hosts both, because on the backend they are one operation with a different
cutoff — terminate cuts at a stated date, archive cuts at today — and they share everything this
component actually contains: the confirmation flow, the version, the idempotent-repeat rendering, and
the `detail`-verbatim error handling. Two components would duplicate all of it to vary one request
body.

It is a **sibling** of `ActivateLeaseComponent`, not a replacement: activation opens the billing gate
and these close it, but merging the three is deferred (see *Out of scope*).

### The gating is the point, and it is new

`ActivateLeaseComponent` carries a fourteen-line comment explaining why it *cannot* gate on `status`:

> *"the detail endpoint exposes neither `isActivated` nor `leaseId` — only the derived `status`, which
> stays `InProcess` on an activated lease. Verified against a running service on 2026-08-26."*

That was true and is no longer. Backend v73 removed the stored column the response was reading, so
`status` now reports `Active`, `Expiring`, `Expired`, `Terminating`, `Terminated` and `Archived`
correctly. This component therefore does what its sibling could not: it takes the status and offers
only the actions it permits (spec FR 2 – FR 5), which keeps a user from discovering a `422` by pressing
a button.

**`ActivateLeaseComponent`'s comment is corrected in this change** — leaving a paragraph that says the
field cannot be trusted, next to a component that trusts it, is how the next reader gets it wrong.
Its *behaviour* is untouched.

### Two confirmations, and one of them says the word

Both actions confirm first, because both withdraw money the lease would otherwise have billed. They
are not the same weight, though, and the copy says so:

- **Terminate** — needs a date, so the confirm step is where the date is entered. Reversible in
  practice: the backend accepts a second call with a corrected date.
- **Archive** — needs nothing, and **cannot be undone**. The backend has no un-archive (backend
  FR-107), and there reversing one would restore the lease without the invoices it removed. The
  confirmation states that plainly rather than letting a user find out afterwards.

### What the response is trusted for

`cyclesCancelled` and `status` are rendered from the response, never computed here. The component has
no view of which cycles were protected — the backend's recompute decides that, protecting anything
paid or past-due — so any count this screen calculated would be a guess that looked authoritative.

A repeat (`alreadyTerminated` / `alreadyArchived`) is rendered as an informational success, the same
distinction `ActivateLeaseComponent` already draws: a green "done" banner on a call that changed
nothing is a lie about work performed.

### Reload, don't patch

After any success the component emits `changed`, and the host re-reads the lease through the same
`getById` path `onActivated()` already uses. Nothing here mutates the host's model. The status chip,
the offered actions and the schedule rows then all come from one server read, so they cannot disagree
with each other.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Component granularity | One `LeaseLifecycleComponent` for both actions | One per action; folding both into `ActivateLeaseComponent` | They share the confirm flow, the version, the repeat rendering and the error handling; only the request body differs. Folding in activation is worth doing but would make this change harder to review. |
| 2 | Gating on `status` | **Yes** — offer only what the status permits | Always offer both and let the backend refuse | Backend v73 made the field trustworthy; before it, this was impossible. A button that reliably `422`s is a worse experience than no button. |
| 3 | `ActivateLeaseComponent`'s stale rationale | Corrected in this change; behaviour untouched | Left alone; changed to gate on status too | Its comment now argues the opposite of what its neighbour does, which is actively misleading. Changing its behaviour is a separate improvement. |
| 4 | The effective date's type on the wire | Plain `YYYY-MM-DD` | An ISO instant | The backend treats it as a calendar date in the property's zone; sending an instant would let a timezone shift it by a day, which moves a cycle. |
| 5 | `version` | Constant `1`, matching `ActivateLeaseComponent` | Read it from the lease; track it client-side | The detail response does not expose it, and the fence rejects only a *lower* version — so `1` passes after an activation that sent `1`. Inventing a client-side counter would be state this app has no way to keep correct. |
| 6 | Cycle counts and post-action status | Taken from the response | Computed from the loaded schedule | The recompute protects paid and past-due cycles by rules this client does not model. A computed count would look authoritative and be wrong. |
| 7 | Re-terminating with a corrected date | **Not offered** | Expose it as an edit of the recorded date | The backend supports it, but the confirmation would have to explain that cycles can be restored as well as withdrawn — its own design problem, and not needed to end a lease. |
| 8 | Where it lives | Edit Lease, beside the activate control | Its own route; the tenants screen | It acts on a lease the user is already looking at and can already edit, and the activate control set that precedent. |

## Data Model & Schema Changes

None — this is a client. Four interfaces are added to `rent-agreement.models.ts`, mirroring the
backend's request and response shapes exactly; no existing interface changes.

## Task Checklist

- [x] **1. Models.** In `src/app/rent-agreements/rent-agreement.models.ts`, add
      `TerminateRentAgreementRequest`, `TerminateRentAgreementResponse`,
      `ArchiveRentAgreementRequest` and `ArchiveRentAgreementResponse` exactly as the spec's
      *Input / Output models* section states, each field documented with what the backend guarantees
      about it.
- [x] **2. Service.** In `src/app/rent-agreements/rent-agreements.service.ts`, add `terminate()` and
      `archive()` beside `activate()`, following its shape: `POST` to
      `${this.baseUrl}/${agreementId}/terminate` and `…/archive`.
- [x] **3. Component.** New `src/app/rent-agreements/lease-lifecycle.component.ts` + `.html` + `.scss`:
      the two inputs, the `changed` output, the `pendingAction`/`effectiveDate`/`result`/`error`
      signals, the `canTerminate`/`canArchive` computeds implementing the status table, and the two
      calls. Reuse `ActivateLeaseComponent`'s `describeError` approach so a Problem Details `detail`
      reaches the user verbatim.
- [x] **4. Host it.** In `rent-agreement-create.component.html`, place `<app-lease-lifecycle>` beside
      `<app-activate-lease>` in the `isEditMode` block, passing the loaded lease's `status` and wiring
      `(changed)` to the existing reload. Import the component in
      `rent-agreement-create.component.ts`.
- [x] **5. Correct the stale rationale.** In `activate-lease.component.ts`, rewrite the paragraph
      claiming `status` cannot be trusted — and the matching comment in
      `activate-lease.component.spec.ts` — since backend v73 fixed it. Behaviour unchanged.
- [x] **6. Tests.** New `lease-lifecycle.component.spec.ts` covering: the status table's five rows, the
      terminate happy path, an idempotent repeat rendering as information rather than success, a `422`
      rendering the backend's `detail`, and `changed` firing on both success and repeat. Use
      `HttpTestingController`, as the sibling specs do.
- [x] **7. Verify.** `npm test` green and `npx tsc -p tsconfig.app.json --noEmit` clean.
- [x] **8. Spec** — this file's v1 changelog row is already written.

## Test Plan

| What is verified | Where | Expected |
|---|---|---|
| An unactivated draft offers nothing | `lease-lifecycle.component.spec.ts` — status `InProcess` | Neither button; the "activate first" message |
| A live lease offers both | statuses `Active`, `Expiring`, `Future` | Both buttons |
| A terminating lease offers archive only | statuses `Terminating`, `Terminated` | Archive only |
| An archived lease offers nothing | status `Archived` | No buttons; the terminal message |
| Terminate posts the picked date and reports the outcome | happy path with `status: 'Terminating'`, `cyclesCancelled: 3` | Correct request body; both values rendered from the response |
| A repeat is information, not success | response with `alreadyTerminated: true` | The repeat wording; no claim that cycles were withdrawn |
| A refusal shows the backend's own words | `422` with a Problem Details `detail` | `detail` rendered verbatim |
| The host reloads after either outcome | `changed` emission on success and on repeat | Emitted both times |
| Nothing else broke | `npm test` | Green |

**Commands.**

```bash
npm test
npx tsc -p tsconfig.app.json --noEmit
```

## Out of scope

- **Merging the three lifecycle actions into one component.** Now possible, worth doing, and
  deliberately not done here — it would pull the tenants screen in too and make this change harder to
  review. `ActivateLeaseComponent` keeps its behaviour; only its misleading comment is fixed.
- **Correcting a recorded termination date** — Technical Decision 7.
- **Un-archive / un-terminate** — the backend has neither, by design.
