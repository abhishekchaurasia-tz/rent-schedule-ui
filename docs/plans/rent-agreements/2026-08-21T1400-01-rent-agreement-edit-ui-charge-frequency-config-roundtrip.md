**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v14

# Round-trip an additional charge's `frequencyConfig` when loading it for edit

Reported by the user: editing and saving an agreement with a recurring, rental-invoice-attached
additional charge fails `422 "FrequencyConfig is required for a recurring additional charge attached
to the rental invoice."` — even when the charge itself was never touched.

Root cause: `RentAgreementAdditionalChargeResponse` (`rent-agreement.models.ts`) declares every field
the backend's `GET`/`PUT …/terms` response carries for a charge **except** `frequencyConfig`, and
`toChargeCreationRequest` (same file), which converts a loaded charge into the editable
`AdditionalChargeCreationRequest` shape, copies every field verbatim **except** that same one. So
`additional-charge-panel.component.ts`'s `applyInitialCharge` → `applyFrequencyConfig` always receives
`undefined` for an existing charge, never prefills the per-frequency form controls, and `save()`
reconstructs an empty/invalid `frequencyConfig` from those still-default controls — which the backend
then correctly rejects as missing.

This is the client-side half of backend spec `01-rent-agreement.md` v52, which fixed the mirror-image
bug: the backend response never sent `frequencyConfig` at all before v52. Both halves were needed —
fixing only the backend leaves the client still dropping the field on load; fixing only the client has
nothing to receive.

## Checklist

- [x] Confirmed by reading `additional-charge-panel.component.ts`'s `applyFrequencyConfig` and
      `applyInitialCharge`: both already handle a *present* `frequencyConfig` correctly (this is the
      same logic the create flow already exercises, via `buildFrequencyConfig`/
      `frequencyConfigToFormValue` in `frequency-config.util.ts`) — nothing there needs to change, only
      the missing field on the way in.
- [x] Confirmed the backend fix (spec v52) is already shipped and its `RentAgreementAdditionalChargeResponse`
      now echoes `frequencyConfig` with real per-frequency content (not an empty object) on every path.

Open questions: **none.**

## Technical Approach

Two one-line changes in `rent-agreement.models.ts`:

1. Add `frequencyConfig?: FrequencyConfig | null;` to `RentAgreementAdditionalChargeResponse`, next to
   the existing `frequency?: RentFrequency | null;` field.
2. Add `frequencyConfig: charge.frequencyConfig,` to `toChargeCreationRequest`'s return object, next
   to the existing `frequency: charge.frequency,` line.

No other file changes. `AdditionalChargeCreationRequest` already declares `frequencyConfig?:
FrequencyConfig | null` (it is what the create flow already sends), so no target-type change is
needed — only the source of the copy was missing the field.

## Technical Decisions

None — this is a one-field, mechanical fix restoring what the type already promised to carry
end-to-end; no design choice was open.

## Task Checklist

- [ ] 1. `src/app/rent-agreements/rent-agreement.models.ts`: add `frequencyConfig?: FrequencyConfig |
      null;` to `RentAgreementAdditionalChargeResponse`.
- [ ] 2. Same file: add `frequencyConfig: charge.frequencyConfig,` to `toChargeCreationRequest`.
- [ ] 3. `tsc --noEmit` clean.
- [ ] 4. New/updated fact in `additional-charge-panel.component.spec.ts` or wherever
      `toChargeCreationRequest` is already tested: loading a recurring, rental-invoice-attached charge
      with a real `frequencyConfig` (e.g. `{ dueOnDay: 5 }`) round-trips it into the form controls, and
      saving without touching anything resubmits the same `frequencyConfig`.

## Test Plan

**New/updated fact (Task 4)** proves the exact reported scenario: load → no edit → save → the request
body still carries `frequencyConfig`.

**Commands and expected results:**

```bash
npx tsc --noEmit -p tsconfig.json                                   # clean
npx ng test --watch=false --include='**/additional-charge-panel*.spec.ts'   # all green, +1 over current count
```

Manual verification against the live API (per this repo's `run` skill): open an existing agreement
with a recurring, rental-invoice-attached additional charge; open its edit dialog; save without
changing anything; confirm `200`, not `422`.
