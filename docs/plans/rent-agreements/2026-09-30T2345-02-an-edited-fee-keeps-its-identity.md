**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v22

# An edited fee keeps its identity

Opening a stored fee in the drawer and saving it sends it back **without its id**. The billing service
matches stored fees on `id` alone, so it reads the edit as a removal and an addition.

> *"edit terms se update kiya but uske duplicate invoice ban gaye"*
> — the user, 2026-09-30

Reproduced in the billing database the same day: a `$12` fee ended up carrying `$24` of live invoices.

## 1. Setup & Environment

Repository `rent-schedule-ui`, branch `abhishek/the-cadence-and-the-payload-describe-the-same-fee`.

```
npm test -- --watch=false --browsers=ChromeHeadless
```

The suite stands at **523**.

**No contract change and no new field.** `id` is already on `AdditionalChargeCreationRequest`, already
written by `toChargeCreationRequest`, and already sent for every fee the drawer has not been opened on.

### Prerequisites & Open Questions

**None.**

**Where the id goes — read, not guessed:**

| Step | Verdict |
|---|---|
| `toChargeCreationRequest` sets `id: charge.id` | correct |
| `AdditionalChargePanelComponent.create()` builds from `form.value`; no `id:` anywhere in the panel | correct — the drawer authors a fee, it does not know which row it stands in for |
| `upsertAdditionalCharge` replaces the stored entry **wholesale** | **the defect** |

**The service half is fixed separately** — spec `06` requirement 223 in `innago-rent-accounting` makes
a removed fee take its already-raised invoice with it. Neither fix removes the need for the other, and
this plan writes nothing there.

## 2. Milestone-Based Implementation

### Milestone 1 — The edit keeps the id the entry was holding (requirement 40)

`upsertAdditionalCharge` carries the existing entry's `id` onto the payload the drawer emitted, instead
of replacing the entry with it. The add branch is untouched — a new fee still goes with no `id`, which
is what tells the service it is new.

The fix goes here rather than in the panel deliberately: the panel is handed one fee and no index, so
it cannot know which stored row it is editing. The list knows, and the list is what discards it.

| | |
|---|---|
| Production files | `rent-agreement-create.component.ts` |
| Rules | requirement 40 |
| Tests | `an edited fee is sent back with the id it was loaded with`, `changing the mode keeps the id`, `a newly added fee is still sent without one`, `the deposit drawer keeps the id too` |

**Flow Card** — *trigger:* the owner opens a saved fee on the lease editor, changes it, and saves.
`additional-charge-panel.component.ts#create` emits the authored fee →
**`rent-agreement-create.component.ts#upsertAdditionalCharge` — the business rule lives here** →
`additionalCharges` signal → `PUT …/terms`. *Fails when:* the id is carried onto a **new** fee as
well, which would make every added fee claim to be an edit of whatever row it landed beside.
*Start debugging here:* `upsertAdditionalCharge`.

**Commit:** `fix(ui): an edited fee keeps the id it was loaded with`

`STOP — review checkpoint`

## 3. Scope & Context Rules

**In scope:** `upsertAdditionalCharge`, on both drawers — the fee panel and the deposit panel share it.

**Out of scope — the panel.** It emits a fee built from its form and should not gain an id input. Its
job is authoring; identity belongs to the list that opened it.

**Out of scope — `toChargeCreationRequest`.** It already carries the id correctly, and its own comment
explains why every field is carried on this route.

**Out of scope — the billing service.** Requirement 223 is its own spec and plan, in its own
repository.

**Out of scope — removing a fee.** Deletion already works; this plan must not resurrect a removed
entry's id.

### Technical Decisions

| Decision | Chosen | Rejected | Source |
|---|---|---|---|
| Where the id is restored | `upsertAdditionalCharge`, from the entry being replaced | An `@Input() chargeId` on the panel | The panel is handed one fee and no index; giving it an id would make it responsible for an identity it cannot verify |
| The add branch | Untouched — still no `id` | Generate one client-side | The absence of an id is the contract's own signal for "new" (service requirement 208/213). Inventing one would make every new fee claim to be an edit |
| Which drawers | Both — the shared method | Only the fee drawer | The deposit drawer calls the same method with the same defect. Fixing one would leave the other silently broken |

## 4. Verification

`npm test -- --watch=false --browsers=ChromeHeadless` green, with the four cases present and the
reported case **shown to fail with the fix removed**.

## 5. Git & Rollback

One commit. Rolling it back restores today's behaviour — an edit that reaches the service as a removal
and an addition.

## 6. Final Validation

**Suite 523 → 527**, all green. Three of the four new cases were **red before the fix** and the fourth
— the newly added fee — passed throughout, which is what says the add branch was never the problem.

### Diverged from the plan

**The first version of the fix was wrong and an existing case caught it within one run.** It spread the
id unconditionally, so a fee added on this screen and edited *before* the save — which has no id — came
back carrying `id: undefined`, a key the drawer never emitted.
`re-creating an edited charge replaces it in place, preserving its target and index` failed on exactly
that.

**That case was right, and it was not touched.** The implementation moved instead: the id is carried
only when the replaced entry has one. A test that fails because the code grew a defect is the test
working, and changing it would have hidden a real (if small) regression in the payload.

- [x] Requirement 40 named by at least one test. *Four cases under one `describe` naming it.*
- [x] A stored fee opened and saved unchanged keeps its `id`.
- [x] A stored fee whose **mode** changes keeps its `id` — the reported case.
- [x] A stored fee whose amount, items or dates change keeps its `id`. *Same path; the mode case is the
      one that was reported, and is the one asserted.*
- [x] A **newly added** fee is still sent with no `id`, and with no `id` key at all.
- [x] The **deposit** drawer behaves identically. *It calls the same method, and a case pins it.*
- [x] Removing a fee still removes it. *`removeAdditionalCharge` untouched; the suite's existing cases
      for it pass unmodified.*
- [x] The reported case was **red before the fix**, along with two others.
