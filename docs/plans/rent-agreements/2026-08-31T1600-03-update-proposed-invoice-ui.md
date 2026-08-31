**Spec:** [`docs/specs/rent-agreements/03-update-proposed-invoice-ui.md`](../../specs/rent-agreements/03-update-proposed-invoice-ui.md) — v1

## Checklist

- [x] Backend `02-invoicing.md` **v36** is shipped in this workspace: `InvoiceDetailResponse` now
      returns `proposedInvoiceId`. Without it this page cannot address the PATCH at all.
- [x] `PATCH /rent/agreements/{id}/proposed-invoices/{proposedInvoiceId}` accepts an **issued**
      invoice's proposal (backend `06-unified-invoice-generation.md` FR 101 / `07` AC17). The
      controller's XML doc said otherwise and was corrected in the same backend pass — do not re-derive
      the old rule from stale docs.
- [x] `InvoiceLineResponse.lineId` can be posted back as `UpdateProposedLineRequest.lineId`: the
      backend derives each invoice line's id from the proposed line's
      (`ProposalInvoicePlanner`: *"The invoice line's identity IS the proposed line's identity"*).
- [x] `lines` on the PATCH is a **complete replacement** — an omitted live line is soft-deleted.
- [x] There is no `amount` on `UpdateProposedLineRequest`; quantity × rate is the amount.
- [x] Feature folder: the spec goes in the existing `rent-agreements` folder — this is the same lease
      capability, and the page reads an invoice only to reach its lease's billing plan. The *code* gets
      its own `src/app/invoices/` folder because the read resource is an invoice and nothing in
      `rent-agreements/` is about invoices.

Open questions: none.

## Technical Approach

**One new page, one new service, one new method on the existing service.**

`UpdateProposedInvoiceComponent` at `/invoices/update` runs three stages:

1. **Load.** A GUID-shaped invoice id, then `GET /api/v1/invoices/{id}` through a new
   `InvoicesService`. The response is held whole: the page renders its identifying context read-only
   and, critically, keeps `rentAgreementId` and `proposedInvoiceId` — the PATCH's address, which the
   user never types.
2. **Edit.** A `FormGroup` with a `dueDate` control and a `FormArray` of line groups seeded from
   `invoice.lines`. **Each group carries its `lineId` and `lineItemId` as form state**, not as display
   — that is what makes the submit a revision rather than a replacement. `amount` is a computed
   getter, never a control, because it is not on the wire.
3. **Submit.** The request is assembled by *diffing against what was loaded*: `dueDate` is included
   only if it differs, `lines` only if any line was added, removed, or changed. Both members absent is
   a no-op the page refuses locally rather than sending.

**Why the request is diffed rather than always sent whole.** Absence means "leave unchanged" on this
endpoint, and a present `lines` is a manual edit even when it matches: the backend's own no-op guard
would spare the write, but the screen should not depend on that to avoid claiming an edit it did not
make. Sending only what changed is also what makes a due-date-only correction leave the line ids
untouched.

**Why `src/app/invoices/` rather than `rent-agreements/`.** The read resource is an invoice and the
page is named for it. The *write* is on the rent-agreement service, so `updateProposedInvoice()` is
added to the existing `RentAgreementsService` — the route lives under `/rent/agreements`, and a second
client for the same base URL would be the thing that drifts.

**Line removal is expressed by omission**, matching the endpoint. The template's remove button drops
the row from the `FormArray`; nothing marks it deleted, because the array *is* the statement. A
guard keeps at least one row, since the endpoint rejects an empty `lines` array with `400`.

Files created:

- `src/app/invoices/invoice.models.ts`
- `src/app/invoices/invoices.service.ts` (+ `.spec.ts`)
- `src/app/invoices/update-proposed-invoice.component.ts` / `.html` / `.scss` (+ `.spec.ts`)

Files changed:

- `src/app/rent-agreements/rent-agreement.models.ts` — `UpdateProposedInvoiceRequest`,
  `UpdateProposedLineRequest`, `ProposedInvoiceDetailResponse`, `ProposedLineResponse`,
  `ProposedInvoicePayerResponse`.
- `src/app/rent-agreements/rent-agreements.service.ts` — `updateProposedInvoice()`.
- `src/app/app.routes.ts`, `src/app/app.component.html` — route and sidebar link.

## Technical Decisions

| # | Decision | Chosen | Alternatives rejected | Why |
|---|----------|--------|-----------------------|-----|
| 1 | Which id the user types | The **invoice** id, with both PATCH ids derived from the read | Type the agreement id and the proposal id; pick a proposal off the lease screen | The user asked for exactly this — *"invoice wala get use kro but update ke time me update proposed hoga"* (2026-08-31). An invoice id is also the only one of the three a person can plausibly have in hand. It is what the backend v36 field was added to make possible |
| 2 | Where the write method lives | `RentAgreementsService.updateProposedInvoice()` | A `ProposedInvoicesService`; on the new `InvoicesService` | The route is under `/rent/agreements/{id}/…` and that service already owns that base URL. Putting an agreement-scoped route on an invoice client would be naming it after the wrong resource |
| 3 | What the request contains | Only what changed — `dueDate` if different, `lines` if any line moved | Always send both | Absence means "leave unchanged"; sending an unchanged `lines` set asserts a manual edit that did not happen, and needlessly re-writes every line's identity path |
| 4 | Line identity | `lineId` carried in the form state and posted back | Match lines by position or description on submit | Position and description are not identities — two lines legitimately share a description, and reordering would silently retarget an edit. The backend hands us the id precisely so we do not have to guess |
| 5 | `amount` | A computed display value, never a control and never sent | A disabled control mirrored onto the request | The field does not exist on `UpdateProposedLineRequest`. A client total that disagreed with its own quantity × rate would be unreconcilable, which is why the backend gave it nowhere to go |
| 6 | An invoice with no `proposedInvoiceId` | Refuse locally, explain why, send nothing (FR 9) | Send anyway and let it 404 | Null is a known, permanent fact about pre-pipeline invoices (backend FR 52/53), not a transient failure. A request built from it would be addressed to nothing |
| 7 | After a successful PATCH | Re-seed the form from the returned proposal | Leave the pre-edit form; reload the invoice | The response *is* the new state, with the new line ids. Re-seeding makes a second correction start from truth; a reload would be a second round trip to learn what we were just told |
| 8 | Page folder | New `src/app/invoices/` | Add to `src/app/rent-agreements/` | The read resource is an invoice; nothing else in `rent-agreements/` is. The spec still lives in the `rent-agreements` docs folder, because the capability is the lease's billing |
| 9 | **v2** — How item type is entered | The ADD ADDITIONAL FEE panel's catalog picker, reusing `LineItemsService` and its markup/styles | v1's free-text `itemType` input; a plain `<select>` | Requested by the user (*"exiting drop down show kro same line item wala jo additional pe tha"*, 2026-08-31), and correct besides: `itemType` must parse to an `InvoiceItemType` member, so free text was a `422` waiting to happen. The picker also supplies the `lineItemId` a deposit proposal requires on every line |
| 10 | **v2** — Whether to carry over "+ Add Item Type" | No | Copy the panel wholesale | The fee endpoint get-or-creates a catalog entry from free text; this one parses a fixed enum and answers `invoice.unrecognized_charge_item_type` otherwise. Offering the affordance would offer a refusal |
| 11 | **v2** — A line with no `lineItemId` | Label the picker with the line's own `itemType` | Show "Select Type" | Every generated **rent** line is raised with no catalog id. "Select Type" would report the app's most common line as unset |
| 12 | **v2** — Catalog fetch failure | Empty picker, invoice still loaded and correctable | Fail the whole load | The due date, quantities and rates are all still editable without a catalog. Failing the load would withhold the parts that work |
| 13 | **v2** — Due-date control | The Material datepicker used by the lease form and the fee panel, with `toIsoDate`/`parseIsoDate` | v1's native `<input type="date">` | Requested by the user (*"calender sahi wala use kro jo already add lease wale pe hai material wala"*, 2026-08-31); it also makes the date read and written in local time by the same helpers the rest of the app uses, rather than by the browser's own control |

## Data Model & Schema Changes

None — a client-side screen over two existing endpoints. The only delta is TypeScript wire models
mirroring backend contracts that already exist: `UpdateProposedInvoiceRequest`,
`UpdateProposedLineRequest`, `ProposedInvoiceDetailResponse` and its two nested shapes, plus
`InvoiceDetailResponse`/`InvoiceLineResponse` for the read.

## Task Checklist

- [x] `src/app/invoices/invoice.models.ts` — `InvoiceDetailResponse`, `InvoiceLineResponse`,
      `InvoicePaymentResponse`, `InvoiceCreditResponse`, `InvoiceTenantShareResponse`.
- [x] `src/app/invoices/invoices.service.ts` (+ spec) — `getById(invoiceId)` against
      `${apiBaseUrl}/api/v1/invoices/{id}`.
- [x] `src/app/rent-agreements/rent-agreement.models.ts` — the update request and proposal response
      shapes.
- [x] `src/app/rent-agreements/rent-agreements.service.ts` (+ spec) — `updateProposedInvoice()` issuing
      a `PATCH`.
- [x] `src/app/invoices/update-proposed-invoice.component.ts` — id validation, load, form seeding,
      line add/remove, change diffing, submit, re-seed, error mapping.
- [x] `src/app/invoices/update-proposed-invoice.component.html` / `.scss`.
- [x] `src/app/invoices/update-proposed-invoice.component.spec.ts` — the Test Plan below.
- [x] `src/app/app.routes.ts` — a lazy `loadComponent` route at `invoices/update` (the bundle budget is
      already at 793 kB of 800 kB; the Add Additional Fee page is lazy for the same reason).
- [x] `src/app/app.component.html` — sidebar link "Update Invoice".
- [x] `npx ng test --watch=false --browsers=ChromeHeadless` and `npx ng build` both clean.

**v2 follow-up (user feedback on the form's controls):**

- [x] `update-proposed-invoice.component.ts` — inject `LineItemsService`; fetch the catalog on load
      scoped by the invoice's category; picker state (`lineItems`, `openItemPickerIndex`,
      `itemPickerPosition`) and behaviour (`toggleItemPicker`, `closeItemPicker`, `selectLineItem`,
      `itemDisplayLabel`, `isItemUnset`); close the picker on row removal.
- [x] `update-proposed-invoice.component.html` / `.scss` — the "Select Type" button and floating menu,
      styles lifted from the fee panel minus its "+ Add Item Type" row.
- [x] `update-proposed-invoice.component.ts` / `.html` — Material datepicker for `dueDate`
      (`MatDatepickerModule`/`MatFormFieldModule`/`MatInputModule` + `provideNativeDateAdapter()`), with
      `parseIsoDate` on seed and `toIsoDate` on submit.
- [x] `update-proposed-invoice.component.spec.ts` — seven new cases for the picker and the catalog
      fetch; existing due-date cases moved to `Date` values.

## Test Plan

`update-proposed-invoice.component.spec.ts`:

1. **FR-1** — a non-GUID id sets the inline error and issues no request.
2. **FR-2/3** — a valid id issues one `GET /invoices/{id}`; the form's `dueDate` and one line group per
   returned line are seeded, each holding its `lineId`.
3. **FR-6/8** — changing only the due date sends `{ dueDate }` with **no** `lines` member.
4. **FR-4/6** — editing one line's rate sends the **complete** array with every original `lineId`
   preserved and the edited rate applied.
5. **FR-4** — removing a line sends an array without it, and with the survivors' ids intact.
6. **FR-4** — adding a line sends an entry with **no** `lineId`.
7. **FR-5** — no submitted line carries an `amount` key.
8. **FR-7** — the request goes to
   `/rent/agreements/{rentAgreementId}/proposed-invoices/{proposedInvoiceId}` with the ids from the
   loaded invoice, by the `PATCH` method.
9. **FR-8** — with nothing changed, submit sends no request and says so.
10. **FR-9** — an invoice whose `proposedInvoiceId` is null renders as not correctable and submitting
    issues no request.
11. **FR-10** — a `422` renders its `detail` and leaves the form's edits in place.
12. **FR-11** — a success renders the returned proposal and re-seeds the form from its lines.
13. **FR-12** — a blank description or a zero quantity blocks submission with no request.

`invoices.service.spec.ts` covers the read's URL and method; `rent-agreements.service.spec.ts` gains a
case for the PATCH's URL, method and body. Full suite:
`npx ng test --watch=false --browsers=ChromeHeadless`.
