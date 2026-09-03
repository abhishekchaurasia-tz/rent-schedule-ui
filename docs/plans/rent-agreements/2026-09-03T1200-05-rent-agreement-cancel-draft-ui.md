**Spec:** [`docs/specs/rent-agreements/05-rent-agreement-lifecycle-ui.md`](../../specs/rent-agreements/05-rent-agreement-lifecycle-ui.md) — v3, requirements 16–19
**Enabled by:** backend `01-rent-agreement.md` v77 FR-114 – FR-118 — `POST …/{id}/cancel`, already live and already covered by the Postman collection's `Rent Agreement Lifecycle` folder (cases 14–18, 26)

---

## Checklist

- [x] **The backend endpoint already exists and is exercised end to end** — `CancelRentAgreementCommandHandler`, the `/cancel` route, and Postman scenarios for the happy path, the idempotent repeat, an unknown agreement (404), and an already-activated agreement (422). Nothing new needed there.
- [x] **`RentAgreementLifecycleComponent` was the wrong place to add nothing.** A draft (`InProcess`) rendered no lifecycle UI at all — by design, because it has nothing to terminate or archive — but that left "a lease that was signed and then fell through" with no UI path to dispose of it, only row-by-row schedule deletion.
- [x] **Cancel is a third, disjoint door** — never offered alongside Terminate/Archive, and vice versa (backend enforces this both ways with `422`). Folded into the same component rather than a new sibling because it is still gated on the same `status` input and belongs beside the other two lease-ending actions.
- [x] **A cancelled draft answers 404 on the next `GET`** (FR-114), so the host cannot reload it the way it does after terminate/archive. Needed a distinct output (`cancelled`) so the host knows to navigate away instead of re-reading.

---

## Technical Approach

- **Models** (`rent-agreement.models.ts`): added `CancelRentAgreementRequest { version }` and `CancelRentAgreementResponse { agreementId, alreadyCancelled, cyclesDeleted, chargesDeleted, proposalsDeleted, tenantsDeleted }`, mirroring the backend's `CancelRentAgreementCommand`/`CancelRentAgreementResponse` shape.
- **Service** (`rent-agreements.service.ts`): added `cancel(agreementId, request)` — `POST …/{id}/cancel`, same shape as `terminate`/`archive`.
- **Component** (`rent-agreement-lifecycle.component.ts`):
  - `PendingAction` gains `'cancelDraft'`.
  - `cancelResult` signal, `cancelAgreement()` method (sends the constant `version: 1`, same reasoning as `ActivateLeaseComponent`).
  - A new `@Output() cancelled` — separate from `changed` — emitted only on a successful cancel, since a reload after this call would 404.
  - `isDraft()` now gates a **Cancel this draft** button instead of nothing.
- **Template**: draft branch shows the button (or the result banner once cancelled), plus a confirmation dialog matching the Terminate/Archive ones' shape ("This cannot be undone").
- **Host** (`rent-agreement-create.component.ts`/`.html`): wires `(cancelled)="onCancelled()"`, which navigates to `/rent-agreements/open` rather than re-reading the now-deleted agreement.

### Verified by running it

- [x] Karma suite green: `rent-agreement-lifecycle.component.spec.ts` (31 specs) and `rent-agreement-create.component.spec.ts` (21 specs).
- [ ] Manual click-through against a running backend — not done in this session; the user should confirm the Cancel button, confirmation copy, and post-cancel redirect against a live draft before merging.
