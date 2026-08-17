**Spec:** [`docs/specs/rent-agreements/01-rent-agreement-edit-ui.md`](../../specs/rent-agreements/01-rent-agreement-edit-ui.md) — v11

# Show the deposit read-only on the edit page

User report: *"deposit amount and uske flag check kro add/edit me uske value kyo nhi add ur update ho rage"*,
then, after the diagnosis was presented with options: *"read only mode me dikhawo deposit"* (option A).

## What the investigation actually found

Both a code trace and a live browser test were run before choosing anything:

| Path | Result |
|---|---|
| **Create** | Works end-to-end. `CREATE_REQ {deposit:500, depositDueDate:"2026-08-05", depositCollected:true}` → `201` → `GET {deposit:500, depositDueDate:"2026-08-05", depositCollected:true}`. Backend parses (`CreateRentAgreementCommandJsonConverter:49-51`), builds `DepositTerms`, flattens onto the aggregate (`RentAgreement.cs:53-55`), persists to `deposit`/`deposit_due_date`/`deposit_collected`, and projects back on read. |
| **Edit** | Cannot change them, by design. `PUT_REQ has deposit key?: false` — `saveEdit()` omits them, because backend decision **D3/FR-025** makes every `deposit*` field immutable after creation and `PUT …/terms` returns `422 rent_agreement.immutable_term_field` if any is present, failing the *entire* edit. |

So there was no data bug — the bug was **UX honesty**: the edit page rendered deposit as ordinary editable
inputs, so a user could change 500 → 900, press Save, see success, and lose the change with no feedback.

Option B (make deposit editable) was offered and not chosen; it would require reversing D3/FR-025 in the
backend contract.

## Checklist

- [x] **Create path verified working before assuming a bug** — the report said "add/edit", so create was
      tested too rather than trusted; it persists and reads back correctly.
- [x] **Identified the two client-side rules that could block a create save**, which is the likely cause if
      a user sees "deposit not added": the pairing rule and the collected-requires-positive rule both
      `return` early with a `saveError` before any request fires. Backend has matching 422s
      (`rent_agreement.invalid_deposit_pairing`, `…deposit_collected_requires_positive_deposit`).
- [x] **The disabled-control trap was caught before shipping**: Angular omits disabled controls from
      `form.value`, so with deposit disabled the pairing rule evaluates
      `(undefined === null || undefined === '') !== !undefined` → `false !== true` → **true**, setting a
      bogus "Deposit and deposit due date must both be provided" error and blocking *every* edit save.
      Guarded with `if (!this.isEditMode)`.
- [x] **`hasStoredDeposit` reads `loadedAgreement()`, not the form** — for the same reason: the form cannot
      report a disabled control's value.
- [x] **"+ Add Deposit Fee" left enabled** — additional charges *are* editable on `PUT …/terms` (E1/E2), so
      disabling it would remove real functionality.

Open questions: **none.**

## Technical Approach

Disable on construction, when the route carries an `:id`:

```ts
if (routeAgreementId) {
  this.agreementId.set(routeAgreementId);
  for (const name of ['deposit', 'depositDueDate', 'depositCollected']) {
    this.form.get(name)!.disable({ emitEvent: false });
  }
  this.loadAgreement(routeAgreementId);
  return;
}
```

`emitEvent: false` keeps it out of the debounced `valueChanges` → auto-preview pipeline during
construction. Disabling here (rather than in `loadAgreement`'s success handler) means the fields are
never briefly editable, and it holds even if the load fails.

Guard the create-only rules in `save()`:

```ts
if (!this.isEditMode) {
  if ((value.deposit === null || value.deposit === '') !== !value.depositDueDate) { … return; }
  if (value.depositCollected && !(Number(value.deposit) > 0 && value.depositDueDate)) { … return; }
}
```

Template — note plus a null-case substitution:

```html
@if (isEditMode) {
  <p class="deposit-readonly-note">The deposit is set when the lease is created and cannot be changed
  here. You can still add a deposit fee below.</p>
}

@if (isEditMode && !hasStoredDeposit) {
  <p class="deposit-empty-note">No deposit was set when this lease was created.</p>
} @else {
  <!-- the three existing controls, unchanged -->
}
```

SCSS adds `input:disabled` (grey background, `not-allowed` cursor) because Deposit Amount is a bare
`<input>` — Material styles its own fields — plus the two note styles.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Read-only vs. editable | Disable + explain (option A) | Make deposit editable on `PUT …/terms` (option B) | User chose A; B reverses backend D3/FR-025, touching the command, its JSON converter's `ImmutableFieldNames`, `ApplyTerms`, and edit-path validation |
| 2 | Disable vs. hide | Disable, values still visible | Hide the panel in edit mode | The saved deposit is useful information; hiding it would answer "what is the deposit?" with nothing |
| 3 | Where to disable | Constructor, when `:id` is present | In `loadAgreement()`'s `next` handler | Avoids a window where the fields are editable, and still applies if the load errors |
| 4 | Null deposit | Replace the trio with a sentence | Leave three empty disabled boxes | Empty disabled inputs read as a loading failure rather than as "no deposit" |
| 5 | "+ Add Deposit Fee" button | Left enabled | Disable it with the rest of the panel | Deposit *fees* are additional charges, which the edit contract does allow changing |

## Data Model & Schema Changes

None — presentation and client-side validation scope only.

## Task Checklist

- [x] Disable `deposit`/`depositDueDate`/`depositCollected` in the constructor for edit mode.
- [x] Guard the two create-only deposit rules in `save()` with `!this.isEditMode`.
- [x] Add the `hasStoredDeposit` getter (reads `loadedAgreement()`).
- [x] Template: read-only note; null-deposit substitution branch.
- [x] SCSS: `input:disabled`, `.deposit-readonly-note`, `.deposit-empty-note`.
- [x] Add `shows the deposit read-only in edit mode, and still saves (spec v11)` to
      `rent-agreement-edit.component.spec.ts`, including the regression guard that the edit still saves.
- [x] `npx ng build` clean; `npx ng test` 87/87 pass.
- [x] Live-verified both cases via Playwright (see Test Plan).

## Test Plan

- `shows the deposit read-only in edit mode, and still saves (spec v11)`: asserts all three controls are
  `disabled`, that `getRawValue().deposit` still reads 500 (value retained despite being disabled), that
  `save()` sets **no** `saveError` (the disabled-control trap), and that the PUT body has no `deposit` key.
- **Live Playwright, lease WITH deposit**: `GET {deposit:500, …}`; edit UI shows `amountShown "500"`,
  `amountDisabled true`, `dueShown "8/5/2026"`, `dueDisabled true`, note present, empty-note absent;
  `PUT 200` with no deposit key. Screenshot confirmed the greyed fields and note render correctly.
- **Live Playwright, lease WITHOUT deposit**: `GET {deposit:null, …}`; edit UI shows the fields absent and
  `emptyNote "No deposit was set when this lease was created."`; `PUT 200`.
- Full suite: `npx ng test --watch=false --browsers=ChromeHeadless` → 87/87.
