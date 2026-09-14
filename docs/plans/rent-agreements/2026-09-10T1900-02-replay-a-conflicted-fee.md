**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v6
**Author:** Abhishek Chaurasia · **Created:** 2026-09-10

# Replay a conflicted fee instead of reporting it

A property owner activates a lease, then immediately adds a parking fee. The page shows
*"A concurrent write won."* and the fee is gone from the endpoint's point of view, though still on
screen. Pressing the button again works. Nothing was wrong with the fee.

**What the `409` actually is.** Activation runs its own post-commit issuing pass over the agreement.
While that pass holds the aggregate, a second write to the same agreement loses the race and the
handler answers `409 Conflict`. It clears in well under a second. The person on this screen cannot
act on it, cannot prevent it, and cannot tell it apart from the other conflict this endpoint
raises — so the only honest handling is to try again on their behalf.

**Why the page could not.** Its own remarks said so, in the constraint being withdrawn here:

> **Idempotency key is out of reach.** The panel emits no `id`, so a retry after a timeout creates a
> second charge. The page therefore blocks its submit path while a request is in flight.

The first half was never quite true. The endpoint has keyed replay off the request body's `id` since
backend FR 57, and answers `200` instead of `201` when it recognises one (FR 60). What was missing
was not the mechanism but the key — and a key the client can mint is not out of reach at all.

## Setup & Environment

- Repo: `D:\Projects\innago-property-management\rent-schedule-ui` (Angular 19, Karma + Jasmine).
- Verify: `npx ng test --watch=false --browsers=ChromeHeadless`, and
  `npx tsc --noEmit -p tsconfig.app.json`.
- Backend for the live reproduction: `Innago.Billing.Api` on `http://localhost:5169`, PostgreSQL 18
  local. The DB password lives in `dotnet user-secrets` — pass it via `PGPASSWORD`, never echo it.

### Prerequisites & Open Questions

1. **Is the mint safe when the panel *does* supply an `id`?** Yes — `charge.id ?? crypto.randomUUID()`
   keeps the panel's value whenever there is one, which is the path taken when a loaded charge is
   resubmitted. Only the empty case is filled in.
2. **Does `crypto.randomUUID()` need a fallback?** No. It requires a secure context, and this app is
   served over HTTPS everywhere but `localhost`, which is itself treated as secure. The suite runs in
   headless Chrome, where it is present.
3. **Could the retry double-bill if the endpoint's replay ever regressed?** It could, which is why
   the key is minted in the same expression that builds the request rather than per attempt — one
   submission, one key, however many attempts. A test pins that the second POST carries the first
   one's key.

## Milestone 1 — mint a key and replay a `409` once

One vertical slice: the submit path in `AddAdditionalChargeComponent`.

### Flow Card

- **Trigger:** the fee panel's `created` event —
  `add-additional-charge.component.ts` → `onChargeCreated`.
- **Call path:**
  1. `onChargeCreated` builds `AddAdditionalChargeRequest`, filling `id` with
     `charge.id ?? crypto.randomUUID()`. **← the slice's rule lives here**
  2. `RentAgreementService.addAdditionalCharge` issues the POST.
  3. `retry({ count: 1, delay })` — `delay` returns `timer(CONFLICT_RETRY_DELAY_MS)` for a `409` and
     `throwError` for everything else, which is what makes it a `409`-only retry rather than a
     retry with a filter bolted on.
  4. `next` appends to `addedCharges` and closes the panel; `error` writes `submitError`.
- **Fails when:** the replay also answers `409` → the second answer's `detail` reaches the user, as
  the first would have before. A `422` or `404` → reported on the first answer, never retried. A
  second *distinct* submission while one is in flight → still dropped by the `submitting()` guard.
- **Start debugging here:** `AddAdditionalChargeComponent.onChargeCreated`.

### Tests (written first)

In `add-additional-charge.component.spec.ts`:

- `mints an idempotency key, so a replay cannot become a second charge` — the body's `id` matches the
  UUID shape.
- `replays the submission once when the server answers 409, and reports nothing to the user` — the
  second POST carries the first's `id`; `submitError` stays `null`, `submitting` false, one charge
  added.
- `gives up after one replay, and never retries a business rule` — a second `409` surfaces, and a
  `422` surfaces on its first answer.

Both retry tests were **proven to fail without the fix**: with the predicate forced false
(`error.status === 409 && false`), the run reported `TOTAL: 2 FAILED, 22 SUCCESS`, the first failing
on *"Expected one matching request … found none"* — the replay that never happened.

### Verification

`TOTAL: 324 SUCCESS` across the whole UI suite; `npx tsc --noEmit -p tsconfig.app.json` silent.

While in the file, the pre-existing *"does not submit twice while a request is already in flight"*
test was given real assertions — it had relied on `expectOne` throwing, so Jasmine reported it as a
spec with no expectations, which this repo forbids.

## Scope & Context Rules

### Technical Decisions

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Where the key comes from | `charge.id ?? crypto.randomUUID()` on the page | Change `AdditionalChargePanelComponent` to emit an `id` | The panel is shared with the lease screen and the invoice list, and is reused unchanged by contract. A host-side default changes nothing for them. |
| Retry scope | `409` only, one attempt, 400 ms | Retry `409`/`5xx`/timeouts with backoff | A `5xx` or a timeout leaves the client unable to know whether the write landed; with keyed replay that is *recoverable*, but it is a larger claim and wants its own slice. The `409` is the one that is both measured and certain. |
| Retry delay | A constant, `CONFLICT_RETRY_DELAY_MS = 400` | Configuration | The lock clears in well under a second; a configurable knob nobody turns is not worth the surface. |
| The in-flight guard | Kept | Removed now that retry exists | It answers a different question — a second *distinct* submission — and the retry is bounded anyway. |

### Out of scope

- Retrying anything other than `409`.
- Making the panel emit an `id` of its own.
- The remaining assertion-less specs on other screens (`ActivateLeaseComponent`,
  `UpdateProposedInvoiceComponent`, `InvoiceListComponent`, `NewItemTypeFormComponent`,
  `RentAgreementLifecycleComponent`) — same shape as the one fixed here, and each belongs with its
  own screen's next change.

## Git & Rollback

One commit against `main`. Rollback is a revert: the endpoint accepts a body `id` either way, so a
reverted client simply stops sending one.

## Final Validation

- [x] `npx ng test --watch=false --browsers=ChromeHeadless` — 324 passing.
- [x] `npx tsc --noEmit -p tsconfig.app.json` — clean.
- [x] Both retry tests proven to fail with the fix disabled.
- [x] Spec 02 v6 row added, requirement 16 written, the withdrawn constraint struck through in place.
- [x] `409` reproduced live against `Innago.Billing.Api` before the fix was written.
