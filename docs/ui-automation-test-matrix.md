# UI Automation Test Matrix — Rent Schedule / Rent Agreement / Invoicing

Source of truth: business rules extracted from `innago-rent-accounting` BE (Domain/Application/API layers) and
`docs/specs/*`, `docs/rent-schedule-requirements/*` in that repo, cross-checked against existing BE unit/API tests.
Goal: every branch the BE enforces should have a corresponding UI-driven (Playwright) scenario, not just an API test,
since the UI has its own translation/validation-surfacing logic that can diverge from the API contract.

Legend for **Automatable now**:
- ✅ UI exists today (`rent-agreement-create`, `additional-charge-panel`, `rent-schedule-preview` components) — write as Playwright UI test.
- 🔌 API-only for now — no UI screen exists yet; cover via `e2e/api/*.spec.ts` and flag as UI backlog once the screen ships.
- 🚫 Not implemented in BE at all yet (documented intent only) — do not write a test; note as future work.

---

## 0. Current State Snapshot (baseline before this work)

- Framework: Playwright (`playwright.config.ts`), two projects: `ui` (headed, baseURL `:4300`) and `api` (baseURL `:5169`).
- ~~No page-object/fixture layer exists yet.~~ **Corrected 2026-09-18** — `e2e/pages/` (`rent-agreement-create.page.ts`, `additional-charge-panel.ts`) and `e2e/fixtures/rent-schedule.fixtures.ts` are in place and used by the specs below.
- Existing specs, **as of 2026-09-18** (the four listed at baseline have become seven files and 102 tests):
  - `e2e/ui/rent-agreement-create.spec.ts` — 4 tests (basic create flow, calendar popup, API-error surfaced in UI, Custom-frequency date-picker swap).
  - `e2e/ui/additional-charge-panel.spec.ts` — 10 tests (§3.3 scenarios 79-81, 96, and the item picker). **Stubs `GET /api/v1/line-items`**, so it covers the picker given a `200` and never exercises the interceptor or the service.
  - `e2e/ui/rent-schedule-frequency-config.spec.ts` — 11 tests.
  - `e2e/api/rent-schedule.api.spec.ts` — 4 tests (preview success, end-before-start rejection, first-rental-due-date-options, create-agreement-from-preview).
  - `e2e/api/rent-agreement-validation.api.spec.ts` — 31 tests.
  - `e2e/api/rent-schedule-preview-validation.api.spec.ts` — 35 tests.
  - `e2e/api/rent-schedule-options-validation.api.spec.ts` — 7 tests.
- Gap: the BE alone enumerates 190+ distinct rule branches across rent-schedule generation, rent-agreement creation, and additional-charge/invoicing rules. Current UI suite covers roughly 4-5 of them end-to-end.

---

## 1. Rent Schedule Preview (`POST /rent-schedule/preview`) — ✅ UI exists (`rent-schedule-preview.component.ts`)

### 1.1 Field-level validation (surfaced as inline/form errors in UI)
| # | Scenario | BE ref |
|---|---|---|
| 1 | Rent = 0 or negative → error shown, no schedule rendered | `PreviewRentScheduleQueryValidator.cs:43-45`, `RentAmount.cs:39-42` |
| 2 | Start date left blank → required-field error | validator L47-49 |
| 3 | First rental due date left blank → required-field error | validator L51-53 |
| 4 | First rental due date **before** start date → error | validator L55-58 |
| 5 | First rental due date **equal to** start date → accepted (boundary, not an error) | validator L55-58 |
| 6 | Frequency not selected → required error | validator L60-62 |
| 7 | Lease term type not selected → required error | validator L83-85 |

### 1.2 Fixed-term branch
| # | Scenario |
|---|---|
| 8 | Fixed term with no end date entered → error |
| 9 | End date = start date (not strictly after) → error |
| 10 | End date = start date + 1 day → accepted (boundary) |
| 11 | Fixed term with month-to-month-only fields populated (invoice count / next-lease-start) → these fields hidden/disabled by UI; if forced via API, rejected |

### 1.3 Month-to-month branch
| # | Scenario |
|---|---|
| 12 | M2M selected → end-date field hidden/disabled in UI |
| 13 | M2M with invoice count blank or 0 → error |
| 14 | M2M with next-lease-start-date ≤ first rental due date → error |
| 15 | M2M with next-lease-start-date > first rental due date → accepted |
| 16 | M2M + Semesterly frequency selected → error ("Semesterly not allowed for month-to-month") — confirm UI disables/filters this combination in the frequency dropdown, not just server-side |

### 1.4 Frequency-specific input shape & values (per recurrence type)
| # | Frequency | Scenario |
|---|---|---|
| 17 | Monthly | `dueOnDay` = 0 → error |
| 18 | Monthly | `dueOnDay` = 32 → error |
| 19 | Monthly | `dueOnDay` = 1 and 31 → both accepted (boundaries) |
| 20 | Monthly | `dueOnDay` = 31 in a 30-day month → row clamps to last day of month |
| 21 | Monthly | `dueOnDay` = 31 in February (leap & non-leap year) → clamps correctly both years |
| 22 | Monthly | Anchor day (first rental due date) differs from `dueOnDay` → row 1 = anchor date verbatim, row 2 aligns to `dueOnDay` starting next month (no duplicate/skip) |
| 23 | Monthly | Anchor day matches `dueOnDay` → no duplicate row produced |
| 24 | BiMonthly | Two due-days equal (e.g. 15 & 15) → error ("must be distinct") |
| 25 | BiMonthly | Due-day out of 1-31 range → error |
| 26 | BiMonthly | Both days land in the same month → two rows, ascending order regardless of input order |
| 27 | BiMonthly | Days span a month boundary → chronological order preserved |
| 28 | BiMonthly | One day > days-in-month → clamps only that day |
| 29 | Weekly | Day of week selection required; start date not on that weekday → first row advances to the next occurrence of that weekday |
| 30 | Weekly | Start date already on target weekday → row 1 = start date itself |
| 31 | BiWeekly | Same as weekly but 14-day interval; confirm UI clearly differentiates Weekly vs BiWeekly (not just a checkbox easily mis-toggled) |
| 32 | Semesterly | Cycle requires exactly 2 month/day entries; UI blocks adding a 3rd or submitting with only 1 |
| 33 | Semesterly | Invalid calendar date in cycle (e.g. Feb 30) → error |
| 34 | Semesterly | Cycle dates before start date within the first year are skipped; only future-or-equal dates emitted for year 1, full cycle repeats every year after |
| 35 | Semesterly | Multi-year fixed-term span → cycle repeats correctly across each year boundary |
| 36 | Custom | Empty due-dates list → error |
| 37 | Custom | Dates not strictly increasing (duplicate or descending) → error |
| 38 | Custom | Valid ascending unique dates → rows returned exactly as entered, ignoring window/end-date clipping (confirm UI does NOT silently truncate custom dates at the lease end date, matching current BE behavior) |
| 39 | Custom | **Known BE/spec gap**: a custom date outside `[startDate, endDate]` — spec says reject, code doesn't enforce it. Write this as a documenting test that asserts *actual* current behavior (accepted) so a future BE fix is caught as an intentional test update, not a silent regression |
| 40 | Frequency dropdown shows a recurrence-shape mismatch (e.g. UI sends BiMonthly config while Frequency=Monthly is selected) → should not be reachable via UI at all; add a defensive API-level test only |

### 1.5 Row-count cap & generation window
| # | Scenario |
|---|---|
| 41 | Request that would generate ≥ 1000 rows (e.g. Weekly with a 30-year fixed term) → error, no schedule rendered |
| 42 | Request generating 999 rows → succeeds |
| 43 | Backdated lease: start date AND first-rental-due-date both in the past → generation recalibrates to start "today", anchor dropped (Monthly loses row-1-verbatim behavior) |
| 44 | Partially backdated: start date in the past, first-rental-due-date in the future/today → NO recalibration; anchor preserved (subtle branch, easy to regress) |
| 45 | `nextLeaseStartDate` clip is inclusive — the clip date itself never appears as a generated row |

### 1.6 Overrides (rent/date adjustments on individual rows)
| # | Scenario |
|---|---|
| 46 | Override with `scheduledDate` matching a real generated row + valid rent → row's rent/due-date updated, other rows unaffected |
| 47 | Override with `scheduledDate` NOT matching any generated date → error |
| 48 | Override with rent ≤ 0 → error |
| 49 | Change frequency/dates after applying overrides → matching overrides preserved, non-matching rows recomputed fresh (regression scenario `Preview_DateChangeWithOverrides_RecomputesFreshWhilePreservingMatchingOverrides`) |
| 50 | Renewal scenario: extend end date on an existing previewed schedule → extended rows appended, existing overridden rows preserved |

### 1.7 Response / error-status handling in UI
| # | Scenario |
|---|---|
| 51 | Invalid request → UI surfaces the specific field-level error message (not a generic failure banner) — verify wording matches for each validator rule class (required / range / cross-field) |
| 52 | Malformed request (bad JSON shape from a UI bug/fuzzing) → UI shows a generic error without leaking internal model-state shape |
| 53 | Successful preview → totals (sum of rent across rows) match sum of displayed row amounts exactly |

---

## 2. First Rental Due Date Options (`POST /rent-schedule/first-rental-due-date-options`) — ✅ UI exists (date-picker dropdown in rent-agreement-create)

| # | Scenario |
|---|---|
| 54 | Monthly fixed-term → dropdown offers start date then each month's due-on-day |
| 55 | BiMonthly fixed-term → dropdown offers start date then both due-days |
| 56 | Weekly/BiWeekly fixed-term → dropdown offers start date then weekly/bi-weekly steps |
| 57 | Semesterly fixed-term → dropdown offers start date then both cycle dates |
| 58 | Month-to-month → dropdown bounded exactly by invoice count |
| 59 | Month-to-month + next-lease-start-date → dropdown clipped before next lease |
| 60 | Term too short for any recurring date → dropdown offers start date only |
| 61 | Start date coincides with first recurring date → no duplicate entry in dropdown |
| 62 | Backdated lease (any frequency) → first candidate is today, not the original past start date |
| 63 | **Custom frequency selected → this API call must not fire / dropdown not shown** (per BE, Custom always rejected here) — this is the UI test already partially covered (`rent-agreement-create.spec.ts` "Custom frequency swaps due-date select for date pickers"); extend to assert no failed network call is attempted |
| 64 | Semesterly + Month-to-month combination selected → dropdown either hidden or shows the BE validation error, never silently empty |
| 65 | Cross-endpoint consistency: picking any candidate from this dropdown, then submitting the full preview, must succeed using that exact date as `firstRentalDueDate` (mirrors BE's own `Options_CandidateDate_IsAcceptedByPreviewAsFirstRentalDueDate` test) |

---

## 3. Rent Agreement Creation (`POST /rent-agreements`) — ✅ UI exists (`rent-agreement-create.component.ts`)

### 3.1 Core agreement fields
| # | Scenario |
|---|---|
| 66 | Full rent = 0 → schedule-rows section can be left empty, agreement still saves |
| 67 | Full rent < 0 → blocked client-side (input constraint) and/or server error surfaced |
| 68 | Full rent > 0 with no schedule rows → error |
| 69 | Any schedule row with rent ≤ 0 → error |
| 70 | End date ≤ start date → error (equal-dates boundary explicitly tested) |
| 71 | First rental due date < start date → error |
| 72 | Submitting a schedule whose rows are internally inconsistent with the chosen frequency (simulating a UI bug that doesn't refresh preview before save) → BE accepts as-is (no server recompute) — a good regression test proving the UI itself must be the safety net, since BE won't catch stale rows |
| 73 | Missing required field (e.g. no start date) → 400-class error, distinct from the 422 business-rule errors above (verify UI doesn't show the same generic message for both) |

### 3.2 Deposit fields
| # | Scenario |
|---|---|
| 74 | Deposit amount set + deposit due date set, `depositCollected` unchecked → saves normally |
| 75 | Deposit amount set but no deposit due date (or vice versa) → error ("both or neither") |
| 76 | `depositCollected` checked with deposit = 0 or unset → error |
| 77 | `depositCollected` checked with deposit > 0 and due date set → saves; verify NO deposit invoice/payment record is created as a side effect (explicitly out of scope per spec) |
| 78 | Omitting `depositCollected` entirely → defaults to false, saves normally (back-compat) |

### 3.3 Additional charges panel (`additional-charge-panel.component.ts`)
| # | Scenario |
|---|---|
| 79 | One-time charge: due date required; frequency/start-date fields hidden or disabled |
| 80 | Recurring charge: due date field hidden; frequency, start date required; exactly one of end-date/no-end-date checkbox enforced (can't set both, can't set neither) |
| 81 | Switching a charge between one-time ↔ recurring mid-form clears the fields not relevant to the new mode (no stale hidden values submitted) |
| 82 | Charge item: quantity ≤ 0 → error |
| 83 | Charge item: rate ≤ 0 → error |
| 84 | Charge item: amount auto-calculated as quantity × rate; manually editing amount to mismatch → error (no rounding tolerance — test an off-by-0.01 case) |
| — | **Scenarios 85-87 describe a control the panel no longer has (noted 2026-09-18).** The per-item Rent/Deposit category picker is gone: the category is server-derived from the items, and the deposit-only catalog is selected by the panel's `depositOnly` input rather than per row. Re-read them against `additional-charge-panel.component.html` before writing tests from them. |
| 85 | Charge with existing catalog item (`lineItemId` selected from a picker) → `newItemCategory` field hidden/ignored |
| 86 | Charge with brand-new item name → category required, must be Rent or Deposit |
| 87 | New item, category = Deposit, current user is a non-system/regular property owner → error ("deposit items must be system-defined") — verify UI either hides "Deposit" as an option for new items or surfaces the server error clearly |
| 88 | Charge with 2+ items where items resolve to different categories (one Rent, one Deposit) → error ("mixed category not allowed") |
| 89 | Recurring charge with category = Deposit → **succeeds** (regression: this was rejected pre-v16, now allowed — protects against a rule being accidentally re-added) |
| 90 | Deposit-category charge + "attach with rental invoice" toggle ON → error (v18 rule) |
| 91 | Deposit-category charge + "attach with rental invoice" toggle OFF → succeeds |
| 92 | Rent-category charge + "attach with rental invoice" toggle ON or OFF → both succeed (unaffected by the v18 rule — regression guard) |
| 93 | Charge referencing an unknown/deleted `lineItemId` (simulate stale picker cache) → error surfaced clearly, not a generic failure |
| 94 | Recurrence-shape validation per frequency for additional charges mirrors §1.4 above (Monthly due-on-day range, BiMonthly distinct days, Semesterly cycle shape, Custom strictly-increasing dates) — each should be tested at least once in the charge-panel context, not only the top-level schedule context, since they're separate validation code paths |
| 95 | Removing all items from a charge → error ("at least one item required") |
| 96 | `alreadyPaid` field negative → error |

### 3.4 Response / persisted-state assertions
| # | Scenario |
|---|---|
| 97 | After save, agreement status shown as "Draft" (never anything else at creation) |
| 98 | After save, schedule rows / charges / items each display server-generated IDs distinct from any client-side temp IDs used during form editing |
| 99 | After save, number of persisted rows/charges/items matches what was entered 1:1, same order |
| 100 | `LeaseTermType` displayed correctly derives from presence/absence of end date (Fixed vs Month-to-Month) without the user directly picking it as a separate persisted field beyond the form selection |

---

### 3.5 Who pays a fee — the split editor (`tenant-split-editor.component.ts`)

Added 2026-09-18, covering spec `02-add-additional-charge-ui.md` **requirements 17–23** and spec
`04-invoice-list-ui.md` v9. Filed under §3 because the editor is a child of §3.3's panel, but the
endpoint behind it is **`POST /rent/agreements/{id}/additional-charges`**, not `POST /rent-agreements`
— and on the lease create/edit screens this editor must not appear at all (scenario 125).

**Coverage note.** Every ✅ below already has a unit or component test — in
`tenant-split.util.spec.ts` (the arithmetic), `tenant-split-editor.component.spec.ts` (the control
surface) or `additional-charge-panel.component.spec.ts` (what reaches the wire). What none of them has
yet is a **Playwright** scenario, which is what this matrix tracks. They are listed as automatable
rather than automated.

| # | Scenario | Automatable now? |
|---|---|---|
| 108 | Fee left on **Shared Lease**: no `tenantShares` on the request at all (absent, not `[]`) and the screen says every active renter shares it | ✅ |
| 109 | **Split per Tenant** on a $300 three-renter fee fills `100.00 / 100.00 / 100.00`; the percentages are derived *from* the money, never the reverse (dividing `100/3 = 33.33%` and multiplying back would give `99.99 / 99.99 / 100.02`) | ✅ |
| 110 | Leftover cents go **one each to the renters at the top of the list**: `$100` across three is `33.34 / 33.33 / 33.33`, across six is four rows of `16.67` and two of `16.66` — never one row carrying all four cents. **Regression guard against the "last tenant absorbs rounding" rule** written off in §5, which is the inverse of what ships | ✅ |
| 111 | Unticking a renter re-divides the remaining rows; the unticked renter stays listed, reads as "Not charged this fee", and can be ticked back | ✅ |
| 112 | Typing an **amount** leaves that row's percentage derived and records the row as amount-authored | ✅ |
| 113 | Typing a **percentage**: `66.67%` of a `$300` fee is `200.01`, not `200.00`, and `sharePercent` is sent **only** on that row — asserted on the property being *absent* elsewhere, not null | ✅ |
| 114 | Switching a row between `$` and `%` carries its figure across, so what the renter owes does not move because the owner changed how they say it | ✅ |
| 115 | A typed row is **not** re-divided when another renter is ticked — only untouched rows absorb the change | ✅ |
| 116 | Non-numeric (`12,50`, `one hundred`) or negative text in **either** box → row-level message, the text kept on screen verbatim, save blocked. An **empty** box is `0` with no message (clearing to retype is ordinary) | ✅ |
| 117 | Over-typing one row (`$400` on a `$300` fee) floors the untouched rows at `$0.00` rather than showing a negative share, and refuses with *"The shares total $400.00, the fee is $300.00 — $100.00 over."* | ✅ |
| 118 | Shares totalling `$290` of a `$300` fee → save refused naming **both** figures and the gap; **every typed row is kept** and nothing is silently corrected (the assertion that fails if the screen "helpfully" fixes the owner's numbers) | ✅ |
| 119 | **Reset to an even split** — per row and for the whole split — discards typed rows only on an explicit click, never automatically on a mismatch | ✅ |
| 120 | **Paid** box: the charge's `alreadyPaid` divides by the same rule as the amounts, and each share carries its own `alreadyPaid` on the request — **always, even as `0`**, so the server is left no division of its own to make | ✅ |
| 121 | The **Amount** and **Paid** columns are independent: typing what one renter owes does not disturb what another has paid, and the reverse | ✅ |
| 122 | **Owes** is derived from the two boxes and is never an input; a renter who has paid more than they owe shows a **negative** Owes rather than being refused (the charge itself allows `alreadyPaid` to exceed its own total) | ✅ |
| 123 | The paid column failing to add up is refused **naming that column** (*"The paid amounts total $20.00, already paid is $100.00 — $80.00 short."*), and the **fee is named first** when both columns are wrong | ✅ |
| 124 | The paid box has **no unit selector** — there is no `alreadyPaidPercent` on the wire, so `$`/`%` belongs to the amount box alone | ✅ |
| 125 | **Requirement 22 guard.** The lease create/edit screens host the same fee panel and pass **no roster**, so they render no renter control at all — no split editor, no "Split per Tenant". A change that renders it unconditionally must fail here | ✅ |
| 126 | The **Invoices** page offers the same editor (spec `04` v9), loading the roster alongside the lease so the fee step renders once rather than in two stages; an unknown lease still fails on the first step and the roster read is dropped with it | ✅ |
| 127 | `204` from `GET …/{id}/tenants` (lease exists, step 2 never saved) → **empty** roster, "Split per Tenant" disabled, fee stays charged to the lease and shared by whoever is added later | ✅ |
| 128 | Round-trip: a saved fee names who it landed on from the response's `tenantShares`, and the charge response model declares **no** `tenantIds` (requirement 21 — a type-level assertion, since a label test passes while the field is merely unread) | ✅ |
| 129 | **Requirement 22, the pass-through half.** A terms save on the lease editor carries a charge's saved split forward untouched — load a lease whose fee is split `200 / 50 / 50`, change something unrelated, assert all three shares are resubmitted. The server refuses a dropped split with `422`, so the failure is a visible one on a screen the owner was not editing the fee from. **Unit-covered since 2026-09-18** (`rent-agreement.models.spec.ts`), after being recorded here as a gap; still no Playwright scenario | ✅ |

---

## 4. LineItem Catalog / Lookup — 🔌 API-only today (no dedicated catalog management UI; only consumed indirectly via the additional-charge item picker)

| # | Scenario | Automatable now? |
|---|---|---|
| 101 | Item picker (typeahead/dropdown) lists both system-defined items and the current owner's own items | ✅ if picker exists in `additional-charge-panel` — verify |
| 102 | Item picker for a brand-new/unknown property owner still shows system-defined items (never empty) | ✅ |
| 103 | Selecting an existing item auto-fills its category (read-only) in the form | ✅ |
| 104 | Picker pagination — confirm UI requests page size within [1,100] and handles >20 items (default page size) gracefully | ✅ if picker paginates |
| 105 | Fetching a single item by id that was deleted/unknown between page load and submit → graceful error, not a crash | ✅ (simulate via API mock) |
| 106 | `GET /line-items` with missing/empty `propertyOwnerId` → 400 (API-level only test today; no direct UI path since owner id is contextual, not user-entered) | 🔌 |
| 107 | Page/pageSize boundary values (0, negative, 101) — only relevant to test directly against the API since UI likely never sends these itself | 🔌 |

---

## 5. Out of Scope for Now — 🚫 Documented BE intent, not yet implemented (do not build tests against current API)

These exist only in domain models or legacy/superseded spec docs; no working endpoint exists to exercise them end-to-end. Track as backlog so they aren't silently forgotten once the BE ships them:

- Invoice auto-generation job (schedule row → Invoice) — `ScheduleStatus` transitions (Planned → Invoiced/Skipped/Cancelled) have no triggering code yet.
- Agreement activation flow (`AgreementActivation`, `RentalStatus` Active/InProcess/Terminate transitions) — no API endpoint.
- Payment application / removal (`Invoice.ApplyPayment` / `RemovePayment`, status recalculation, Void freeze behavior) — domain-only.
- ~~Group-invoice rounding ("last tenant absorbs rounding")~~ — **no longer out of scope, and the rule is the opposite one (2026-09-18).** Rounding across renters ships in the split editor, and it spreads leftover cents **one each to the renters at the top of the list**, explicitly never stacking them on a single row: `$100` across six is four rows of `16.67` and two of `16.66`. Leaving this listed as unimplemented, next to a rule the code inverts, is how a correct implementation gets "fixed" back to the wrong one. See §3.5 scenario 110.
- ~~Late-fee double-charge guard~~ — **no longer out of scope (2026-10-12).** Billing spec `17-late-fee-consumer.md` v13 ships late fees: each line is keyed, and a list calculated earlier than the one applied is skipped (`older_calculation`), so a repeated event charges nothing twice. See §7.
- Credit/reversal line items, legacy invoice statuses (`sent_and_recd`, etc.) — described only in a superseded legacy doc; current domain model has no equivalent statuses/fields.
- Direct `POST /line-items` catalog creation and `(propertyOwnerId, name)` uniqueness enforcement — no create endpoint exists; only indirectly created via the additional-charge item-provisioning path.

---

## 6. Suggested Structural Improvements to the Test Suite (not scenario coverage, but worth doing alongside)

- Introduce a Page Object layer (`e2e/pages/RentAgreementCreatePage.ts`, `RentSchedulePreviewPage.ts`) — current tests use inline locators, which will not scale to ~100 scenarios above.
- Introduce fixtures for common valid payloads (base monthly-fixed-term request, base recurring-charge request) that individual tests mutate one field at a time — mirrors how the BE's own test suite is structured (one-rule-per-test naming convention `Scenario_Condition_ExpectedOutcome`), which this matrix has followed for easy 1:1 traceability.
- Track BE test names next to each UI scenario (already embedded above via file:line/test-name citations) so future BE rule changes can be grepped against this matrix.

---

## 7. Late fee — the invoice list's late fee panel and Update Invoice — ✅ UI exists (`late-fee-panel.component.ts`, `update-proposed-invoice.component.ts`)

Added 2026-10-12, covering spec `07-late-fee-ui.md` v1 (on Billing spec `17-late-fee-consumer.md` v13). The
routes are `GET`, `PUT` and `DELETE /api/v1/invoices/{id}/late-fee`, the `lateFeeAmount` on each
`GET /api/v1/invoices` item, and the `lateFee` block on `GET /api/v1/invoices/{id}`.

**Coverage note.** As in §3.5, every ✅ below already has a component test, named in the last column; none
has a **Playwright** scenario yet. Scenario 144 needs a running Billing API with an invoice that carries a
late fee, so it cannot stub the routes the way `additional-charge-panel.spec.ts` does.

### 7.1 See a late fee (spec Flow 1)

| # | Scenario | Automatable now? | Component test |
|---|---|---|---|
| 130 | The list shows each row's late fee in a **Late fee** column, and `—` when there is none | ✅ | `invoice-list.component.spec.ts` (FR 1) |
| 131 | A row from an API older than the late fee work (no `lateFeeAmount`, no `lateFee`) renders as before, with no late fee | ✅ | `invoice-list.component.spec.ts` (FR 17) |
| 132 | **Late fee…** is in every row's menu, a voided and a deleted row included, and opens the panel for that row | ✅ | `invoice-list.component.spec.ts` (FR 2, FR 3) |
| 133 | The panel shows the type, the due date, every figure, each line, and the two marks only once set; an invoice with no late fee reads as zeros and no lines, not as an error | ✅ | `late-fee-panel.component.spec.ts` (FR 3, FR 4) |

### 7.2 Remove a late fee (spec Flow 2)

| # | Scenario | Automatable now? | Component test |
|---|---|---|---|
| 134 | **Remove late fee** and **Apply a late fee list** are offered on an open invoice and absent on a voided or a deleted one | ✅ | `late-fee-panel.component.spec.ts` (FR 5) |
| 135 | The confirmation names the unpaid part it removes and the paid part it keeps; **Keep** sends nothing | ✅ | `late-fee-panel.component.spec.ts` (FR 6) |
| 136 | On `204` the list refreshes and the panel re-reads, a second apart, until only the paid part is left; with nothing unpaid it reads once and does not wait | ✅ | `late-fee-panel.component.spec.ts` (FR 7, FR 12) |
| 137 | Ten re-reads that never catch up stop and offer **Refresh**; closing the panel stops the re-reads | ✅ | `late-fee-panel.component.spec.ts` (FR 12) |
| 138 | A refusal (`404` on reading; `409` and two `422`s on removal) shows as `{status} — {detail}`, verbatim, and leaves the figures as they were | ✅ | `late-fee-panel.component.spec.ts` (FR 13) |

### 7.3 Apply a late fee list (spec Flow 3)

| # | Scenario | Automatable now? | Component test |
|---|---|---|---|
| 139 | The calculation time starts as now, in ISO 8601 UTC, and can be edited; a text that is not a date and time is refused | ✅ | `late-fee-panel.component.spec.ts` (FR 9) |
| 140 | Each amount is quantity × rate, shown and sent, with no field to type it | ✅ | `late-fee-panel.component.spec.ts` (FR 8) |
| 141 | Every rule the backend refuses is refused before anything is sent: a blank or 101-character key, a blank or 201-character description, a quantity that is not a whole number from 1 to 9,999,999,999, a rate of 0, with 3 decimals or over 999,999,999,999.99, an amount over that, and one key twice (spaces ignored) | ✅ | `late-fee-panel.component.spec.ts` (FR 10) |
| 142 | The answer reads **Applied: lines changed** (the list refreshes and the panel re-reads until the list's total), **Applied: no line changed** (no wait), or **Skipped:** with each of the nine reasons in words; an empty list is sent as `lines: []` | ✅ | `late-fee-panel.component.spec.ts` (FR 11, FR 12) |
| 143 | A `400` refusal shows its `detail` verbatim | ✅ | `late-fee-panel.component.spec.ts` (FR 13) |
| 144 | **End to end, against a running Billing API:** apply a list, see it reach the panel; on a part-paid invoice remove it and see the paid part stay | ✅ needs a seeded invoice | none — the manual check of plan `2026-10-12T1500-07-late-fee-ui` |

### 7.4 A late fee line on Update Invoice (spec Flow 4)

| # | Scenario | Automatable now? | Component test |
|---|---|---|---|
| 145 | A `LateFeeCharge` line reads **Late Fee**, whatever catalog id it carries: the system row the catalog never returns, none, or one the catalog names otherwise | ✅ | `update-proposed-invoice.component.spec.ts` (FR 14) |
| 146 | The late fee notice shows on an invoice that carries a late fee line, stays after that line is removed in the form, and is absent otherwise | ✅ | `update-proposed-invoice.component.spec.ts` (FR 15) |
| 147 | A save after editing another line sends the late fee line with its `lineId`, `lineItemId` and item type unchanged | ✅ | `update-proposed-invoice.component.spec.ts` (FR 16) |

---

## 8. Record Payment — the invoice list's Record Payment panel — ✅ UI exists (`record-payment-panel.component.ts`)

Added 2026-10-13, covering spec `11-record-payment-ui.md` v1 and spec `04-invoice-list-ui.md` v11 FR 28 (on
Billing spec `18-record-payment.md` v2). The routes are `GET /api/v1/invoices/{id}/offline-payment`,
`POST /api/v1/invoices/{id}/offline-payments/preview` and `POST /api/v1/invoices/{id}/offline-payments`.

**Coverage note.** Every ✅ below has a component test, named in the last column. Scenarios marked
**PW** also have a Playwright scenario in `e2e/ui/record-payment.spec.ts`, which **stubs Billing** with
`page.route` (as `additional-charge-panel.spec.ts` stubs the catalog), so it runs against `ng serve` alone.
Scenario 167 needs a running Billing API and Finance with a seeded `INV-` invoice.

### 8.1 Open the panel (spec Flow 1)

| # | Scenario | Automatable now? | Component test |
|---|---|---|---|
| 148 | **Record Payment…** is in the row menu only on rows with a balance above zero that are neither voided nor deleted | ✅ | `invoice-list.component.spec.ts` (FR 28) |
| 149 | The panel reads its context and the invoice, and shows **INVOICE SUMMARY** — ID, SUBJECT (first line's description), DUE, PAID, BALANCE | ✅ PW | `record-payment-panel.component.spec.ts` (FR 1, FR 2) |
| 150 | A failed invoice read leaves the subject as `—` and nothing else changes | ✅ | `record-payment-panel.component.spec.ts` (FR 2) |
| 151 | A refused context (`404`, `422 not_payable` / `nothing_to_pay`, `502`) shows its sentence and code, and no form | ✅ | `record-payment-panel.component.spec.ts` (FR 1, FR 16) |

### 8.2 Enter payment lines (spec Flow 2)

| # | Scenario | Automatable now? | Component test |
|---|---|---|---|
| 152 | Tenant first; Payment Method once a tenant is chosen; Submission Date and Amount Paid once a method is | ✅ PW | `record-payment-panel.component.spec.ts` (FR 3 – FR 6) |
| 153 | A tenant fills its own suggested amount; the date defaults to today; an invoice with one tenant starts with that tenant | ✅ | `record-payment-panel.component.spec.ts` (FR 3, FR 6) |
| 154 | Check shows **Check Number**, Money Order **Money Order Number**, Cash neither; switching to Cash clears the number; the number takes at most 24 characters | ✅ PW | `record-payment-panel.component.spec.ts` (FR 5) |
| 155 | **+ Add Additional Payment** is enabled only once the last line has a method and an amount | ✅ | `record-payment-panel.component.spec.ts` (FR 7) |
| 156 | A new line's Tenant is line 1's and disabled, its date is line 1's, its method and amount are empty; **Remove** is on every line but the first | ✅ PW | `record-payment-panel.component.spec.ts` (FR 7, FR 8) |
| 157 | Changing line 1's tenant goes back to one line, with the new tenant's amount | ✅ | `record-payment-panel.component.spec.ts` (FR 3) |
| 158 | From the first Submit: *Required*, *Should be greater than $0.00*, *Only number allowed with 2 decimal places.*, a future date and a 25-character number are refused, and nothing is sent | ✅ | `record-payment-panel.component.spec.ts` (FR 9) |

### 8.3 The preview (spec Flow 2)

| # | Scenario | Automatable now? | Component test |
|---|---|---|---|
| 159 | The preview is posted 350 ms after the last change, once for a burst, with the last values; a stale answer is dropped | ✅ | `record-payment-panel.component.spec.ts` (FR 10) |
| 160 | An excess shows the blue box with the excess amount and the **other** invoices it goes to — ID, DUE ON, AMOUNT, PAID, BALANCE | ✅ PW | `record-payment-panel.component.spec.ts` (FR 10) |
| 161 | `exceedsPayable` shows the server's *"There are no other unpaid or future invoices…"* and disables Submit and Add Additional Payment until a lower total | ✅ PW | `record-payment-panel.component.spec.ts` (FR 11) |
| 162 | Submit waits for a pending preview; an incomplete line clears the preview with nothing sent; a failed preview is shown without blocking Submit | ✅ | `record-payment-panel.component.spec.ts` (FR 10, FR 12) |

### 8.4 Submit (spec Flow 3)

| # | Scenario | Automatable now? | Component test |
|---|---|---|---|
| 163 | Submit shows the owner app's review question; **No** sends nothing | ✅ | `record-payment-panel.component.spec.ts` (FR 13) |
| 164 | **Yes** posts every line in order with the panel's `submissionId`; `202` closes the panel, the list says *"Payment submitted on …"* and re-reads | ✅ PW | `record-payment-panel.component.spec.ts` (FR 14, FR 15), `invoice-list.component.spec.ts` (FR 28) |
| 165 | `502 submission_unconfirmed` is a warning that the payment may have been queued; a retry carries the **same** `submissionId` | ✅ PW | `record-payment-panel.component.spec.ts` (FR 17) |
| 166 | Every other refusal shows a readable sentence (or the server's `detail` for `validation_failed`, `exceeds_payable`, `rejected_by_payment_service`) with its code, and keeps what was typed | ✅ | `record-payment.service.spec.ts`, `record-payment-panel.component.spec.ts` (FR 16) |
| 167 | **End to end, against a running Billing and Finance:** record $400 cash on a two-tenant `INV-` invoice with later invoices, see the excess preview, submit, and see the payments reach the invoices | ✅ needs a seeded invoice | none — the manual check of plan `2026-10-13T1800-11-record-payment-ui` |

## 9. Overdue — the invoice list's Overdue filter and badge — ✅ UI exists (`invoice-list.component.ts`)

Added 2026-10-14, covering spec `04-invoice-list-ui.md` v12 FR 7, FR 29 and FR 30 (on Billing spec
`02-invoicing.md` v45, FR 52–53). Overdue is a flag the backend works out at read time, not a status.

| # | Scenario | Automatable now? | Component test |
|---|---|---|---|
| 168 | The status chips do not include *Overdue* | ✅ | `invoice-list.component.spec.ts` (v12, FR 7) |
| 169 | The Overdue filter sends nothing for *Any*, `isOverdue=true` for *Overdue*, `isOverdue=false` for *Not overdue*, and restarts at page 1 | ✅ | `invoice-list.component.spec.ts`, `invoices.service.spec.ts` (v12, FR 29) |
| 170 | A row with `isOverdue: true` shows the *Overdue* badge beside its status; any other row shows none | ✅ | `invoice-list.component.spec.ts` (v12, FR 30) |
| 171 | **End to end, against a running Billing:** an unpaid invoice due before today at its property reads *Overdue*; `?status=overdue` answers `400` | ✅ needs a seeded invoice | none — Billing's `InvoiceReadEndpointTests` and Postman `Invoices / Negative / 10a` cover the API |
