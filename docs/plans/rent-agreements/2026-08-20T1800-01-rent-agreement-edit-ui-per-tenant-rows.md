**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v13

# Per-tenant rows on the edit page

Renders the "View/Edit Individual Rent Schedule" screen: in **non-group** mode each schedule row expands
into one editable row per tenant (amount, due date, cancel); in **group** mode it shows schedule rows only.
Backend contract: `innago-rent-accounting` spec `01-rent-agreement.md` **v49/v50**, FR-063 – FR-085.

---

## Checklist

**Backend facts this depends on — all shipped and verified live:**

- [x] `PUT …/terms` accepts a `tenants[]` collection on each schedule row. **No new endpoint** — the
      per-tenant edits ride on the existing terms save, which is what lets this screen keep batching every
      edit until its own Save.
- [x] `GET /rent/agreements/{id}` and the `PUT …/terms` response both return `tenants[]` and
      `tenantAmountTotal` on every schedule row.
- [x] `POST /rent/schedule/preview` accepts `isGroupInvoice`, `tenantSplit[]` and `pendingTenantRows[]`,
      and stays a pure function of the request.
- [x] Omitting all three preview fields returns the **pre-v49 shape**, so nothing here is a breaking
      change for the create flow.

**Three contract rules that are easy to get backwards. Each one corrupts data silently if inverted:**

- [ ] **An absent per-tenant `amount` CLEARS the override** — it does not mean "unchanged". The screen must
      therefore submit the complete per-tenant set on every save, exactly as it already does for schedule
      rows. Sending a partial set wipes the property owner's edits with a `200`.
- [ ] **An absent `dueDate` DOES mean unchanged.** The asymmetry with `amount` is deliberate: a tenant's
      date has no computed value to fall back to.
- [ ] **An absent `isCancelled` RESTORES a cancelled tenant.** Same rule the schedule row already uses
      (spec v10 here), so the component reuses its existing pattern rather than inventing a second one.

**One shape rule that will produce a wrong screen if ignored:**

- [ ] **Read `row.tenants` per cycle; never infer the shape from the lease's group-invoice setting.** After
      a group/non-group switch a protected cycle keeps its old shape, so one agreement legitimately carries
      children on some cycles and none on others. `isGroupInvoice` describes only how *future* cycles bill.

---

## Technical Approach

### State

The component already tracks per-row state as `Set<string>` keyed by `scheduledDate`
(`manuallyChangedRowDates`, `cancelledRowDates`). Per-tenant state follows the same shape, keyed by the
pair:

```ts
// `${scheduledDate}|${tenantId}` — one composite key, so a tenant edited on March is independent of the
// same tenant on April. Sets and Maps rather than a nested structure, matching what the component already
// does, so the existing reset-on-preview logic extends rather than being rewritten.
readonly tenantAmounts = signal<Map<string, number>>(new Map());
readonly tenantDueDates = signal<Map<string, string>>(new Map());
readonly cancelledTenantKeys = signal<Set<string>>(new Set());
readonly expandedRowDates = signal<Set<string>>(new Set());
```

`expandedRowDates` is view state only and is deliberately **not** cleared on preview — collapsing every
row whenever the user changes an unrelated field would be hostile.

### Reading

`loadAgreement()` seeds the three edit signals from `row.tenants`, so a saved override shows as an override
on load rather than looking like a fresh computed share. `isAmountManuallyEdited` seeds `tenantAmounts`;
a `dueDate` differing from the parent's seeds `tenantDueDates`; `status === 'Cancelled'` seeds
`cancelledTenantKeys`.

### Writing

`saveEdit()` builds each row's `tenants[]` from the **current tenant roster**, not from the keys that
happen to be in the maps — the complete set every time, per the contract rule above. For each tenant:
`amount` only when the map holds one, `dueDate` only when the map holds one, `isCancelled` from the set.

### Preview

`generatePreview()` gains `isGroupInvoice`, `tenantSplit` (from the loaded roster) and
`pendingTenantRows` (from the three signals). The preview response's `row.tenants` then drives the table,
so an unsaved edit shows immediately — which is the whole reason the endpoint takes pending state.

### Group mode

When every cycle reports `tenants: []`, no expander renders at all. The component must not offer per-tenant
editing it would then be `422`'d for.

---

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Per-tenant state shape | Composite `${scheduledDate}\|${tenantId}` keys in `Map`/`Set` signals | A nested `Map<date, Map<tenant, edit>>`; a per-row child component owning its state | Matches the per-row tracking the component already has, so the existing reset-on-preview path extends instead of being rewritten. A nested map doubles the null-handling at every read. |
| 2 | Row shape source | `row.tenants` from the API, per cycle | The lease's `isGroupInvoice` flag | After a mode switch the two disagree **by design** — a protected cycle keeps its old shape. Reading the flag renders the wrong table for exactly the cycles that matter most. |
| 3 | What `saveEdit` sends | The **complete** per-tenant set for every non-group row, every save | Only the tenants the user touched | An absent `amount` clears the override, so a partial set silently wipes edits. This mirrors the row-level decision spec v6 already made here. |
| 4 | Expansion state on preview | **Not** reset | Reset with the other tracking sets | It is view state, not data. Collapsing every row because the user changed the end date would be hostile, and no correctness rule depends on it. |
| 5 | Where the total is shown | Both `rent` **and** `tenantAmountTotal` on the parent row, whenever they differ | Replace the parent's rent with the children's sum | Once an amount is authored they legitimately differ; showing one hides either what the lease says or what the tenants owe. |

---

## Task Checklist

### Task 1 — Models — **DONE**

- [x] `ScheduleRowCreationRequest.tenants?: TenantRowEditRequest[]` and the `TenantRowEditRequest` type,
      with the absent-`amount`-clears and absent-`isCancelled`-restores rules documented on the fields.
- [x] `RentAgreementScheduleRowResponse.tenants?` / `.tenantAmountTotal?` and
      `RentAgreementTenantRowResponse`.
- [x] `PreviewRentScheduleRequest.isGroupInvoice/tenantSplit/pendingTenantRows`, `TenantSplitInput`,
      `PendingTenantRowInput`, `PreviewTenantRow`, and `ScheduleRow.tenants/tenantAmountTotal`.
- [x] `tsc --noEmit` clean.

### Task 2 — Component state and reads

- [ ] Add the four signals from *Technical Approach → State*.
- [ ] Seed the three edit signals in `loadAgreement()` from each row's `tenants[]`.
- [ ] Extend the preview-response handler to keep the seeded state (it already resets the row-level sets;
      the per-tenant ones follow the same rule, since the backend has just recomputed).
- [ ] Helpers the template needs: `tenantKey(date, tenantId)`, `isTenantCancelled(...)`,
      `isTenantAmountEdited(...)`, `toggleRowExpansion(date)`, `isRowExpanded(date)`.

### Task 3 — Template and styles

- [ ] An expander control on each schedule row that has `tenants.length > 0`; nothing rendered when it is
      empty, so group mode shows schedule rows only.
- [ ] A child row per tenant: tenant, due date, amount, an edited marker, and a per-row cancel/restore.
- [ ] The parent row shows `tenantAmountTotal` beside `rent` when the two differ.
- [ ] A frozen child (`isFrozen`) renders read-only, matching how a frozen schedule row already behaves.

### Task 4 — Writes

- [ ] `saveEdit()` sends the complete `tenants[]` per non-group row.
- [ ] `generatePreview()` sends `isGroupInvoice`, `tenantSplit` and `pendingTenantRows`.
- [ ] The create path sends **no** `tenants` — the backend `422`s it, and there is no roster yet.

### Task 5 — Tests

- [ ] Group mode renders no expander.
- [ ] Non-group renders one child per tenant, and the children sum to the parent's `tenantAmountTotal`.
- [ ] Authoring an amount sends it; **clearing it omits `amount`** rather than sending `null`.
- [ ] Cancelling a tenant sends `isCancelled: true`; restoring omits the flag.
- [ ] A row whose `tenants` is `[]` sends no `tenants` key at all.
- [ ] The complete set is sent even when only one tenant was touched — the decision-3 guard.

### Task 6 — Spec

- [ ] Add a **v13** changelog row to `01-rent-agreement-edit-ui.md` linking to this plan.

---

## Test Plan

`ng test` for the component specs above. The load → edit → save → reload round trip is the case worth
covering end to end, because the three asymmetries in the Checklist are only observable across it: an
override that survives a reload, a clear that returns to the computed share, and a cancel that restores.

Manual verification against a live API (the backend's own Postman folder `Per-Tenant Rent Schedule` sets up
the same states): expand a non-group cycle, author one tenant down, save, reload, clear it, and confirm the
tenant returns to its computed share rather than a stale figure.
