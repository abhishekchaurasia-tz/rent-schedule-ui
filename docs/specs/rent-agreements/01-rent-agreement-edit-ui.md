## Changelog

| Version | Date | Author | Summary | Plan |
|---------|------|--------|---------|------|
| v22 | 2026-09-14 | Abhishek Chaurasia | **The line-item catalog stops being asked for by owner, a third identifier joins the settings box, and v21's own requirement text is corrected where it named headers that never shipped.** New requirement **13**; **12d is corrected**. *Follows backend `02-invoicing.md` v39 FR 47 and `01-rent-agreement.md` v91 FR-129.* **The part that matters is a silent wrong answer, not a broken screen.** Backend v39 moved the line-item catalog's owner scope from a query parameter to the `PropertyOwnerUid` header. This application already sends that header on every API call, so **nothing returns `400`** — but `LineItemsService.list()` takes the owner as an *argument*, and its callers pass **the owner of the record being edited** (`additional-charge-panel.component.ts` passes the agreement's; `update-proposed-invoice.component.ts` passes the invoice's), while the header carries the **settings-box** value, which starts as an invented GUID. So after v39 the catalog resolves under whichever owner the box holds: the picker quietly shows only system-defined items, and a new entry is filed under an owner nobody chose. **A screen that looks like it works is worse than one that fails**, which is why this version exists rather than waiting for someone to notice. **Requirement 13** removes the argument — the header becomes the only source, matching the service — and adds a **visible mismatch warning** when the loaded record's owner differs from the box, so the condition that used to be silent is on screen (**D5**). **A third identifier, `IdentityId`,** joins the box and the interceptor: backend FR-129 records who wrote every row in `created_by`/`modified_by`, and without it every row this application writes is stamped as unattributed and logs a warning server-side. It is **not required** — the backend never refuses a write for its absence — so this is about the audit trail being true, not about the screen working. **The correction:** requirement 12d as written says the interceptor adds `OrganizationId` and `PropertyOwnerId`. **It never did.** Those claims are `long`s in the platform's token; the GUID variants are `OrganizationUid` and `PropertyOwnerUid`, which is what the code has sent since it was written — as v21's own changelog row explains at length. The requirement text was left behind when the code was corrected, and is fixed here rather than left to mislead the next reader. | [2026-09-14T1400-01-the-scope-ids-travel-as-headers](../../plans/rent-agreements/2026-09-14T1400-01-the-scope-ids-travel-as-headers.md) |
| v21 | 2026-09-14 | Abhishek Chaurasia | **The two ids that say *who is saving* leave the lease body and become request headers, supplied from a settings box the tester controls.** New **requirement 12**. *Requested by the user 2026-09-14 as the client half of `innago-rent-accounting` spec `01-rent-agreement.md` v89–v90 (FR-127, FR-128).* The Billing API now requires **`OrganizationUid`** and **`PropertyOwnerUid`** on `POST /rent/agreements` and **no longer reads `propertyOwnerId` from the request body**. **What changes here.** `CreateRentAgreementRequest` loses `propertyOwnerId`; a new **HTTP interceptor** attaches both headers to every call whose URL starts with `environment.apiBaseUrl`, registered through `provideHttpClient(withInterceptors(...))` in `app.config.ts`, which registered none before; a small `RequestScopeService` holds the two values; and the shell's sidebar gains a **Test scope box** with both of them, editable and remembered across reloads. **Two decisions were reversed during the work, and both are recorded under Clarifications rather than quietly applied.** (1) *The values are typed, not invented.* The first draft hid them behind generated GUIDs; this application is a **test harness that never reaches production**, and its purpose is to drive real dev and qa environments — an identifier nobody can set cannot be pointed at a real account, which would leave the whole change untestable against anything but itself. They still **start populated**, so a tester who ignores the box still gets a `201` rather than a `400` about a header they have never heard of. (2) *The headers are the `Uid` variants.* The first draft used `OrganizationId`/`PropertyOwnerId`, the names the gateway forwards — but the platform’s own `SessionManager` parses those as **`long`** and the `Uid` siblings as **`Guid`**, and both backend columns are `uuid`. Using the plain names would have returned `400` on every create against a real token. **`propertyOwnerId` stays a form control:** the charge panel and line-item pickers bind to it for catalog scoping, and the edit page patches it from the loaded agreement. It stops being a *body field*; it does not stop existing. **Release coupling, stated plainly:** this change and the backend’s are one release. Ship either alone and every lease save is refused — nothing is half-saved, but the create screen is unusable until both are out. | [2026-09-14T1400-01-the-scope-ids-travel-as-headers](../../plans/rent-agreements/2026-09-14T1400-01-the-scope-ids-travel-as-headers.md) |
| v20 | 2026-09-09 | — | **The preview already said what the change would cost and what the save would refuse; this application threw both away — the fourth and fifth times in two days.** New **requirement 11**. `POST /rent/schedule/preview` returns `warnings` (non-blocking consequences the backend documents as *"the user must see before saving"*, e.g. `frequency_change_loses_row_identity`) and `blocked` (the rows `PUT …/terms` will decline). **`grep -rn "warnings" src/` and `grep -rn "blocked" src/` found neither** — no model field, no signal, no template branch. **These are the only signals in this application that arrive *before* a save.** `blockedRemovals` (v19) explains a refusal afterwards, by which point the decision is made; `warnings` is the one thing that can change a decision while it is still being made — which is why both render **above** the schedule table rather than beside the save button. **Replaced wholesale on every preview, never merged:** a warning describes *that* computed change, so carrying one forward would leave it describing a change the user has already backed out of — pinned by a test that previews twice. Neither is an error: `previewError` means the preview failed, these mean it succeeded and the change has a consequence. **Shipped with the backend fix that makes `blocked` trustworthy** — its predicate had been stale since FR-124, so it named rows the save removes without complaint (backend spec 01 v88). Surfacing it before that fix would have been surfacing a wrong answer more loudly. | [2026-09-09T1900-01-surface-what-the-preview-says](../../plans/rent-agreements/2026-09-09T1900-01-surface-what-the-preview-says.md) |
| v19 | 2026-09-08 | — | **A refused row deletion looked exactly like a save that did nothing, because this application threw the server's explanation away.** New **requirement 10**. *Reported 2026-09-08: "jab maine invoice bana diya to schedule row deletion failed ho raha silently".* **It never failed.** `PUT …/terms` answered `200`, applied every other change, and named the refusal in `blockedRemovals` — a message written for display, plus the id of the invoice standing in the way, which the backend added at its v45 expressly *"so a client can offer to remove the invoice rather than leaving the owner stuck at a refusal with no next step"*. **`blockedRemovals` appeared nowhere in this repository**: no model field, no component code, no template branch. A terms save is a filter rather than an all-or-nothing request (backend FR-103), so a `200` does not mean everything asked for happened — and this was the only place that difference could have been shown. **Holding the navigation is the half that makes it a fix.** The save moved straight to the tenants screen on success, so a banner rendered here would have been rendered onto a page the user never saw; the page now stays while anything is refused, putting the row, the reason and the invoice together. The happy path is untouched. **Three deliberate limits, recorded rather than left to be discovered:** the server's `message` is shown verbatim because the wording belongs to whoever owns the rule; the invoice is **named, not acted on**, since removing one is destructive and `04-invoice-list-ui.md` already owns that confirm flow; and the invoice id is shown raw, because a filtered link needs a route contract `/invoices` does not have. | [2026-09-08T2100-01-surface-blocked-removals](../../plans/rent-agreements/2026-09-08T2100-01-surface-blocked-removals.md) |
| v18 | 2026-09-01 | — | **Semi-Annual is no longer offered on a month-to-month lease.** The backend refuses that pair outright — `PreviewRentScheduleQueryValidator` and `FirstRentalDueDateOptionsQueryValidator` both answer *"Semi-annual frequency is not supported for month-to-month leases."* — so the option could only ever end in a `400` the user had no way to see coming. The six-entry frequency list, previously copied into three components, moves to one shared `frequency-options.util.ts`, and each picker reads `frequenciesFor(leaseTermType)`. **Hiding the option is only half of it**: a form already sitting on Semi-Annual when the term switches would keep an invalid value in a control whose list no longer contains it — blank on screen, failing on save for a field the user cannot see — so the lease form and the preview reset to Monthly on that switch, and the fee panel does the same at open time *after* its prefill, since a saved charge can itself carry Semi-Annual on a lease since reopened as month-to-month. **Custom is deliberately still offered** for month-to-month: the backend rule names Semesterly and nothing else. | [2026-09-01T1000-month-to-month-frequency-options](../../plans/rent-agreements/2026-09-01T1000-month-to-month-frequency-options.md) |
| v17 | 2026-08-31 | — | **The per-tenant due-date cell uses the Material datepicker, like every other date in the app.** It was the one native `<input type="date">` left on this screen — an oversight, since the component already wired `MatDatepickerModule` and `provideNativeDateAdapter()` for its other pickers. The cell is not a form control but a `[value]`/`(change)` pair over the ISO-string `tenantDueDates` map, so two template-facing wrappers (`asDate`/`asIso`) convert at that boundary and the map keeps the exact shape `saveEdit` sends. No wire change. | [2026-08-31T2000-datepicker-consistency](../../plans/rent-agreements/2026-08-31T2000-datepicker-consistency.md) |
| v16 | 2026-08-20 | — | **Bug fix, found while the user verified v15 live: the first-rental-due-date `<select>` was already blank on a fresh edit-page load of a draft lease, before any field was touched at all.** v15's `isFirstRentalDueDateEditable` exemption only covers `Active`/`Expiring` leases; a draft is correctly NOT exempt from it, but that rule was never meant to also cover this case — `loadAgreement()`'s own, very first `refreshCandidateDates()` call, made immediately after patching the form, before the user can have changed anything. The candidate endpoint enumerates dates purely from the recurrence's cadence, so an already-saved, freely-picked anchor (the domain's `GenerationWindow.AnchorDate` "verbatim first row") routinely isn't in it — with zero edit having happened. **Fix**: `refreshCandidateDates` gains an `isInitialLoad` parameter, `true` only on `loadAgreement()`'s own call; the auto-clear now also requires `!isInitialLoad`, so the very first fetch after load never clears the field in **any** status — v15's status-gated rule resumes governing every fetch after that, once a real edit happens. | [2026-08-20T2200-01-rent-agreement-edit-ui-first-rental-due-date-initial-load-preserve](../../plans/rent-agreements/2026-08-20T2200-01-rent-agreement-edit-ui-first-rental-due-date-initial-load-preserve.md) |
| v15 | 2026-08-20 | — | **Bug fix: any change on the edit screen could silently clear "On which date should the first rental invoice be due?", forcing an unwanted re-pick — now preserved once the lease is `Active`/`Expiring` (backend `01-rent-agreement.md` v61's new `isFirstRentalDueDateEditable` flag).** Root cause: `refreshCandidateDates()`'s success handler unconditionally cleared `firstRentalDueDate` to `null` whenever the fresh, forward-looking candidate list no longer contained the current value — routine for an already-started lease, since that endpoint only ever returns dates from today forward; there was **no** `isEditMode` gate on this at all (an earlier internal investigation had wrongly assumed one existed and that the control was disabled outright in edit mode — neither was true). **Fix**: the auto-clear now also requires a new `canAutoClearFirstRentalDueDate` guard — `!isEditMode \|\| loadedAgreement()?.isFirstRentalDueDateEditable !== true` — confirmed by the user 2026-08-20 to exempt only `Active`/`Expiring` leases; an unactivated `InProcess` draft keeps today's create-like behavior exactly. A new `firstRentalDueDateSelectOptions()` injects the preserved value into the `<select>`'s rendered options when the server's own candidate list no longer includes it, so the control still shows it as selected rather than blank; the `[attr.disabled]`/placeholder conditions read this same list instead of the raw `candidateDates()`. **No new endpoint** — consumes the backend's already-shipped flag. | [2026-08-20T2100-01-rent-agreement-edit-ui-first-rental-due-date-preserve](../../plans/rent-agreements/2026-08-20T2100-01-rent-agreement-edit-ui-first-rental-due-date-preserve.md) |
| v14 | 2026-08-21 | — | **Bug fix: `RentAgreementAdditionalChargeResponse` never carried `frequencyConfig`, and `toChargeCreationRequest` never mapped it — so a recurring, rental-invoice-attached additional charge lost its cadence the moment it was loaded for editing.** Every other field of the charge is copied verbatim by `toChargeCreationRequest` (`rent-agreement.models.ts`); `frequencyConfig` was the one silent exception, so `applyInitialCharge`'s `applyFrequencyConfig(frequency, charge.frequencyConfig)` (`additional-charge-panel.component.ts`) always received `undefined` and left the per-frequency form controls (`dueOnDay`, `dueOnDays`, `dayOfWeek`, `cycle`, `dueDates`) at their defaults, so `buildFrequencyConfig(value)` at save time reconstructed an empty/invalid shape regardless of what was actually persisted. This is why re-saving an agreement with such a charge — even completely untouched — failed the backend's `422 "FrequencyConfig is required…"` validation (backend spec `01-rent-agreement.md` v52, which fixed the mirror-image bug of the response never sending the field at all; this fix is the client-side half of the same round trip). Fixed by adding `frequencyConfig?: FrequencyConfig \| null` to `RentAgreementAdditionalChargeResponse` and one line to `toChargeCreationRequest`. No template or form-control change — `applyFrequencyConfig` already handled a present config correctly; it only ever received an absent one. | [2026-08-21T1400-01-rent-agreement-edit-ui-charge-frequency-config-roundtrip](../../plans/rent-agreements/2026-08-21T1400-01-rent-agreement-edit-ui-charge-frequency-config-roundtrip.md) |
| v13 | 2026-08-20 | — | **The edit page gains per-tenant rows: each schedule row expands into one editable row per tenant (amount, due date, cancel/restore) in non-group mode, and shows schedule rows only in group mode** — backend spec `01-rent-agreement.md` **v49/v50**, FR-063 – FR-085. **No new endpoint**: the per-tenant collection rides on each schedule row of `PUT …/terms`, which is what lets the screen keep batching every edit until its own Save, so Cancel still discards everything. Per-tenant state is tracked as `Map`/`Set` signals keyed by ``${scheduledDate}|${tenantId}``, matching how this component already tracks per-row state, so the existing reset-on-preview path extended rather than being rewritten. **Three wire asymmetries are load-bearing and each corrupts data silently if inverted**: an absent per-tenant `amount` **clears** the override (so `saveEdit()` sends the *complete* per-tenant set every save — a partial set would wipe edits the user never touched), an absent `dueDate` **does** mean unchanged (a tenant date has no computed value to fall back to), and an absent `isCancelled` **restores** (the same decisive-flag rule v10 already established for schedule rows, reused rather than reinvented). **The row shape is read per cycle from `row.tenants`, never inferred from the lease group-invoice setting** — after a group/non-group switch a protected cycle keeps its old shape while its siblings flip, so the flag and the data disagree by design. The parent row shows `tenantAmountTotal` **beside** its own rent whenever they differ, because after an authored amount each figure answers a different question. `generatePreview()` now sends `isGroupInvoice`/`tenantSplit`/`pendingTenantRows` so unsaved per-tenant work previews correctly; omitting all three keeps the pre-v49 request and response, which is why the create flow is untouched. | [2026-08-20T1800-01-rent-agreement-edit-ui-per-tenant-rows](../../plans/rent-agreements/2026-08-20T1800-01-rent-agreement-edit-ui-per-tenant-rows.md) |
| v12 | 2026-08-17 | — | **The deposit is no longer read-only unconditionally on the edit page — it follows the server's new `isDepositEditable` flag (backend spec v48), so it is editable while the lease is an unactivated draft and locks once activated.** Replaces v11's blanket "disabled in edit mode": `setDepositFieldsEnabled()` toggles all three controls together (with `emitEvent: false`, so the enabled-state change never triggers the debounced auto-preview), called first with `false` in the constructor — so the fields are never briefly editable before the load answers, and stay locked if the load fails — then with `agreement.isDepositEditable` in `loadAgreement()`, and again from the `PUT` response, so a lease activated between load and save re-locks without a reload. `saveEdit()` spreads the three deposit fields into the request **only** when editable; omitting them is what leaves the stored deposit untouched once locked (backend v48), and supplying them then would be a `409` that fails the whole edit. The two deposit validation rules in `save()` are now guarded by `isDepositEditable` rather than `!isEditMode` — still load-bearing, because disabled controls are absent from `form.value` and the pairing rule would otherwise misfire and block every save. The lock note is reworded for the real reason (*"this lease is active and its invoices have been generated"*) and, with the empty-deposit substitution, shown only when actually locked. `isDepositEditable` is a getter that returns `true` in create mode and the server's flag in edit mode — never decided client-side, so the UI and the endpoint's 409 cannot disagree. | [2026-08-17T1700-01-rent-agreement-edit-ui-conditional-deposit](../../plans/rent-agreements/2026-08-17T1700-01-rent-agreement-edit-ui-conditional-deposit.md) |
| v11 | 2026-08-17 | — | **The deposit fields are shown read-only on the edit page instead of looking editable and silently discarding changes (confirmed by the user 2026-08-17: *"read only mode me dikhawo deposit"*).** Reported as *"deposit amount aur uske flag add/edit me update kyu nahi ho rahe"*. Investigation (code trace + live test) found create works end-to-end — `deposit: 500, depositDueDate, depositCollected` are parsed, persisted, and echoed by `GET` — while edit **cannot** change them: backend decision D3/FR-025 makes every `deposit*` field immutable after creation, and `PUT …/terms` rejects any of them with `422 rent_agreement.immutable_term_field`, failing the whole edit. So `saveEdit()` correctly omits them — but the UI still rendered them as ordinary editable inputs, letting the user change 500 → 900, press Save, see success, and lose the change silently. Now, in edit mode only, the three controls are `disable({ emitEvent: false })`d on construction and a note explains why; a `input:disabled` style makes the bare Deposit Amount input read as disabled (Material styles its own). **A trap this had to avoid:** Angular omits disabled controls from `form.value`, so `save()`'s two create-only deposit rules (the pairing rule and the collected-requires-positive rule) would have read `undefined` and misfired, blocking *every* edit save — they are now guarded by `if (!this.isEditMode)`, which is also semantically right since deposit is not part of the edit contract. **Null-deposit case:** when the loaded agreement has no deposit, empty disabled boxes read as broken, so the trio is replaced by *"No deposit was set when this lease was created."*, driven by a new `hasStoredDeposit` getter that reads `loadedAgreement()` rather than the form (the form cannot answer it — disabled controls are absent from its value). The "+ Add Deposit Fee" button is deliberately left enabled: additional charges **are** editable on `PUT …/terms`, unlike the deposit itself. | [2026-08-17T1500-01-rent-agreement-edit-ui-deposit-read-only](../../plans/rent-agreements/2026-08-17T1500-01-rent-agreement-edit-ui-deposit-read-only.md) |
| v10 | 2026-08-17 | — | **`deletedRowDates` is deleted; `cancelledRowDates` becomes the single source of truth, set straight from the status the API reports — the component now holds no cancellation logic whatsoever, which is what the user asked for twice.** v9 still kept two sets (this-session delete vs. server-confirmed cancel) plus the logic to attribute a returned "Cancelled" row to one of them, and a `sameRowCount` gate around that logic silently discarded a status the backend had correctly derived — the reported *"when I change the end date the preview api resets my value"* defect. Both are gone: `generatePreview()`'s handler is now `cancelledRowDates.set(rows.filter(status === 'Cancelled').map(scheduledDate))`, with no date-matching, position-matching, or row-count reasoning. This became possible because the backend made the submitted `isCancelled` flag decisive whatever the row's stored status (backend spec v47), so both save paths now send **every** row flagged from that one set with no filtering — previously an already-cancelled row had to be *omitted* to avoid being restored while a freshly-cancelled one had to be *flagged*, which is the only reason the two buckets existed. `deleteRow()` adds to the single set, `restoreRow()` removes from it, and `restoreCancelledRow()` is now just an alias kept for the template. The `row-deleted` template branch and CSS hook are removed, leaving one cancelled-row presentation. | [2026-08-17T1300-01-rent-agreement-edit-ui-single-cancelled-set](../../plans/rent-agreements/2026-08-17T1300-01-rent-agreement-edit-ui-single-cancelled-set.md) |
| v9 | 2026-08-17 | — | **The elaborate row-count/ordinal-index remapping logic added in v7/v8 is deleted entirely — the backend now decides which row is cancelled and computes totals accordingly (backend spec `01-rent-agreement.md` v46), per the user's direct instruction after the v8 fix still had gaps: "mujhe UI pe iska complexity nahi daalna, API ko decision lena padega ki kaun cancel hai kaun nahi, aur total invoices aur total amount kitna hoga cancel aur edited rows ke according."** `generatePreview()` now sends `existingRows` (the caller-known row state — scheduledDate/dueDate/rent/isManualChanged/status) on **every** preview call via a new `buildExistingRows()` helper, not only for the once-per-load edit scenario the backend's mechanism was originally built for. The success handler no longer computes anything — it takes `response.rows[i].status`, `response.totalInvoices`, and `response.totalAmount` as given. The one piece of client-side bookkeeping that remains, because only the client can know it (the backend never reads a database): whether a row the backend reports "Cancelled" originated from *this session's* fresh delete (`deletedRowDates`) or was *already cancelled on the server* before this session (`cancelledRowDates`) — recovered by zipping the just-sent `existingRows[i]` against the response's `rows[i]`, position for position, which is relabeling using information already in hand, not re-deciding anything. `ScheduleRow` gains an optional `status` field; a new `ExistingScheduleRowInput` interface mirrors the backend's request type. Several v7/v8 tests that proved the (now-deleted) client-side position-matching algorithm worked across frequencies are removed — that correctness now lives in, and is tested by, the backend's own `PreviewRentScheduleEditFlowTests`; the client's remaining tests instead verify `existingRows` is built and sent correctly, and that a backend-reported status is relabeled into the right local bucket. | [2026-08-17T1100-01-rent-agreement-edit-ui-preview-status-from-api](../../plans/rent-agreements/2026-08-17T1100-01-rent-agreement-edit-ui-preview-status-from-api.md) |
| v8 | 2026-08-14 | — | **Extends v7's ordinal-position carry-over to `cancelledRowDates` (a row already cancelled on the SERVER from a prior save) — v7 only remapped `deletedRowDates` (this session's fresh deletions), leaving the exact same bug for a server-confirmed cancellation.** Found via live reproduction after the user reported the reset still happening: cancel a row, save, reload, then change "Due on the day" — the row's CANCELLED badge silently vanished and the next Save would have resubmitted it as an ordinary row (`isCancelled: false`), un-cancelling it. `generatePreview()` now computes `cancelledIndexes` the same way as `deletedIndexes` and remaps `cancelledRowDates` onto the fresh response by position. Since the backend's stored anchor never moves (`RentSchedule.ScheduledDate` has no mutator), resubmitting the row at its remapped date can only ever **insert a fresh row** there, never restore the original — which is the correct outcome: the true old anchor stays cancelled forever (orphaned, matching a slot that no longer exists in the current schedule), and clicking Restore at the new position creates the row that actually represents that slot today. | [2026-08-14T1600-01-rent-agreement-edit-ui-cancelled-row-by-position](../../plans/rent-agreements/2026-08-14T1600-01-rent-agreement-edit-ui-cancelled-row-by-position.md) |
| v7 | 2026-08-14 | — | **`generatePreview()` now tracks a deleted row by ORDINAL POSITION, not exact `scheduledDate` (confirmed by the user 2026-08-14, generalized across every frequency after an initial month-based attempt proved unsafe for bi-monthly/weekly).** Found via a reported bug: deleting a row, then changing "Due on the [day]" or "First rental due date", made the deletion silently disappear — "sare row same ho gaye". Root cause: those fields shift **every** row's `scheduledDate`, not just its due date, because the backend's `Schedule.FromDueDates` sets `scheduledDate == dueDate` at generation time (`new ScheduleRow(date, date, rent)`) — so a deleted row's exact anchor (e.g. `2026-09-01`) essentially never survives such a change, even though the user's intent ("cancel that payment") is unaffected by which exact day it lands on. **A first attempt matched by `"YYYY-MM"` month prefix; rejected once generalized to bi-monthly/weekly**, where more than one row can share a month — month-matching would wrongly carry a deletion onto an unrelated sibling row once a `dueOnDays`/`dayOfWeek` shift moved both. The final design matches by **index**: both the previous and fresh row lists are chronologically sorted by construction, so when the row **count** is unchanged, the Nth row is still "the Nth payment" regardless of which exact date it now falls on — correct uniformly for monthly, bi-monthly, weekly, bi-weekly, semi-annual, and custom. When the row count changes (a longer/shorter term, or a frequency change that regenerates a different cadence), there is no principled positional correspondence, so tracking clears entirely — matching the pre-existing "frequency change loses row identity" warning (D9). `deletedRowDates` is no longer cleared wholesale on any anchor-set mismatch (v1's binary "same-anchor" check is retired in favor of this row-count/index check). `manuallyChangedRowDates` is deliberately **not** given the same positional carry-over — v44/v5 already settled that a hand-edited amount must reset on any schedule-affecting change, and this bug report was specifically about deletion. | [2026-08-14T1500-01-rent-agreement-edit-ui-delete-by-month](../../plans/rent-agreements/2026-08-14T1500-01-rent-agreement-edit-ui-delete-by-month.md) |
| v6 | 2026-08-14 | — | **`saveEdit()` stops omitting a client-deleted row from `PUT …/terms` entirely — it is now sent like any other row, tagged `isCancelled: true`, carrying whatever `dueDate`/`rent` the user last edited locally before deleting it** (companion to `innago-rent-accounting` spec `01-rent-agreement.md` v45, confirmed by the user 2026-08-14: deleting a row after editing its due date must persist that edited due date onto the cancelled row, not silently drop it via omission). The filter that used to exclude both `deletedRowDates` and `cancelledRowDates` rows now excludes only `cancelledRowDates` (server-confirmed, not this session's fresh deletion) — mirroring the pattern `save()` (create mode) already used since spec v41. A row already cancelled on the server stays excluded unless the user explicitly restores it (v42/v4 semantics unchanged). | [2026-08-14T1400-01-rent-agreement-edit-ui-cancel-with-edits](../../plans/rent-agreements/2026-08-14T1400-01-rent-agreement-edit-ui-cancel-with-edits.md) |
| v5 | 2026-08-14 | — | **Reverses the "manual wins" preservation this component relied on, mirroring the backend's own reversal of decisions D4/D12 (`innago-rent-accounting` spec `01-rent-agreement.md` v44, confirmed by the user 2026-08-14).** `generatePreview()`'s same-anchor branch used to look up each manually-changed row's *previous* rent and re-apply it over the fresh preview value — that special case is deleted, so every row (hand-edited or not) now takes the API's freshly computed rent unconditionally. `manuallyChangedRowDates` is cleared on **every** successful preview response, not only when the recomputed anchors differ from before — any schedule-affecting change (most commonly a plain rent-amount edit, which is exactly the same-anchor case) now resets the flag rather than protecting it. `deletedRowDates` is unaffected — a row's *deleted* classification still survives a same-anchor re-preview exactly as before (v1's fix), and its tracked rent already took the fresh preview value even before this change, since the deletion-preservation logic only ever tracked identity, never amount. No backend contract change on this component's side — `isManualChanged` is still sent with whatever `manuallyChangedRowDates` currently holds at Save time, which the backend now also treats as a live signal rather than a permanent grant. | [2026-08-14T1200-01-rent-agreement-edit-ui-manual-wins-reversal](../../plans/rent-agreements/2026-08-14T1200-01-rent-agreement-edit-ui-manual-wins-reversal.md) |
| v4 | 2026-08-13 | — | **A cancelled row on the edit page is no longer display-only — a "Restore" button reactivates it.** Reverses v1's display-only scoping: the backend (`innago-rent-accounting` spec `01-rent-agreement.md` v42) made `Cancelled` reversible — resubmitting a cancelled row's anchor on `PUT …/terms` restores the same row to `Planned`. `restoreCancelledRow(scheduledDate)` simply removes the date from `cancelledRowDates`; since the row already sits in `previewResult()`'s rows (v1), no longer flagging it is enough for `saveEdit()`'s existing filter to resend it on the next save — its mere presence is the restore signal the backend acts on, not a new field. The "Add Lease" (create) page needed no change — its pre-save row-delete already had a working restore affordance from before this feature existed. | [2026-08-13T2000-01-rent-agreement-edit-ui-schedule-row-restore](../../plans/rent-agreements/2026-08-13T2000-01-rent-agreement-edit-ui-schedule-row-restore.md) |
| v3 | 2026-08-13 | — | **Reverses v2 entirely** — the backend replaced its anchor cross-check + `excludedScheduleDates` with an explicit per-row `isCancelled` flag (`innago-rent-accounting` spec `01-rent-agreement.md` v41), confirmed by the user to be simpler. `save()` now sends **every** previewed row (deletion no longer filters `scheduleRows`), each tagged `isCancelled: this.deletedRowDates().has(row.scheduledDate)`; `excludedScheduleDates` is removed from the request model entirely. **Also fixes a real, separate bug found in the same pass**: the backend's `ScheduleStatus` is a smart enum deliberately serialized PascalCase (`"Cancelled"`, `"Planned"`), not passed through the lowercase enum-value convention the rest of the wire uses — every `status === 'cancelled'` comparison added in v1 was comparing against the wrong case and had **never matched anything** since v1 shipped, so the cancelled-row badge/exclusion logic was silently inert the whole time. Fixed with a case-insensitive `isCancelledStatus()` helper. | [2026-08-13T1900-01-rent-agreement-edit-ui-schedule-row-cancel-flag](../../plans/rent-agreements/2026-08-13T1900-01-rent-agreement-edit-ui-schedule-row-cancel-flag.md) |
| v2 | 2026-08-13 | — | *(Reverted in full by v3 — kept for history.)* **The create-page ("Add Lease") row-delete action now tells the backend which rows it deliberately removed, instead of just omitting them.** `save()` sends the new `excludedScheduleDates` field (the `scheduledDate`s already tracked in `deletedRowDates`) alongside the unchanged, already-filtered `scheduleRows` — the backend's `POST /rent-agreements` gained a fixed-term schedule-anchor cross-check the same day (`innago-rent-accounting` spec `01-rent-agreement.md` v39) that could not otherwise tell a deliberate pre-save deletion apart from a client bug that silently dropped a row, and rejected both identically. | [2026-08-13T1800-01-rent-agreement-edit-ui-schedule-anchor-exclusions](../../plans/rent-agreements/2026-08-13T1800-01-rent-agreement-edit-ui-schedule-anchor-exclusions.md) |
| v1 | 2026-08-13 | — | **The edit page now renders a cancelled schedule row instead of it silently vanishing.** `GET`/`PUT …/terms` (backend spec `01-rent-agreement.md` v38) stopped soft-deleting a cancelled row, so it now arrives in `scheduleRows` with `status: "cancelled"`. The edit form tracks `cancelledRowDates` (mirroring the existing `frozenRowDates` pattern), renders such a row greyed out with a "cancelled" badge and no row-menu (display-only — no restore action), excludes its rent from the schedule summary total, and — critically — excludes it from what gets resubmitted on save: resubmitting a cancelled row's anchor would create a **new** row server-side rather than restore the old one. | [2026-08-13T1400-01-rent-agreement-edit-ui-cancelled-rows](../../plans/rent-agreements/2026-08-13T1400-01-rent-agreement-edit-ui-cancelled-rows.md) |

## Overview

`RentAgreementCreateComponent` (`src/app/rent-agreements/rent-agreement-create.component.ts`)
is the single Angular component behind both the "Add Lease" (create) and "Edit Lease" (edit) pages
— reached via `/rent-agreements/create` and `/rent-agreements/:id/edit` respectively. It drives a
rent-schedule preview, lets the user hand-edit or delete individual rows before saving, and posts
to the `innago-rent-accounting` Billing API's `POST /rent-agreements` (create) or
`PUT /rent-agreements/{id}/terms` (edit) endpoints.

This spec covers the UI's own behaviour and its wire contract with that backend — the backend's
own behaviour (reconcile rules, soft-cancel semantics, validation) is specified separately in the
`innago-rent-accounting` repo's `docs/specs/01-rent-agreement.md`, which this document cross-links
rather than duplicates.

## In Plain English

*Added at v21, for the reviewer of this version. Earlier versions of this spec carry no such block —
the conventions ask for one on a substantive revision, and a change that can make the create screen
stop working entirely is the version worth starting with.*

**The problem.** When somebody saves a new lease, the service behind this screen needs to know two
things that are not about the lease at all: which account the lease belongs to, and which property
owner it is for. Until now the screen sent the owner buried inside the lease details, and never sent
an account because it had no idea one existed. The service has changed where it looks for both.

**Who uses this.** A property manager filling in the "Add Lease" screen. They never see or type either
value — the screen supplies both — so the only way they experience this change is if it goes wrong.

**What happens, one real example.**
1. The manager opens "Add Lease" and fills in rent, dates and frequency as usual.
2. Behind the screen, two identifiers already exist for this lease: a property owner
   (`4a72…`, invented by the screen the moment it opened) and, new in this version, an account
   (`9f1c…`, invented the same way).
3. The manager presses Save.
4. The screen sends the lease details as before — minus the owner — and sends both identifiers
   alongside the request rather than inside it.
5. The service stores the lease, filing it under that account and that owner. The manager sees the
   same success they have always seen; nothing on screen looks different.

**What this changes in the data.** Nothing the manager can see. The same lease is saved, with the same
owner recorded against it. One extra identifier — the account — is now recorded too. No screen gains a
field and no screen loses one. **(v22)** A third identifier is added to the same settings box, saying
*who is doing this*, so every record the service saves notes the person behind it. And the fee-name
picker stops naming an owner of its own — it now uses the one in the box, like everything else does.

**(v22) The thing this version is really about.** Until now the fee-name picker asked for one owner's
list while the rest of the screen said it was working as another. Nothing complained: the list simply
came back holding only the shared entries, and a new fee name was filed under the owner in the box
rather than the one on screen. **A screen that looks right while answering for the wrong person is
worse than one that plainly fails**, so when the two disagree the screen now says so.

**The three most likely ways this goes wrong.**
1. This screen and the service are released at different moments, and **every attempt to save a new
   lease is refused** until both are out — the one failure a person notices within minutes.
2. The account or owner is not published before the save runs, so the request goes out without them and
   is refused for a reason that mentions a header the manager has never heard of.
3. The identifiers are attached to requests that were never meant to carry them, which is harmless
   today but hides the mistake until something starts reading them.

## What You Need to Decide

| # | Decision | Options | Recommendation | Status |
|---|----------|---------|----------------|--------|
| D1 | Where the two identifiers come from | Invented by the screen / one fixed value per environment / **typed by the tester** | **Typed by the tester**, in a settings box, with an invented value as the starting default so nothing is ever sent empty. *Reversed 2026-09-14 (second pass)* — this app is a **test harness that never reaches production**, and its whole purpose here is to drive a real environment. A value the tester cannot set cannot be pointed at a real account | Settled 2026-09-14 — see *Clarifications* |
| D2 | How the two identifiers are attached to the request | On the one save that needs them / centrally, on every request | **Centrally.** It is the same place a real sign-in token would be attached, so the wiring outlives the stand-in | Settled 2026-09-14 — see *Clarifications* |
| D3 | Should the tester be able to see and change both values? | — | **Yes** — that is the point of D1's reversal. In a production client these would never be visible; this is not one | Settled 2026-09-14 — see *Clarifications* |
| D4 | Do the typed values survive a page reload? | Remembered in the browser / re-typed each time | **Remembered.** A tester who re-types two GUIDs on every reload will stop using the box, and then every request goes out under the default again without anyone noticing | Standard, no input needed |

| D5 | **(v22)** When the record on screen belongs to a different owner than the settings box, what should happen? | Warn and carry on / silently use the box / block the screen | **Warn and carry on.** Blocking makes a test harness unusable the moment a tester is looking at data from another owner, which is a normal thing to do. Using it silently is today's behaviour and is exactly the defect — the catalog answers for the wrong owner and nothing says so. A warning naming both values lets the tester decide in one glance whether the picker they are about to use means anything | **Answered 2026-09-14 — warn and carry on.** Blocking makes the harness unusable the moment a tester legitimately looks at another owner’s data; using the box silently is today’s defect. **How long this matters:** the backend answered its own D5 the same day — cross-owner reads will be refused with a `404` once its milestones M5–M7 ship — so after that a mismatched record simply will not load and this warning becomes near-unreachable. It is built for the window before then, and it falls silent on its own afterwards rather than needing removal |
| D6 | **(v22)** Should `IdentityId` be required before the screen will save? | Required here / optional, matching the service | **Optional.** The service deliberately never refuses a write for its absence (FR-129d) — it records the row as unattributed and warns. A client that refused would be stricter than the contract, and would block a tester over an audit field rather than over anything they can see | Standard, no input needed |

## Assumptions to Confirm

- **(v22) A tester who cares which owner's catalog they see will put that owner in the box.** The
  warning in 13b tells them when it matters; it does not change the value for them. *If wrong — if
  testers read past the warning:* the line-item picker shows only system-defined entries and new
  entries are filed under the box's owner. Nothing is corrupted for real users, because this
  application is a test harness, but a tester may conclude a catalog is empty when it is merely being
  asked for under the wrong owner.
- **(v22) Sending `IdentityId` changes nothing a tester can see.** It is recorded in two columns that
  no screen in this application displays. *If wrong:* nothing visible breaks; the cost of it being
  absent is that server-side rows say nobody wrote them, which is the state everything was in before
  backend v91 anyway.
- **This screen and the service behind it are released together.** *If wrong:* nobody can create a
  lease until both are out. Every attempt is refused immediately; nothing is half-saved and no existing
  lease is affected, but the "Add Lease" screen is unusable for the whole gap. **This is the only
  assumption in this version that has a visible consequence**, and it is the reason the version exists
  at all.
- **Sending the two identifiers on requests that do not need them is harmless.** The service ignores
  information it was not expecting. *If wrong:* an unrelated screen starts behaving differently for a
  reason that has nothing to do with what the manager did there.

## Clarifications

### Session 2026-09-14

- **D1 — Where the account identifier comes from:** invented by the screen, seeded the same way the
  property owner, property and unit identifiers already are. (Rejected: a fixed value per environment,
  which cannot be varied without a rebuild and makes every lease in a build share one account; and a
  field the user fills, which puts work on a screen that no real user will ever do once sign-in
  supplies the value.)
- **D2 — How they are attached:** centrally, for every call to the service, rather than on the single
  save that needs them. (Rejected: attaching them only to the save, which is smaller and touches
  nothing else — the central approach was chosen because it is where a sign-in token will later go, at
  the stated cost of putting the identifiers on requests that ignore them.)

### Session 2026-09-14 (second pass — a settings box, because this is a test harness)

- **D1 is reversed.** The identifiers are **typed by the tester** in a settings box, not invented and
  hidden. The user's reason is the one that settles it: *"bus hum testing kregenge kahi setting me text
  box add kr do wo value hum add kr denge jise ui hamara all env pe test ho jayega"* — and *"UI hamara
  test UI hai wo prod pe nhi jayega"*. This application exists to drive real environments; an
  identifier nobody can set cannot be pointed at a real account, which makes the whole change
  untestable against anything but itself.
- **D3 follows it.** Both values are visible and editable. The first pass argued a field would be
  "built now and deleted later" — true of a production client, and this is not one.
- **An invented value remains the default.** The box starts populated, so a tester who ignores it still
  sends well-formed headers and still gets a `201`. What changes is that they *can* override it.
- **Scope confirmed: dev and qa only.** *("dev and qa only.")* Those are the two environments whose
  gateway now forwards the claim headers, and the only two this box is meant to drive.

## Business Scope

A property manager builds or edits a lease's rent schedule interactively: the schedule
auto-generates from the lease terms (dates, frequency, rent), and the manager can hand-adjust an
individual row's rent/due-date, delete a row entirely (e.g. skip a specific month), or — on the
edit page — see which rows the server has already frozen (billed) or cancelled. The UI must give
an honest, real-time picture of what will actually be saved, and must not silently lose or
resurrect a row the user acted on.

## Functional Requirements

1. The system shall auto-generate a schedule preview whenever the form holds enough information to
   do so, with no manual "Generate" button.
2. The system shall let the user delete an individual previewed row before saving; a deleted row is
   excluded from the saved schedule.
3. The system shall let the user hand-edit an individual row's rent and/or due date before saving.
4. On the edit page, the system shall render a row the server reports as frozen (`isFrozen`) as
   locked — no edit or delete affordance at all — and a row the server reports as cancelled
   (`status: "cancelled"`) with a "cancelled" badge and a **Restore** affordance in place of the
   ordinary row-menu (v4).
5. On the edit page, a cancelled row's rent shall not be included in the schedule summary's total
   invoice count or total amount, unless and until the user restores it.
6. On the edit page, a cancelled row the user has not restored shall never be resubmitted in
   `PUT …/terms`'s `scheduleRows`, matching that endpoint's absence-means-removal contract. Once
   restored (v4), it is resubmitted like any other row — its resubmission is itself the restore
   signal the backend acts on (`innago-rent-accounting` spec v42).
7. On the create page, a row the user deleted before saving shall still be submitted in
   `POST /rent-agreements`'s `scheduleRows`, tagged `isCancelled: true`, so the backend persists it
   directly with a cancelled status instead of treating it as a dropped row (v41).
8. The system shall not lose a user's row deletion when an unrelated field change (e.g. the rent
   amount) triggers a fresh auto-preview: a deletion survives whenever the newly generated preview's
   row dates are unchanged from the previous preview's.
9. Every comparison against a row's `status` field shall be case-insensitive — the backend's
   `ScheduleStatus` is a smart enum that is deliberately **not** lowercased on the wire (unlike
   `leaseTermType`/`frequency`), so it arrives as `"Planned"`/`"Cancelled"`, not `"planned"`/
   `"cancelled"` (v3).

10. The system shall **surface every entry in `blockedRemovals`** after an edit save, and shall **not
    navigate away** while any is present — the save succeeded and did less than it was asked to, which
    is a state the user has to be shown rather than one to leave behind (backend spec 01 FR-124, in
    FR-103's filter shape). Each entry is rendered with the server's own `message`, verbatim, and with
    the `invoiceId` it names when it has one. The refused row shows as **not** cancelled, because the
    response re-seeds the rows and the server kept it planned.
    **Reported from the running application 2026-09-08** — *"once I had created the invoice, deleting
    the schedule row started failing silently"*. It never failed: `PUT …/terms` answered `200`, applied
    every other change, and named the refusal with a ready-to-display message and the invoice standing
    in the way. **`blockedRemovals` appeared nowhere in this application** — no model field, no
    component code, no template branch — so the report was received and discarded, and the row simply
    reappeared planned with no explanation.
    **Holding the navigation is the part that makes this a fix.** The save moved straight to the
    tenants screen on success, so a report rendered here was rendered onto a page the user never saw.
    Staying puts the row, the reason and the invoice in front of them together. When nothing is
    refused, the navigation is unchanged.
    **The message is not composed here.** The wording belongs to whoever owns the rule, and a client
    that paraphrases it drifts from the rule the moment the rule changes — the backend added
    `invoiceId` for this purpose at its v45, *"so a client can offer to remove the invoice rather than
    leaving the owner stuck at a refusal with no next step"*.
    **The invoice is named, not acted on.** Removing an invoice is destructive and belongs behind the
    confirm flow `04-invoice-list-ui.md` already has, not behind a small button on this screen. That
    leaves the owner one navigation short of the remedy, which is a deliberate trade recorded here so
    it is not mistaken for an oversight.
11. **v20** — The system shall surface both of the preview's reports **before** a save, and shall
    replace them on every preview rather than accumulating them:
    - every entry in `warnings` — the server's `message` **verbatim**, plus the row's anchor when the
      warning names one — worded so it reads as a consequence of saving, not as a fault in the
      schedule;
    - every entry in `blocked` — the row's anchor, the server's `reason`, and the invoice status when
      given — worded so it is clear the rest of the save still applies.
    Neither shall be rendered as a preview failure, since the preview succeeded; `previewError` keeps
    that meaning alone. When a report is absent, `null` or empty, nothing is shown.
    **Rendered above the schedule table.** Their entire value is being read while the change can still
    be undone — the same facts after a save are requirement 10's `blockedRemovals`, by which time the
    decision has been made.
12. **v21** — The system shall send the two caller-scope identifiers to the Billing API as **request
    headers**, and shall stop sending the property owner inside the create request body. This is the
    client half of backend `01-rent-agreement.md` v89 FR-127 and v90 FR-128, and it is a **breaking
    change on both sides at once**.
    - **(a) The body loses a field.** `CreateRentAgreementRequest` shall no longer carry
      `propertyOwnerId` (`rent-agreement.models.ts`), and `RentAgreementCreateComponent` shall stop
      placing it there when it builds the request (component line 1245). The **form control stays** —
      `AdditionalChargePanelComponent` and the line-item pickers bind to it for catalog scoping (lines
      739, 752), and the edit page patches it from the loaded agreement (line 442). Only the body
      placement goes.
    - **(b) A settings box the tester fills in.** *(Reversed from the first pass — see D1.)* The shell
      shall carry two text inputs, one per identifier, visible from every screen. Both start at an
      invented value so a request is never sent with an empty header, and both are editable so the
      tester can point this application at a real account and a real property owner in **dev or qa**.
      The typed values shall be remembered across reloads (D4). No `accountId` form control is added to
      the lease screen — the settings box replaces that idea entirely.
    - **(c) A published scope, because an interceptor cannot read an input.** A small injectable shall
      hold the current account and property owner, seed them from what was remembered (or from a fresh
      invented value when nothing was), and expose a setter the settings box writes to. This is the only
      new structure v21 introduces, and it is what lets one box feed every request.
    - **(d) One interceptor attaches both.** An HTTP interceptor registered via
      `provideHttpClient(withInterceptors(...))` in `app.config.ts` — which registers **none** today —
      shall add **`OrganizationUid`** and **`PropertyOwnerUid`** to outbound requests *(corrected in
      v22: this clause said `OrganizationId` and `PropertyOwnerId`, which the code never sent — those
      claims are `long`s in the platform's token and both backend columns are `uuid`, so the plain
      names would have returned `400` on every create. v21's changelog row records the reversal; only
      this clause was left behind.)* It shall be **scoped to `environment.apiBaseUrl`**, and shall add
      nothing when no scope has been published, so a request that runs before the create screen has
      initialised carries no empty header rather than an invalid one.
    - **(e) The known cost, accepted rather than hidden.** Because the interceptor is central (D2), both
      headers ride **every** Billing API call — the invoicing list, the line-item pickers,
      `PUT …/terms`, the lifecycle calls — none of which read them. The backend ignores unknown headers,
      so nothing breaks; this clause exists so the next reader knows it is deliberate and not an
      oversight, and knows where to look if a header ever starts being read somewhere unexpected.
    - **(f) Release coupling.** This requirement cannot be shipped alone in either direction. Released
      before the backend, every save is refused by a service still expecting `propertyOwnerId` in the
      body; released after, every save is refused for the missing headers. Neither leaves partial data
      — see *Assumptions to Confirm*.

13. **v22** — The system shall stop telling the Billing API which owner's line-item catalog to read,
    because the service now takes that from the header this application already sends; and it shall
    send a third identifier so the rows it writes record who wrote them.

    **The failure this prevents is a screen that looks like it works.** Backend `02-invoicing.md` v39
    (FR 47) moved the catalog's owner scope out of the query string. This application already attaches
    `PropertyOwnerUid` to every API call, so no request is refused — but it *also* passes an owner as
    an argument, and that argument is **the owner of the record on screen**, while the header carries
    **whatever is in the settings box**. When they differ the catalog silently resolves under the box's
    owner: the picker shows only the system-defined entries, and any new entry is filed under an owner
    nobody chose. Nothing errors, so nothing draws attention to it.

13a. **The argument goes.** `LineItemsService.list` and its get-or-create counterpart shall take no
     owner parameter and shall send none — not in the query string, not in the body. Their callers
     (`additional-charge-panel.component.ts`, `update-proposed-invoice.component.ts`) shall stop
     passing one. The header is the single source, which is the whole point of the backend change.

13b. **The mismatch becomes visible (D5).** When a screen has loaded a record whose `propertyOwnerId`
     differs from the settings box's, the system shall show a plain warning naming both values and
     saying the catalog will resolve under the box's owner. **This is the requirement's real content.**
     Removing the argument is a two-line change; the reason this version exists is that the resulting
     condition is otherwise invisible, and a test harness whose scope silently disagrees with its data
     produces results a tester will trust and should not.

13c. **The acting user joins the box.** A third input, **`IdentityId`**, shall sit beside the other two
     and be attached by the same interceptor. Backend `01-rent-agreement.md` v91 FR-129 stamps it into
     `created_by` and `modified_by` on every row. It follows the same rules as the other two — seeded
     so nothing is ever sent empty, editable, remembered across reloads.

13d. **It is not required, and that difference is deliberate.** The backend **never refuses a write**
     for a missing or malformed `IdentityId` (FR-129d); it records the row as unattributed and logs a
     warning. So unlike the two scope headers, this one failing costs an honest audit trail rather than
     a working screen. It is listed here so nobody later "fixes" a passing save by making this header
     mandatory on the client.

13e. **The form control still stays.** As in 12a, `propertyOwnerId` remains a form control on the lease
     screen — the create flow still needs a value to send in its own header context, and the edit page
     still patches it from the loaded agreement so 13b can compare it. What goes is passing it *to the
     catalog service*, not the field itself.

## Constraints

- The preview endpoint (`POST /rent-schedule/preview`) is stateless — it never receives back a
  prior preview's deletions or hand-edits, so every preview response is authoritative for row dates
  and amounts, and the component must reconcile its own client-side deletion/edit state against it
  rather than trusting the response to already reflect them.
- No separate "cancel"/"restore" endpoint exists for either the create or the edit flow. The create
  flow expresses a pre-save deletion via the row's own `isCancelled` flag (v41); the edit flow's
  `PUT …/terms` expresses removal by simple omission, per that endpoint's own
  absence-means-removal contract (D8/FR-031) — the two are deliberately different mechanisms.

## Contract

### Component state (relevant signals)

| Signal | Type | Meaning |
|--------|------|---------|
| `deletedRowDates` | `Set<string>` | `scheduledDate`s the user deleted this session (create or edit), before saving |
| `frozenRowDates` | `Set<string>` (edit only) | `scheduledDate`s the server reports as frozen (`isFrozen`) |
| `cancelledRowDates` | `Set<string>` (edit only) | `scheduledDate`s the server reports as already cancelled (`status`, compared case-insensitively) |
| `manuallyChangedRowDates` | `Set<string>` | `scheduledDate`s whose rent was hand-edited this session |

### Outbound request headers (v21)

Attached by the scope interceptor to every request whose URL starts with `environment.apiBaseUrl`, and
only when a scope has been published (requirement 12d).

| Header | Value | Sent on |
|--------|-------|---------|
| `OrganizationId` | The create form's `accountId` — `crypto.randomUUID()`, or the loaded agreement's account in edit mode once the backend returns one | Every Billing API request. **Read only by `POST /rent/agreements`** (backend FR-127); ignored elsewhere (requirement 12e) |
| `PropertyOwnerId` | The create form's `propertyOwnerId` — unchanged in origin, changed only in where it travels | Every Billing API request. **Read only by `POST /rent/agreements`** (backend FR-128); every other endpoint reads the owner off the agreement it loads |

### Outbound request shapes (see `rent-agreement.models.ts`)

**v21 — `CreateRentAgreementRequest.propertyOwnerId` is REMOVED.** It was a required field up to v20;
it is now the `PropertyOwnerUid` header above (requirement 12a, backend FR-128). The backend ignores
a body that still carries it, so the failure mode of a stale build is the *missing header*, not a
rejected field. `RentAgreementDetailResponse.propertyOwnerId` is **unchanged** — `GET` still returns it,
and the edit page still patches the form from it.

`ScheduleRowCreationRequest.isCancelled?: boolean` — set from `deletedRowDates` at save time
(v41). The row is always submitted; this flag, not the row's presence, is how a create-time
deletion reaches the backend.

`RentAgreementScheduleRowResponse.status?: 'planned' | 'invoiced' | 'skipped' | 'cancelled'` —
present on the create response and on `GET`/`PUT …/terms`'s echoed rows, but compared
case-insensitively client-side (`isCancelledStatus()`, v3) since the wire value is actually
PascalCase (`"Planned"`, `"Cancelled"`).

## Out of Scope

- **Any sign-in, token, or real account (v21)** — this application has no authentication and this
  version adds none. Both scope ids are stand-ins invented by the screen (requirement 12b). When
  sign-in arrives it supplies them and the two headers retire entirely; the interceptor is the seam
  that makes that a small change, which is the whole reason it was chosen over attaching them to one
  call.
- ~~**Showing or editing either scope id (v21, D3)**~~ — **this bullet was already false when it was
  written, and is withdrawn in v22.** It says "no input, no display", but v21's own requirement 12b
  adds a settings box with both ids, editable and remembered, after D1 was reversed mid-version. The
  reversal reached the requirement and the code and not this list. The ids **are** shown and editable,
  and v22 adds a third.
- ~~**Moving `propertyOwnerId` anywhere else (v21)**~~ — **superseded by v22, requirement 13.** It said
  the owner "remains a **query parameter** on the invoicing and line-item calls, which the backend did
  not change". The backend then changed exactly that: `02-invoicing.md` v39 FR 47 moved it to the
  `PropertyOwnerUid` header on `GET`/`POST /line-items` and `GET /invoices`. It does still remain a
  **form control**, bound for catalog scoping and patched from the loaded agreement (13e) — what it
  stops being is a parameter this application sends.
- **Choosing the catalog's owner independently of the settings box (v22, D5)** — the header is one
  value for the whole application, so the picker answers for whoever the box names. Letting a screen
  override it per request would reintroduce two sources for one fact, which is what FR 47 removed. The
  mismatch is surfaced (13b) rather than worked around.
- **Displaying who created or changed a record (v22)** — `IdentityId` is sent so the service can
  record it; no screen here reads `created_by` or `modified_by` back, and the backend returns neither
  (FR-129e).
- **The backend change itself (v21)** — `01-rent-agreement.md` v89–v90 in `innago-rent-accounting`,
  with its own plan. Named here as the other half of one release, not as work this spec covers.
- The backend's soft-cancel/restore semantics and the `PUT …/terms` reconcile matrix — specified in
  `innago-rent-accounting`'s `docs/specs/01-rent-agreement.md` (v38, v42).
- A restore action on the create ("Add Lease") page for a row cancelled via `isCancelled` — that
  page's Save has not happened yet, so "restoring" a not-yet-persisted row is just un-deleting it,
  already covered by the pre-existing `deletedRowDates`/`restoreRow()` mechanism (predates this spec).
- Extending the `isCancelled`-flag mechanism to `PUT …/terms` — that endpoint expresses both removal
  (by omission) and restoration (by resubmission) without needing a flag at all.
