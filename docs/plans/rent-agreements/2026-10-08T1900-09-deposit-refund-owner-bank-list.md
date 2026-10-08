**Spec:** [`docs/specs/rent-agreements/09-deposit-refund-ui.md`](../../specs/rent-agreements/09-deposit-refund-ui.md) — v2

# Deposit Refund — pick the owner's bank account from merlin's list

## Setup & Environment

- Angular, `rent-schedule-ui`, branch `Piyush/deposit-refund-billing-invoices`. Baseline: 601 specs green.
- No packages added. merlin's `Home/DropDown/GetPropertyOwnerBankDetails` already exists and already
  backs the owner app's bank picker; **nothing in merlin is changed.**
- Commands: `npx ng build --configuration development` · `npx ng test --watch=false --browsers=ChromeHeadless`.

### Prerequisites & Open Questions

- merlin and Billing share the gateway host: Billing under `/billing`, merlin under `/api`. Confirmed
  from the Billing backend's own merlin clients (`MerlinServiceOptions.PathPrefix = "api"`) and from
  the QA URLs in the requirement doc.
- The dev-server proxies now forward `/api` as well as `/billing`. A deployed build is same-origin, so
  this only affects `ng serve`.
- **The bearer is required.** Without a pasted token merlin answers 401 and the list is empty, so an
  online return cannot be started on a local run. That is deliberate — see M2.

## Milestone-Based Implementation

### M1 — Reach merlin (FR 10a)

- [x] `environment.monolithBaseUrl` in all four builds; `/api` everywhere, since merlin shares the
      gateway prefix in each.
- [x] `proxy.conf.dev.json` / `proxy.conf.qa.json` forward `/api` to the same host as `/billing`.
- [x] `scopeHeadersInterceptor` sends the bearer, **and only the bearer**, to a merlin URL.

### M2 — Read the list (FR 10a)

- [x] `owner-bank.models.ts` — `OwnerBankDetail`, merlin's `BankDetailDto` field for field.
- [x] `owner-bank.service.ts` — one GET, and a failure answers `[]` rather than an error.

### M3 — Pick, do not type (FR 10)

- [x] The panel reads the list on open, preselects a single account, and binds a dropdown labelled
      *bank name — masked account number*.
- [x] The six typed controls are gone; `ownerBank` is built from the chosen account.
- [x] Validation: an account was chosen, and it is still one of the accounts on offer.

### M4 — Tests

- [x] `owner-bank.service.spec.ts`; interceptor specs for the merlin branch with and without a token;
      panel specs for the dropdown, the preselect, the empty list, a failed read and picking the
      second account; the parent spec answers the panel's new read.

## Scope & Context Rules

- May modify: the four `environment.*.ts`, both proxy configs, `scope-headers.interceptor.ts`, the
  deposit-refund panel and its template, and the specs above.
- **Must not modify:** merlin, in any way. Billing's API contract — `ownerBank` is unchanged, it is
  only filled from a different place.
- No new packages.

### Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Where the list comes from | merlin direct, through the gateway | A new Billing endpoint proxying merlin | Billing does not own bank accounts and storing or forwarding them would put encrypted credentials through a service that has no reason to see them |
| 2 | Headers to merlin | The bearer only | Bearer + the three scope ids | The ids are Billing's stand-in for sign-in; merlin reads the caller from the bearer's session and would ignore or mis-read them |
| 3 | A failed read | Empty list, panel says so | Surface an error banner | The offline tab does not need merlin; breaking the whole screen because a list could not load would be worse than losing one tab |
| 4 | What the dropdown shows | Bank name + masked number | Account holder, or the raw number | Two accounts at the same bank are told apart by the masked number, which is the only account number meant to be seen |
| 5 | Encrypted values | Held in the fetched object, never in a form control | Hidden form controls | A value in a control is a value that can be edited, logged by form tooling, or restored from a draft |

## Verification

- `ng build` clean, `ng test` green after each milestone. **Do not continue if verification fails.**
- End: full suite; confirm no encrypted value appears in the rendered panel.

## Git & Rollback

Commits only after the user confirms (standing rule), on `Piyush/deposit-refund-billing-invoices` —
the same branch, no new one.

## Final Validation

- [x] Spec v2's changelog row links this plan; this plan's first line links the spec.
- [x] `ng build --configuration development` succeeds.
- [x] `ng test` — 610 specs green, up from 601.
- [x] merlin untouched; no new package.
