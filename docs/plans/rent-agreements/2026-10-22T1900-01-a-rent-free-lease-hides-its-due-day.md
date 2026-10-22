**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v27
**Author:** Abhishek Chaurasia · **Created:** 2026-10-22 · **Last updated:** 2026-10-22 by Abhishek Chaurasia

# A rent-free lease hides its due day, and the first-date flag is read the v151 way

Delivers **requirement 16** (Billing `01-rent-agreement.md` v152 FR-174, innago-billing#330) and **requirement 17**
(Billing v151 FR-172, innago-billing#334). Both requested by the user on 2026-10-22.

| # | What | Requirement |
|---|---|---|
| 1 | At $0 the form still shows "Due on" and a required first date, and sends both | 16 |
| 2 | The edit screen keeps a stale first date when the flag says it may be picked again | 17 |

## 1. Setup & Environment

Repository `rent-schedule-ui`, branch `abhishek/a-rent-free-lease-hides-its-due-day`, cut with `--no-track` from
`origin/main` at `dc79c22` on 2026-10-22. Billing runs from `innago-rent-accounting` branch
`abhishek/a-rent-free-agreement-has-no-due-day` on port 5169 for the live check.

```
npx ng test --watch=false --browsers=ChromeHeadless
npx ng build
```

### Prerequisites & Open Questions

- A $0 create calls the Lease service, which accepts `null` only after its own change (Billing D45). Until then a
  live $0 create is refused at the Lease call; the request body is checked in the browser instead.
- No open question.

### Depth scan — every place the screen reads or writes the two fields

| Site (`rent-agreement-create.component.*`) | Today | v27 |
|---|---|---|
| Template: the five "Due on" blocks and the first-date label | Always shown | Hidden at rent 0 |
| `firstRentalDueDate` control | `Validators.required` always | Disabled at rent 0, so not required |
| `canGeneratePreview` | Needs a first date and a due day | Not at rent 0 |
| `buildCreateRequest`, `buildUpdateRequest` | Always send both | `null` at rent 0 |
| `refreshCandidateDates` | Asks for options at any rent | Not at rent 0 |
| `loadAgreement` | Patches both | Patches `null`; `frequencyConfigToFormValue(null)` already returns `{}` |
| `canAutoClearFirstRentalDueDate` | Clears when the flag is `false` | Clears when the flag is `true` (or on create) |
| `rent-agreement.models.ts` | Both non-null | Nullable on the two requests and the detail response |

## 2. Milestone-Based Implementation

### Milestone 1 — A rent-free lease (requirement 16)

Tests first, then code.

1. `rent-agreement-create.component.spec.ts`: at rent 0 the "Due on" control and the first-date select are not
   rendered; the create body carries `frequencyConfig: null` and `firstRentalDueDate: null`; typing 1000 shows them
   again and the first date is required.
2. `rent-agreement-edit.component.spec.ts`: a loaded rent-free lease (both `null`) renders without them and saves
   `null` for both; raising the rent requires a first date.
3. Code: the template guard, the control's enabled state following the rent, the two request builders, the
   preview and options gates, the models.

### Milestone 2 — The flag's reading (requirement 17)

1. `rent-agreement-edit.component.spec.ts`: with `isFirstRentalDueDateEditable: true`, a frequency change that
   drops the stored date clears it; with `false`, the stored date is kept.
2. Code: `canAutoClearFirstRentalDueDate`.

## 3. Scope & Context Rules

- In scope: the lease form (create and edit), its models, its tests.
- Out of scope: the Billing API (its own branch), the Lease V3 app, the fee panel.

### Technical Decisions

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Not required at $0 | Disable the control | A conditional validator | A disabled control is skipped by validation and by `form.value`, so nothing is sent by accident. |
| What a $0 save sends | Explicit `null` | Omit the fields | The terms endpoint replaces what it is given; `null` states the intent. |
| Flag reading | Follow Billing v151 | Keep v15's | v15 matched a meaning Billing no longer has. |
| Patterns | None new | — | Template guards and two booleans. |

## 4. Verification

- `ng test` and `ng build` pass.
- Live, against Billing on 5169: the Rent section at $0 shows only Payment Frequency and Rent; the create request
  body carries `null` for both (the Lease call refuses until the Lease service accepts it); an existing rent-free
  lease opens, takes a rent of 1000 with a picked first date and saves `200`; QA's #334 case clears the stale date.
- Do not continue if any check fails.

## 5. Git & Rollback

One commit per verified milestone, after asking the user. Rollback is a revert.

## 6. Final Validation

- [ ] Spec v27 links this plan; this plan links v27.
- [ ] Requirements 16 a–e and 17 each have a test.
- [ ] Screenshots of $0, $0 → rent and the #334 case.
