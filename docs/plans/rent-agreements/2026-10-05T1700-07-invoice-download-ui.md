**Spec:** [`docs/specs/rent-agreements/07-invoice-download-ui.md`](../../specs/rent-agreements/07-invoice-download-ui.md) — v1

# The invoice leaves the screen as a file

The Update Invoice page can correct an invoice and show every figure on it, and there is still nothing
to *send* anybody. A manager who needs the invoice as an attachment — for the tenant, for a dispute,
for an accountant's month-end pack — has a screen, and a screen is not a document.

Billing now renders one. `13-invoice-download.md` v3 answers `GET /invoices/{id}/document` with the
PDF **bytes** rather than a link, having reversed its own v1 contract on the grounds that a URL would
have obliged the service to own blob storage, a retention policy and an expiry reaper. That reversal
moved a cost onto this application and named it:

> *"The cost is borne by the portal, which must consume a file response rather than navigate to a
> link"* — backend spec `13`, **Assumption 5**

This plan is that consumption.

## 1. Setup & Environment

Repository `rent-schedule-ui`, branch `Piyush/invoice-download-ui`.

```
npm test -- --watch=false --browsers=ChromeHeadless
```

The suite stands at **527**, of which **3 fail before this change and after it** — two
`scopeHeadersInterceptor` cases and one `RentAgreementCreateComponent` case, all of them asserting
against `http://localhost:5169` while the local `environment.apiBaseUrl` is now `''`. They are
untouched by this work and are **not** fixed here; fixing them is a different change with a different
spec.

**No backend change.** The endpoint, the renderer and the filename rule already exist and are
specified; nothing in `innago-billing` is edited by this plan.

### Prerequisites & Open Questions

**None.** Two things were checked rather than assumed:

| Question | Answer |
|---|---|
| Can the client read `Content-Disposition`? | **Yes.** Every build is same-origin — `apiBaseUrl` is `''`, `/billing` or `/api`, the first two proxied by the dev server — so no CORS layer filters response headers. The API's policy exposes `X-Correlation-Id`, `ETag` and the rate-limit headers and **not** `Content-Disposition`, so this would break the moment the app were served cross-origin from the API. That is why the fallback name is a requirement (5) and not a convenience. |
| Does an uncorrectable invoice still render? | **Yes** — **BR-16**, same rule as `GET /invoices/{id}`. So the button is not gated on `isCorrectable`. |

## 2. Milestone-Based Implementation

### Milestone 1 — The browser is handed a file (requirement 6)

`FileDownloadService.save(blob, fileName)`: object URL → hidden `download` anchor → click → revoke on
the next macrotask.

Injectable rather than an exported function, for one reason that is about the suite rather than the
design: it is the only code in the app that clicks an anchor, and a component test that could not
replace it would make the browser save a PDF on every run.

| | |
|---|---|
| Production files | `shared/file-download.service.ts` |
| Rules | requirement 6 |
| Tests | `clicks a download anchor named after the file`, `leaves no anchor in the document`, `revokes the object URL after the click` |

### Milestone 2 — The response is read as bytes, and its header for the name (requirements 2–5)

`InvoiceDocumentService.download(invoiceId)` — `responseType: 'blob'`, `observe: 'response'`, no
`audience`. It answers `{ blob, fileName }` where `fileName` is parsed out of `Content-Disposition`,
preferring RFC 5987's `filename*` over `filename`, percent-decoding it, and reducing it to a bare name.

`fileName` is **`null` rather than a guess** when the header is absent or unparseable: the fallback is
`invoice-{invoiceNumber}.pdf`, and the invoice number lives on the page, not in a service that was
handed an id.

Separate from `InvoicesService` because the response is a file. That service is typed JSON reads over
the projection; this one asks for bytes and reads a header for meaning, and folding it in would break
the shape of every method around it.

| | |
|---|---|
| Production files | `invoices/invoice-document.service.ts` |
| Rules | requirements 2, 3, 4, 5 |
| Tests | `asks for the document as a blob and sends no audience`, `reads the file name out of Content-Disposition`, `prefers filename* and percent-decodes it`, `falls back to the plain filename when the extended one is malformed`, `keeps only the name when the header carries a path`, `reports a null file name when the header is absent`, `reports a null file name when the header names nothing usable`, `propagates a failure with its body still a blob` |

### Milestone 3 — The button, and the three ways it can fail (requirements 1, 7–12)

`downloadInvoice()` on `UpdateProposedInvoiceComponent`, with `downloading` and `downloadError`
signals and a DOWNLOAD INVOICE button in the summary bar beside the status pills.

Three refusals, each for a stated reason:

1. **Zero bytes is a failure** (**BR-21**). The monolith's `PrintInvoiceView` wraps its whole body in
   `catch { return ""; }`, so a `200` with an empty body is exactly what a failure looks like there.
   Saving a zero-byte `.pdf` would look like success and open as nothing.
2. **The error body is a `Blob`**, because the request asked for one — so `err.error?.detail`, which
   every other screen in this app reads, is `undefined` on every download failure. `describeBlobError`
   reads the blob as text and parses it, falling back to the status line.
3. **A second click is ignored while one is in flight.** Each call re-renders server-side (**BR-20**);
   a second request is a second render of the same document.

The failure gets **its own banner**. A download is a read: it changes nothing, and reporting it in the
correction's error slot would tell the user their edit was in trouble when it was not.

**Flow Card** — *trigger:* the manager clicks DOWNLOAD INVOICE on a loaded invoice.
`update-proposed-invoice.component.ts#downloadInvoice` reads the **loaded invoice's** id (not the text
in the lookup box, which may have been retyped since) →
`InvoiceDocumentService.download` issues `GET /api/v1/invoices/{id}/document` →
the API renders through Gotenberg and answers `application/pdf` +
`Content-Disposition: attachment; filename="invoice-INV-092026-000042.pdf"` →
the service parses that name → the component checks the size, applies the fallback name if there was
none, and calls `FileDownloadService.save` → the file lands in the downloads folder and **nothing on
screen changes**, which is the whole point.

| | |
|---|---|
| Production files | `invoices/update-proposed-invoice.component.ts`, `.html`, `.scss` |
| Rules | requirements 1, 7, 8, 9, 10, 11, 12 |
| Tests | `saves the file under the name the server sent`, `falls back to invoice-{invoiceNumber}.pdf when the header is absent`, `downloads an invoice that cannot be corrected`, `reports an empty document and saves nothing`, `reads the problem detail out of the blob error body`, `falls back to the status line when the error body is not problem details`, `leaves the loaded invoice and a typed correction untouched when it fails`, `issues one request while a download is in flight`, `issues no request when nothing is loaded`, `clears a previous failure when another invoice is loaded` |

## 3. Scope & Context Rules

**Touched:** `shared/file-download.service.ts` (new), `invoices/invoice-document.service.ts` (new),
`invoices/update-proposed-invoice.component.{ts,html,scss}`, and the three matching spec files.

**Not touched, deliberately:**

- **`invoices.service.ts`.** It models typed JSON reads; a blob response fits none of its signatures.
- **The invoice list.** `InvoiceDocumentService` takes an id and nothing else, so a row menu item is a
  template change and a call — but the row menu belongs to spec `04` and widening it is that spec's
  version.
- **`scope-headers.interceptor.ts`.** The document request is an ordinary `HttpClient` call under
  `apiBaseUrl`, so it already carries the scope headers or the bearer with no change at all.
- **Anything in `innago-billing`.** The endpoint is built and specified.

## 4. Verification

```
npm test -- --watch=false --browsers=ChromeHeadless
npm run build
```

- 549 tests, **546 passing**, the same 3 pre-existing failures named in section 1 and no others.
- Production build clean, including the per-component style budgets the new `.download-btn` rule sits
  under.
- Manually: load an invoice on `/invoices/update`, click DOWNLOAD INVOICE, confirm the saved file is
  named `invoice-<invoiceNumber>.pdf` and opens as the rendered invoice.

## 5. Git & Rollback

One commit on `Piyush/invoice-download-ui`. Rollback is a revert: nothing is migrated, nothing is
persisted, and no other screen calls either new service.

## 6. Final Validation

| Requirement | Where it is met |
|---|---|
| 1 | The button renders inside the `@if (invoice(); as loaded)` block |
| 2 | `InvoiceDocumentService.download` — `responseType: 'blob'`, `observe: 'response'` |
| 3 | No `audience` member is built anywhere; asserted by `params.has('audience')` |
| 4 | `parseFileName` — `filename*` first, then `filename` |
| 5 | The component applies `file.fileName` or, when it is `null`, the `invoice-{invoiceNumber}.pdf` fallback |
| 6 | `FileDownloadService.save` |
| 7 | `downloadInvoice` reads `invoice()`, never `isCorrectable` |
| 8 | `downloading()` guard and the disabled button |
| 9 | `file.blob.size === 0` |
| 10 | `describeBlobError` |
| 11 | `downloadError` is its own signal and its own banner |
| 12 | `resetLoadedState` clears it, and `downloadInvoice` clears it before each attempt |
