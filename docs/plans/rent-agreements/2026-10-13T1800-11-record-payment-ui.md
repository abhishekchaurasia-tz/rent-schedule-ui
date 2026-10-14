**Spec:** [`docs/specs/rent-agreements/11-record-payment-ui.md`](../../specs/rent-agreements/11-record-payment-ui.md) — v1 · [`docs/specs/rent-agreements/04-invoice-list-ui.md`](../../specs/rent-agreements/04-invoice-list-ui.md) — v11

# Record Payment — the side panel on a Billing invoice

```
/invoices row ──⋮ Record Payment…──► RecordPaymentPanel ──GET …/offline-payment──► summary, tenants, methods
                                          │ (+ GET …/invoices/{id} for the subject only)
                                          │ lines change ──350 ms──► POST …/offline-payments/preview ──► excess box / exceeds message
                                          │ Submit ─► confirm ─► POST …/offline-payments {submissionId, …} ──202──► list re-reads
```

## Setup & Environment

- Angular 19, `rent-schedule-ui`, branch `Piyush/record-payment-ui` (cut from `origin/main`). Baseline:
  **762** specs green.
- No packages added. Backend: Billing `Piyush/record-payment-in-billing` (spec `18-record-payment.md` v2).
- Commands: `npx ng build` · `npm run build:qa` · `npx ng test --watch=false --browsers=ChromeHeadless`.
- Billing calls use `environment.apiBaseUrl` and `scopeHeadersInterceptor` unchanged — the proxy entry
  for `/billing` (dev, qa) and the empty local base already reach `/api/v1/invoices/...`.

### Prerequisites & Open Questions

- The layout follows the owner app screenshots the user attached on 2026-10-13 (QA invoice 9559389:
  empty panel, two lines, overpayment preview).
- **Entry point** (decided here, see Technical Decision 1): the Invoices list's row menu. This harness has
  no invoice-detail page, which is where the owner app puts its button.
- None open.

## Milestone-Based Implementation

### M1 — Models and service (spec FR 1, 10, 14, 16, 17)

- [x] `src/app/invoices/record-payment.models.ts` — the wire shapes of Billing's three routes.
- [x] `src/app/invoices/record-payment.service.ts` — `getContext`, `preview`, `submit`, and
      `describeRecordPaymentProblem` (code → sentence, FR 16, 17); `record-payment.service.spec.ts` first.

### M2 — The Record Payment panel (spec FR 1–18)

- [x] `src/app/invoices/record-payment-panel.component.{ts,html,scss}` — summary, lines, tenant lock and
      reset, method-specific number, field checks, debounced preview with the excess box and the exceeds
      message, confirmation, one `submissionId` per opening, refusals.
- [x] `record-payment-panel.component.spec.ts` first.

### M3 — The entry point (spec 04 FR 28; spec 11 FR 15)

- [x] `invoice-list.component.{ts,html}` — *Record Payment…* in the row menu on rows with a balance,
      not voided or deleted; the panel; the success banner and re-read on `recorded`.
- [x] `invoice-list.component.spec.ts` — the menu gate, opening, and the accepted path.

### M4 — Docs

- [x] Spec 11 v1, spec 04 v11 (changelog row, FR 28), this plan.
- [x] `docs/ui-automation-test-matrix.md` §8 — Record Payment scenarios, each naming its component test.
- [x] `e2e/ui/record-payment.spec.ts` — four Playwright scenarios (149, 154, 156, 160, 161, 164, 165) with
      Billing stubbed by `page.route`, so they run against `ng serve` alone.

## Scope & Context Rules

- **May modify:** the files above.
- **Must not modify:** the late fee, deposit refund and apply deposit screens; the interceptor; the
  environments or proxy files (nothing in them needs to change).
- The panel reads its own context, as the late fee panel does; the list passes only the invoice id and
  its number.

### Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Entry point | Invoices list row menu, *Record Payment…*, rows with `balance` > 0 not voided/deleted | A new invoice-detail page; the Deposit Refund page | The list is where every per-invoice action of this harness lives (Correct, Late fee…, Deposit Refund); the owner app gates on `BalanceAmount > 0` |
| 2 | Who calls the API | The panel, like `LateFeePanelComponent` | The host posts what the panel emits, like Apply Deposit | The preview is a conversation between the panel and the server; routing it through the list would put form state in the list |
| 3 | Idempotency | `submissionId` from `crypto.randomUUID()` in the constructor, so once per opening | One per press | A press after a lost answer must be the same submission (backend D9, BR-39) |
| 4 | Preview trigger | Form `valueChanges` → 350 ms debounce → distinct request → `switchMap` | Blur only, as the owner app | Backend Flow 2 previews on each change; `switchMap` drops a stale answer |
| 5 | When to preview | Only when every line passes the field checks | Always | The server would answer `400` for an incomplete line, which is noise, not information |
| 6 | Subject | First line's description from `GET /invoices/{id}`, non-blocking, *—* on failure | Leave the column out; compose from type and date | The owner app shows the first line's description; Billing's context does not carry it |
| 7 | Add Additional Payment when the last line is incomplete | Disabled | Enabled, click does nothing (owner app) | Same effect, and a disabled control says why nothing happened |
| 8 | `submission_unconfirmed` | Warning in the open panel, same `submissionId` | Close the panel, as Deposit Refund does | Billing's submit is idempotent on `submissionId` (BR-39), so keeping the panel keeps a retry safe |

## Verification

**Do not continue to the next milestone if any check fails.**

- `npx ng build` and `npm run build:qa` clean (no new budget warning).
- `npx ng test --watch=false --browsers=ChromeHeadless` green: baseline 762 + the new specs.
- `PW_HEADLESS=1 npx playwright test e2e/ui/record-payment.spec.ts --project=ui` green.
- Against a running Billing API (manual, matrix scenario 167): record a payment on a seeded `INV-` invoice
  and see it in Finance.

## Git & Rollback

- Work on `Piyush/record-payment-ui`, uncommitted until the user confirms (the global rule).
- Rollback: the change is additive — a new menu item, a new panel and service; reverting the commit
  removes them and nothing else changes.

## Final Validation

- [x] Spec ↔ plan links resolve both ways (spec 11 v1 and spec 04 v11 link this plan; this plan links both).
- [x] Build and tests green.
- [x] The other row-menu items behave as before.
