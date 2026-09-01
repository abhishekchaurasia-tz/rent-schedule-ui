import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { toIsoDate, parseIsoDate } from '../shared/date.util';
import { LineItemResponse, LineItemScope } from '../rent-agreements/line-item.models';
import { NewItemTypeFormComponent } from '../rent-agreements/new-item-type-form.component';
import { LineItemsService } from '../rent-agreements/line-items.service';
import { RentAgreementsService } from '../rent-agreements/rent-agreements.service';
import {
  ProposedInvoiceDetailResponse,
  UpdateProposedInvoiceRequest,
  UpdateProposedLineRequest
} from '../rent-agreements/rent-agreement.models';
import { InvoiceDetailResponse, InvoiceLineResponse } from './invoice.models';
import { InvoicesService } from './invoices.service';

/** Matches a canonical 8-4-4-4-12 UUID, case-insensitive — same shape check the other id screens use. */
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The **Update Invoice** page: corrects one invoice's due date, its line set, or both.
 *
 * Specified in `docs/specs/rent-agreements/03-update-proposed-invoice-ui.md`.
 *
 * **The read and the write are different resources, and that is the shape of this screen.** What a
 * person recognises is an *invoice* — it has a number, a total, a balance — so that is what they paste
 * an id for, and `GET /api/v1/invoices/{id}` is what answers. What the backend actually corrects is the
 * *proposal* behind that invoice, through
 * `PATCH /rent/agreements/{rentAgreementId}/proposed-invoices/{proposedInvoiceId}` — which since
 * `06-unified-invoice-generation.md` FR 101 carries a correction onto an already-issued invoice by
 * appending to its event stream. Both ids come off the read; neither is ever typed.
 *
 * **This is a read-modify-write, and the `lineId`s are what make it one.** A present `lines` array on
 * that endpoint is the *complete* new set: an entry carrying a `lineId` revises that line, an entry
 * without one adds a line, and a live line the array omits is soft-deleted. So every row here holds the
 * `lineId` it was seeded with, and submit sends every row it is showing. A screen that rebuilt the
 * lines from scratch, or sent only the ones the user touched, would silently delete the rest.
 *
 * **Nothing unchanged is sent.** Absence means "leave unchanged", so a due-date-only correction omits
 * `lines` entirely rather than resubmitting them — which keeps every line's identity untouched and
 * stops the screen claiming an edit the user did not make.
 */
@Component({
  selector: 'app-update-proposed-invoice',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    NewItemTypeFormComponent
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './update-proposed-invoice.component.html',
  styleUrl: './update-proposed-invoice.component.scss'
})
export class UpdateProposedInvoiceComponent implements OnInit {
  /** The pasted invoice id. Shape-checked here; whether it exists is the load's answer. */
  readonly invoiceIdInput = new FormControl('', { nonNullable: true });

  readonly idError = signal<string | null>(null);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  /** The loaded invoice, held whole — it is both the display context and the PATCH's address. */
  readonly invoice = signal<InvoiceDetailResponse | null>(null);

  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

  /** Set when submit was refused locally, with nothing sent — a no-op edit or an invalid row. */
  readonly submitNotice = signal<string | null>(null);

  /** The corrected proposal the server answered with, or `null` before the first successful save. */
  readonly updatedProposal = signal<ProposedInvoiceDetailResponse | null>(null);

  /**
   * The line-item catalog for this invoice's owner, fetched on load — the same
   * `GET /api/v1/line-items` catalog the ADD ADDITIONAL FEE panel picks from, so an item is named the
   * same way wherever it is chosen.
   */
  readonly lineItems = signal<LineItemResponse[]>([]);

  /** Index of the row whose "Select Type" menu is open, or `null` if none. */
  readonly openItemPickerIndex = signal<number | null>(null);

  /**
   * Viewport coordinates for the open picker, from the clicked button's `getBoundingClientRect()`.
   *
   * Rendered `position: fixed` as a sibling of the form rather than a child of the row, matching the
   * fee panel: an ancestor's `overflow` clips a descendant's paint, fixed positioning included, so a
   * menu nested inside a scrollable table gets cut off.
   */
  readonly itemPickerPosition = signal<{ top: number; left: number } | null>(null);

  /** Whether the open picker is showing its "add a new item type" form instead of the catalog list. */
  readonly addingNewItemType = signal(false);



  readonly form: FormGroup;

  /**
   * What the form was last seeded with — the baseline every change is diffed against.
   *
   * Held separately from {@link invoice} because after a successful correction the baseline becomes the
   * *returned proposal*, not the originally loaded invoice: a second correction must be measured
   * against what the server now holds, or it would resend the first correction's changes as if they
   * were new.
   */
  private baseline: { dueDate: string; lines: UpdateProposedLineRequest[] } | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly invoices: InvoicesService,
    private readonly agreements: RentAgreementsService,
    private readonly lineItemsService: LineItemsService,
    private readonly route: ActivatedRoute
  ) {
    this.form = this.fb.group({
      // A native `Date`, because the Material datepicker binds one. It is converted back to the wire's
      // "YYYY-MM-DD" by `toIsoDate` at submit time — never by `Date#toISOString`, which shifts to UTC
      // and lands on the previous day for anyone west of Greenwich.
      dueDate: [null as Date | null, Validators.required],
      lines: this.fb.array([])
    });
  }

  /**
   * Loads the invoice named by `?invoiceId=`, when the page was reached from the Invoices list.
   *
   * The parameter is put through the same `load()` as a typed id — including its GUID check — rather
   * than trusted because it came from a link: a hand-edited URL is exactly as untrusted as typing.
   */
  ngOnInit(): void {
    const invoiceId = this.route.snapshot.queryParamMap.get('invoiceId');
    if (invoiceId) {
      this.invoiceIdInput.setValue(invoiceId);
      this.load();
    }
  }

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  /**
   * Whether this invoice can be corrected at all.
   *
   * `proposedInvoiceId` is `null` on every invoice raised before the proposal pipeline existed — a
   * permanent fact, since no backfill was run and none is planned — and such an invoice has nothing for
   * the correction route to address. Reported up front rather than discovered as a failed request.
   */
  get isCorrectable(): boolean {
    const invoice = this.invoice();
    return !!invoice?.proposedInvoiceId && !!invoice.rentAgreementId;
  }

  /** Reads a line row's amount for display. Never a control, and never sent — the server derives it. */
  lineAmount(index: number): number {
    const group = this.lines.at(index);
    return Number(group.get('quantity')!.value || 0) * Number(group.get('rate')!.value || 0);
  }

  /** The edited line set's total, so the screen can show what the correction comes to before sending. */
  get linesTotal(): number {
    return this.lines.controls.reduce((sum, _, index) => sum + this.lineAmount(index), 0);
  }

  /** Loads the invoice and seeds the form from it. */
  load(): void {
    const id = this.invoiceIdInput.value.trim();

    if (!id) {
      this.idError.set('Enter an invoice id.');
      return;
    }

    if (!GUID_PATTERN.test(id)) {
      this.idError.set('That is not a valid id. It should look like 8f14e45f-ceea-467e-bd9f-000000000001.');
      return;
    }

    this.idError.set(null);
    this.loadError.set(null);
    this.resetLoadedState();
    this.loading.set(true);

    this.invoices.getById(id).subscribe({
      next: (invoice) => {
        this.invoice.set(invoice);
        this.seedForm(invoice.dueDate, invoice.lines);
        this.loadLineItems(invoice);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(UpdateProposedInvoiceComponent.describeError(err));
      }
    });
  }

  /**
   * Fetches the item catalog this invoice's lines may be typed from.
   *
   * **Scoped by the invoice's own category**, mirroring the fee panel's `depositOnly` mode: a deposit
   * invoice may only carry deposit-shaped items, and the backend enforces that with its own allowlist.
   * Offering the wrong half of the catalog would only produce a `422` the user could not have
   * predicted.
   *
   * A failure leaves the catalog empty rather than failing the load. The invoice is still correctable —
   * its due date, its quantities and rates all work — and only the type picker is unavailable, which
   * the menu says for itself.
   */
  private loadLineItems(invoice: InvoiceDetailResponse): void {
    const scope: LineItemScope = this.isDepositInvoice ? 'DepositOnly' : 'AllExcludingCredit';

    // The **income-list** payload: `isFromIncomeList`, and nothing else.
    //
    // `isHOATerm` is deliberately not sent. The backend admits `HOAFee` only when both flags are true,
    // so setting it would widen the catalog — but it is a claim about the *lease*, that its terms are
    // HOA terms, and this screen has no way to know that. Asserting it on every invoice would put HOA
    // items in front of every property owner on the strength of a guess. Whether HOA items appear is
    // then the backend's rule, not this screen's invention.
    this.lineItemsService
      .list(invoice.propertyOwnerId, scope, { isFromIncomeList: true })
      .subscribe({
        next: (items) => this.lineItems.set(items),
        error: () => this.lineItems.set([])
      });
  }

  /**
   * Whether this invoice bills a deposit, which decides both the catalog scope and whether a new item
   * type may be created at all.
   *
   * Compared case-insensitively: `category` is a smart enum's `Name` on the backend, so it stays
   * PascalCase while its enum-valued neighbours arrive snake_case.
   */
  get isDepositInvoice(): boolean {
    return this.invoice()?.category?.toLowerCase() === 'deposit';
  }

  /**
   * Whether the picker offers "+ Add Item Type".
   *
   * Never on a deposit invoice: a deposit catalog row must be system-defined
   * (`DepositItemMustBeSystemDefined`), so the affordance could only ever be refused. Same rule the fee
   * panel applies in its `depositOnly` mode.
   */
  get canAddItemType(): boolean {
    return !!this.invoice() && !this.isDepositInvoice;
  }

  /** Looks up a fetched catalog entry by id. */
  private findLineItem(lineItemId: string): LineItemResponse | undefined {
    return this.lineItems().find((item) => item.id === lineItemId);
  }

  /**
   * The label on row `index`'s "Select Type" button.
   *
   * Prefers the catalog entry's display name, and falls back to the row's stored `itemType`. The
   * fallback is the ordinary case for a **rent** line, which the backend raises with no `lineItemId` at
   * all — showing "Select Type" there would suggest nothing had been chosen when in fact the line is
   * perfectly well typed.
   */
  itemDisplayLabel(index: number): string {
    const group = this.lines.at(index);
    const lineItemId = group.get('lineItemId')!.value;
    const itemType = String(group.get('itemType')!.value ?? '');

    if (lineItemId) {
      return this.findLineItem(lineItemId)?.name ?? itemType ?? 'Select Type';
    }

    return itemType || 'Select Type';
  }

  /** Whether row `index` still has no item type — used to grey the button as a placeholder. */
  isItemUnset(index: number): boolean {
    return !String(this.lines.at(index).get('itemType')!.value ?? '').trim();
  }

  toggleItemPicker(index: number, event: MouseEvent): void {
    if (this.openItemPickerIndex() === index) {
      this.closeItemPicker();
      return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.itemPickerPosition.set({ top: rect.bottom, left: rect.left });
    this.openItemPickerIndex.set(index);
  }

  closeItemPicker(): void {
    this.openItemPickerIndex.set(null);
    this.itemPickerPosition.set(null);
    this.addingNewItemType.set(false);
  }

  /** Switches the open picker to its "add a new item type" form. */
  startAddingNewItemType(): void {
    if (!this.canAddItemType) {
      return;
    }
    this.addingNewItemType.set(true);
  }

  /** Abandons the add form and returns to the catalog list, keeping the picker open. */
  cancelAddingNewItemType(): void {
    this.addingNewItemType.set(false);
  }

  /**
   * Adopts the catalog entry the shared add form resolved, and selects it on row `index`.
   *
   * Into the local catalog first, so the row's label resolves by id like any other pick and the entry
   * is available to this invoice's other lines without a refetch. Then through the ordinary
   * {@link selectLineItem}, so a created item and a picked one are indistinguishable from here on —
   * including the description seeding.
   */
  onItemTypeCreated(index: number, item: LineItemResponse): void {
    this.lineItems.update((items) =>
      items.some((existing) => existing.id === item.id) ? items : [...items, item]
    );

    this.selectLineItem(index, item);
  }

  /**
   * Types row `index` from a catalog entry, setting **both** the catalog id and the item type.
   *
   * Both, because the endpoint asks them separately: `itemType` is parsed into the `InvoiceItemType`
   * enum and checked against the deposit allowlist, while `lineItemId` names the catalog row — and is
   * *required* on every line of a deposit-category proposal. Setting only one would leave a line the
   * server either cannot classify or cannot accept.
   */
  selectLineItem(index: number, lineItem: LineItemResponse): void {
    const group = this.lines.at(index);
    group.patchValue({ lineItemId: lineItem.id, itemType: lineItem.itemType });

    // The picked item's name seeds the description, but **only when it is still empty**. Picking an
    // item is nearly always followed by typing that same word, so this saves the common keystroke —
    // while an existing line, which is what most of this screen's rows are, keeps the description the
    // property owner actually wrote. That is the line the tenant reads on the invoice, and overwriting
    // it from a type correction would be a silent loss.
    const description = group.get('description')!;
    if (lineItem.name && !String(description.value ?? '').trim()) {
      description.setValue(lineItem.name);
    }

    this.submitNotice.set(null);
    this.closeItemPicker();
  }

  /** Adds a blank row. It carries no `lineId`, which is what tells the server to add a line. */
  addLine(): void {
    this.lines.push(this.buildLineGroup());
    this.submitNotice.set(null);
  }

  /**
   * Drops a row.
   *
   * Nothing marks it deleted, because the submitted array *is* the statement — a live line the array
   * omits is soft-deleted. The last row cannot be removed: the endpoint rejects an empty `lines` array
   * with a `400`, and "delete every line" is not an edit this screen offers.
   */
  removeLine(index: number): void {
    if (this.lines.length <= 1) {
      this.submitNotice.set('An invoice must keep at least one line. Edit the last one instead of removing it.');
      return;
    }
    this.lines.removeAt(index);
    // The open picker is addressed by row index, and every row after this one just shifted up — so a
    // menu left open would now be pointed at a different line than the one it was opened from.
    this.closeItemPicker();
    this.submitNotice.set(null);
  }

  /** Submits only what changed, and refuses locally when nothing did. */
  submit(): void {
    const invoice = this.invoice();
    if (!invoice || this.submitting()) {
      return;
    }

    if (!this.isCorrectable) {
      this.submitNotice.set(
        'This invoice has no proposal behind it, so it cannot be corrected through this route.'
      );
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.submitNotice.set(
        'Every line needs an item type and a description, and a quantity and rate above zero. ' +
          'Fix the highlighted rows.'
      );
      return;
    }

    const request = this.buildRequest();
    if (!request) {
      this.submitNotice.set('Nothing has changed yet, so there is nothing to send.');
      return;
    }

    this.submitNotice.set(null);
    this.submitError.set(null);
    this.submitting.set(true);

    this.agreements
      .updateProposedInvoice(invoice.rentAgreementId!, invoice.proposedInvoiceId!, request)
      .subscribe({
        next: (proposal) => {
          this.updatedProposal.set(proposal);
          this.submitting.set(false);

          // Re-seeded from the RESPONSE, not from the invoice we loaded: the proposal that came back is
          // the new truth, carrying the new line ids. A second correction has to be measured against it,
          // or it would resend this correction's changes as though they were fresh.
          this.seedForm(proposal.dueDate, proposal.lines);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.submitError.set(UpdateProposedInvoiceComponent.describeError(err));
        }
      });
  }

  /**
   * Builds the request from the difference between the form and its baseline, or `null` when nothing
   * changed.
   *
   * Both members are omitted when they match, because absence means "leave unchanged" — so a due-date
   * correction leaves the lines, and their ids, entirely alone.
   */
  private buildRequest(): UpdateProposedInvoiceRequest | null {
    const baseline = this.baseline;
    if (!baseline) {
      return null;
    }

    const dueDate = toIsoDate(this.form.get('dueDate')!.value);
    const lines = this.currentLines();

    const request: UpdateProposedInvoiceRequest = {};

    if (dueDate && dueDate !== baseline.dueDate) {
      request.dueDate = dueDate;
    }

    if (JSON.stringify(lines) !== JSON.stringify(baseline.lines)) {
      request.lines = lines;
    }

    return request.dueDate === undefined && request.lines === undefined ? null : request;
  }

  /**
   * Projects the form's rows onto the wire shape.
   *
   * `lineId` and `lineItemId` are emitted only when present, so a brand-new row carries neither and
   * reads as an addition. No row carries an `amount`: the field does not exist on the request, because
   * the server derives it from quantity × rate.
   */
  private currentLines(): UpdateProposedLineRequest[] {
    return this.lines.controls.map((control) => {
      const value = control.value;
      const line: UpdateProposedLineRequest = {
        itemType: String(value.itemType ?? '').trim(),
        description: String(value.description ?? '').trim(),
        quantity: Number(value.quantity),
        rate: Number(value.rate)
      };

      if (value.lineId) {
        line.lineId = value.lineId;
      }
      if (value.lineItemId) {
        line.lineItemId = value.lineItemId;
      }

      return line;
    });
  }

  /** Rebuilds the form and the diff baseline from a due date and a line set. */
  private seedForm(
    dueDate: string,
    lines: readonly (InvoiceLineResponse | { lineId: string; lineItemId?: string | null; itemType: string; description: string; quantity: number; rate: number })[]
  ): void {
    // Parsed to a local-time `Date` for the picker; the ISO string is what the baseline keeps, so the
    // diff never has to reason about two representations of the same day.
    this.form.get('dueDate')!.setValue(parseIsoDate(dueDate));
    this.lines.clear();

    lines.forEach((line) => {
      const group = this.buildLineGroup();
      group.patchValue({
        lineId: line.lineId,
        lineItemId: line.lineItemId ?? '',
        itemType: line.itemType,
        description: line.description,
        quantity: line.quantity,
        rate: line.rate
      });
      this.lines.push(group);
    });

    this.baseline = { dueDate, lines: this.currentLines() };
  }

  private buildLineGroup(): FormGroup {
    return this.fb.group({
      // Identity, not display. A seeded row keeps the id it came with so the server revises that exact
      // line; a row added here has none, which is how an addition is expressed.
      lineId: [''],
      lineItemId: [''],
      itemType: ['', Validators.required],
      description: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      rate: [0, [Validators.required, Validators.min(0.01)]]
    });
  }

  /** Clears everything a previous load put on screen, so a second lookup cannot inherit the first's state. */
  private resetLoadedState(): void {
    this.invoice.set(null);
    this.updatedProposal.set(null);
    this.submitError.set(null);
    this.submitNotice.set(null);
    this.lines.clear();
    this.form.get('dueDate')!.setValue(null);
    this.baseline = null;
    this.lineItems.set([]);
    this.closeItemPicker();
  }

  /** Mirrors the other screens' error rendering — the RFC 9457 `detail` when the body carries one. */
  private static describeError(err: HttpErrorResponse): string {
    const problemDetail = err.error?.detail;
    return typeof problemDetail === 'string' && problemDetail
      ? problemDetail
      : `Request failed: ${err.status} ${err.statusText}`;
  }
}
