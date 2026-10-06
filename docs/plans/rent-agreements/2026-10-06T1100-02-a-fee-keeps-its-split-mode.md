**Spec:** [`docs/specs/rent-agreements/02-add-additional-charge-ui.md`](../../specs/rent-agreements/02-add-additional-charge-ui.md) — v23

# A fee keeps its split mode

An owner opened a saved deposit fee, changed nothing, and saved. The fee's invoice was voided and two
took its place. Reported 2026-10-05, traced through `innago_billing` on 2026-10-06.

**Nothing on the service misbehaved.** The client sent `splitMode: "PerTenant"` for a fee the owner had
saved as `Shared`, and every layer below honoured it — correctly, because a stated mode is an
instruction (billing requirement 208).

**The client sent it because it had already lost the real one.** `toChargeCreationRequest` carries
thirteen fields from the `GET` payload and `splitMode` is not among them, so the drawer opens on
`undefined` and falls to `?? 'PerTenant'`.

## 1. Setup & Environment

Repository `rent-schedule-ui`, branch `abhishek/a-fee-keeps-its-split-mode`, cut from `main`.

```
npm test -- --watch=false --browsers=ChromeHeadless
```

**No contract change and no new field.** `splitMode` is already on `AdditionalChargeCreationRequest`,
already on `RentAgreementAdditionalChargeResponse`, and already projected by the service's read query —
verified in `RentAgreementReadQueries` before this plan was written.

### Prerequisites & Open Questions

**None blocking.** The two halves were put to the user on 2026-10-06 and both were taken.

| Question | Answer |
|---|---|
| Carry the field, or stop sending it? | **Both** — carry it where it exists, send nothing where it does not |
| Is the service to change too? | **No for this defect.** Separately, it gains traceability so the next one is diagnosable from logs rather than from the client's source — its own spec and plan |

**The one thing this does not do is named so nobody expects it.** The reported lease holds
`split_mode = PerTenant` and a `voided` `$20.00` invoice. A withdrawn invoice is history and is not
un-withdrawn; see *Repairing the reported lease* below.

## 2. Milestone-Based Implementation

### Milestone 1 — The fee's split setting survives the round trip (requirement 41)

Two edits, in two files, and each is a guard on the other.

`toChargeCreationRequest` gains `splitMode: charge.splitMode`, beside the `tenantShares` block whose
comment already states the rule it was missing.

`AdditionalChargePanelComponent` keeps sending the field on every submission — requirement 26, and it
stays — but its fallback moves: `mode: this.initialCharge.splitMode ?? 'PerTenant'` becomes
`?? 'Shared'`.

**Omitting the field was the first draft of this plan and it was wrong.** Requirement 26 exists because
the service reads an absent `splitMode` on **create** through `ChargeSplitMode.Resolve`, which takes it
from the payer-row count — so a *Shared Lease* fee whose owner typed figures would be stored
`PerTenant` again, which is the defect requirement 26 fixed. The update route keeps the stored mode on
an absent field (requirement 208), so omitting is safe there and unsafe on the other. Sending it is
right on both.

**The fallback should be unreachable once the mapper carries the field**, and that is why it changes
rather than being deleted: wrong as `Shared` it merges two invoices into one the owner can correct;
wrong as `PerTenant` it voids a number a payer may already hold.

| | |
|---|---|
| Files | `rent-agreement.models.ts`, `additional-charge-panel.component.ts` |
| Rules | requirement 41 |
| Tests | `a stored Shared fee is sent back as Shared`, `a stored PerTenant fee is sent back as PerTenant`, `a fee that arrived without a mode falls back to Shared`, `a mode the owner picks in the drawer is still sent` |

**Flow Card** — *trigger:* the owner opens a saved fee on the lease editor and saves.
`RentAgreementCreateComponent#loadAgreement` → **`toChargeCreationRequest` — the business rule lives
here** → `additionalCharges()` → `AdditionalChargePanelComponent#ngOnInit` (`splitState`) →
`#buildPayload` → `PUT …/terms`.
*Fails when:* the field is dropped from the payload instead of defaulting — requirement 26 reverses,
and a Shared fee with typed figures is resolved back to PerTenant by the create route. The third test
holds that by asserting the key is present.
*Also fails when:* only the mapper is fixed. The guess then never fires for a fee loaded from `GET`,
but a fee the drawer builds from scratch still carries `PerTenant` — which is why the default moves
too.
*Start debugging here:* `toChargeCreationRequest`.

**Commit:** `fix(charges): a fee keeps its split mode across an edit`

`STOP — review checkpoint`

### Milestone 2 — The round trip is asserted end to end (requirement 41)

Milestone 1's tests are unit-level on either side of the gap. One component test drives the sequence
that actually failed: load an agreement whose fee is `Shared`, open the drawer, save **without
touching anything**, and assert the outgoing body still says `Shared`.

| | |
|---|---|
| Files | none |
| Rules | requirement 41 |
| Tests | `editing a Shared fee and saving unchanged sends Shared back` |

**Flow Card** — *trigger:* the same save, as the reproduction performed it.
`RentAgreementCreateComponent` load → drawer open → drawer save → `#buildTermsRequest` →
`HttpTestingController` captures the body.
*Fails when:* either half of Milestone 1 is reverted — this is the case that was red before the fix
and is the one a future refactor will break.
*Start debugging here:* the captured request body's `additionalCharges[0].splitMode`.

**Commit:** `test(charges): a no-op edit does not change a fee's shape`

`STOP — review checkpoint`

## 3. Scope & Context Rules

**In scope.** The mapper's missing field, and the drawer's default.

**Out of scope, deliberately.**

- **The billing service.** Requirement 208 is correct and is not being changed. Its traceability gap —
  that nothing in a production log distinguishes an owner's choice from a client's guess — is real and
  gets its own spec and plan on that side.
- **Repairing the reported lease.** Below, and not automated.
- **The deposit panel showing voided invoices.** Deliberate on the service side (spec `14` decision D9
  / BR-04): a voided deposit is included and reports `voided`. It is what made this look like a
  duplicate, and it is not a defect.

### Technical Decisions

| Decision | Chosen | Rejected, and why |
|---|---|---|
| Carry the field, or stop sending it | **Carry it, and keep sending it** | *Stop sending when unknown* — reverses requirement 26: the service resolves an absent mode from the payer-row count on **create**, so a Shared fee with typed figures would be stored PerTenant again |
| What the drawer does with no mode | **Falls back to `Shared`** | *`PerTenant`* — of the two guesses it is the one that multiplies invoices and voids a live number; *omit* — reverses requirement 26, see above |


## 4. Verification

- Milestone 1's four tests red before the change, green after.
- Milestone 2's case red against **either** half reverted, not just both.
- The whole suite green; no existing test rewritten. Any that contradicts requirement 41 is reported
  rather than changed.

## 5. Git & Rollback

Branch `abhishek/a-fee-keeps-its-split-mode` off `main`, one commit per milestone, each a working
state. Rollback is `git revert` of a single commit; no stored data is touched by either.

## 6. Final Validation

**532 pass, 0 fail**, up from 531.

**Three cases were confirmed red by removing the mapper line again after writing them** — the two unit
cases and, decisively, the end-to-end one. That third case is the point of Milestone 2: the mapper had
tests and the drawer had tests, and neither could fail, because the defect was that the mapper never
handed the drawer the field the drawer was being tested with.

### Diverged from the plan

**The first draft of this plan would have reversed requirement 26, and was corrected before any code
was written.** It called for the drawer to omit `splitMode` when it had none. The service resolves an
absent mode from the payer-row count on **create** (`ChargeSplitMode.Resolve`), so omitting would have
stored a *Shared Lease* fee with typed figures as `PerTenant` — the exact defect requirement 26 fixed.
The field is still sent on every submission; only the fallback moved, to `Shared`. The spec's
requirement 41 was corrected in the same pass.

**The mapper carries `charge.splitMode ?? undefined`, not `charge.splitMode`.** The response type
admits `null` — a fee riding the rent invoice records no mode of its own (requirement 29) — and the
request type does not. `null` is the response saying *there is nothing here*, so it is carried as an
absent key rather than as a stated value. The compiler caught this; the third unit test pins it.

**No existing test was rewritten.** `restores the mode, so a shared fee does not come back named`
passed before and after — it had always handed the drawer a mode, which is why it never caught this.

- [x] Requirement 41 named by at least one test.
- [x] A stored `Shared` fee, opened and saved unchanged, sends `Shared`.
- [x] A stored `PerTenant` fee, opened and saved unchanged, sends `PerTenant`.
- [x] A fee carrying no mode sends **no `splitMode` key at all** — asserted on keys, not on value.
- [x] A mode the owner picks in the drawer is still sent.
- [x] The reproduction was red before Milestone 1.
- [x] Every test the change contradicts is reported rather than rewritten.

## Repairing the reported lease

Not part of either milestone, and not scripted — one lease, and the right action depends on what the
owner wants the payer to hold.

The fee now stores `split_mode = PerTenant` with two live `$10.00` invoices, and the `$20.00` invoice
is `voided`. **The voided invoice stays voided**; nothing un-withdraws an invoice, and the two `$10.00`
invoices are real obligations the payers can see.

To put the fee back to `Shared`, an owner opens it and sets the control to *Shared Lease* — on a build
carrying this fix, so the save states `Shared` deliberately rather than guessing it. The service then
does the mirror of what it did on 2026-10-05: withdraws the two `$10.00` invoices and raises one
`$20.00`. That is a third and fourth invoice number on one fee, which is why it is a decision to take
rather than a step to run.
