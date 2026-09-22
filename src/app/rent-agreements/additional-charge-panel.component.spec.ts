import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { environment } from '../../environments/environment';
import { toIsoDate } from '../shared/date.util';
import { RequestScopeService } from '../request-scope.service';
import { AdditionalChargePanelComponent } from './additional-charge-panel.component';
import { AdditionalChargeCreationRequest } from './rent-agreement.models';
import { LineItemResponse } from './line-item.models';
import { TenantSplitEditorComponent } from './tenant-split-editor.component';

describe('AdditionalChargePanelComponent', () => {
  let fixture: ComponentFixture<AdditionalChargePanelComponent>;
  let component: AdditionalChargePanelComponent;
  let httpMock: HttpTestingController;

  const propertyOwnerId = '33333333-3333-3333-3333-333333333333';
  const baseUrl = `${environment.apiBaseUrl}/api/v1/line-items`;

  const parkingItem: LineItemResponse = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Parking',
    itemType: 'Parking',
    isDepositType: false
  };
  const petFeeItem: LineItemResponse = {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Pet Fee',
    itemType: 'PetFee',
    isDepositType: false
  };
  const petDepositItem: LineItemResponse = {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Pet Deposit',
    itemType: 'PetDeposit',
    isDepositType: true
  };

  beforeEach(() => {
    // `RequestScopeService` seeds itself from localStorage, which outlives the TestBed and every spec
    // in this browser session. Jasmine runs specs in a random order, so a token stored by one of the
    // v26 tests below would otherwise reach the mismatch tests above it and silence them — a failure
    // that appears and disappears with the seed.
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [AdditionalChargePanelComponent, HttpClientTestingModule]
    });

    fixture = TestBed.createComponent(AdditionalChargePanelComponent);
    component = fixture.componentInstance;
    component.propertyOwnerId = propertyOwnerId;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  /** Flushes the catalog GET fired from ngOnInit (via fixture.detectChanges()). */
  function flushLineItems(items: LineItemResponse[]): void {
    const req = httpMock.expectOne((r) => r.url === baseUrl);
    req.flush(items);
  }

  /**
   * v22 requirement 13b (D5) — the mismatch between the record's owner and the settings box is shown.
   *
   * **Why this is the requirement's real content.** Removing the owner argument (13a) is two lines and
   * changes no visible behaviour; what it leaves behind is a catalog that quietly answers for whoever
   * the settings box names. Nothing errors, so without this notice a tester reads an empty-looking
   * picker as "this owner has no custom fees" rather than "I am looking at the wrong owner".
   */
  it('Req13b_RecordOwnerDiffersFromTestScope_ShowsTheMismatch', () => {
    TestBed.inject(RequestScopeService).setPropertyOwnerId('99999999-9999-9999-9999-999999999999');

    fixture.detectChanges();
    flushLineItems([parkingItem]);
    fixture.detectChanges();

    const notice: HTMLElement | null =
      fixture.nativeElement.querySelector('.scope-mismatch');

    expect(notice).withContext('a silent wrong-owner catalog is the defect this version fixes').not.toBeNull();
    expect(notice!.textContent).toContain(propertyOwnerId);
    expect(notice!.textContent).toContain('99999999-9999-9999-9999-999999999999');
  });

  /** The ordinary case: the box and the record agree, so nothing is said. */
  it('Req13b_RecordOwnerMatchesTestScope_SaysNothing', () => {
    TestBed.inject(RequestScopeService).setPropertyOwnerId(propertyOwnerId);

    fixture.detectChanges();
    flushLineItems([parkingItem]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.scope-mismatch'))
      .withContext('a notice on every screen would be noise, and noise is ignored')
      .toBeNull();
  });

  /**
   * v26 requirement 15g. With a token in play the three ids are not sent at all, so the box's
   * `PropertyOwnerUid` is not what the catalog was read for — and a notice comparing against it would
   * report a disagreement between two values that never met.
   */
  it('Req15g_TokenInPlay_SilencesTheOwnerMismatchNotice', () => {
    const scope = TestBed.inject(RequestScopeService);
    scope.setPropertyOwnerId('99999999-9999-9999-9999-999999999999');
    scope.setAccessToken('a-token-the-gateway-reads-the-owner-from');

    fixture.detectChanges();
    flushLineItems([parkingItem]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.scope-mismatch'))
      .withContext('the box owner is not sent once a token is, so there is nothing to disagree with')
      .toBeNull();
  });

  /**
   * v26. **The bug: an empty picker that had never asked.** v22 removed the owner from
   * `GET /api/v1/line-items` and made the header the only source — but the `if (!this.propertyOwnerId)
   * return;` that guarded the fetch stayed behind. A record naming no owner rendered
   * *"No catalog items are available to pick from yet"*, which reads as an empty catalog rather than a
   * request never made.
   */
  it('Req15g_NoRecordOwner_StillFetchesTheCatalog', () => {
    component.propertyOwnerId = null;

    fixture.detectChanges();

    const request = httpMock.expectOne((r) => r.url === baseUrl);
    request.flush([parkingItem]);

    expect(component.lineItems())
      .withContext('the owner is a header, not an argument — it cannot gate the call')
      .toEqual([parkingItem]);
  });

  /**
   * v26 requirement 15g. **The sequence this is built for.** The panel is open, the catalog came back
   * empty because the gateway refused the request, and the tester pastes the token in response. Before
   * this, nothing happened — the only fix was a browser reload, which on the Add Lease screen means
   * retyping the lease.
   */
  it('Req15g_TokenPastedWhilePanelIsOpen_RefetchesTheCatalogWithoutAReload', () => {
    fixture.detectChanges();
    flushLineItems([]);

    TestBed.inject(RequestScopeService).setAccessToken('the-token-pasted-after-the-panel-opened');
    fixture.detectChanges();

    // The request itself, not its headers: this TestBed registers no interceptor, and what the header
    // then carries is `scope-headers.interceptor.spec.ts`'s subject rather than this one's.
    const refetch = httpMock.expectOne((r) => r.url === baseUrl);
    refetch.flush([parkingItem, petFeeItem]);

    expect(component.lineItems()).toEqual([parkingItem, petFeeItem]);
  });

  it('should create', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);
    expect(component).toBeTruthy();
  });

  it('fetches the catalog scoped to AllExcludingCredit when not depositOnly', () => {
    fixture.detectChanges();

    const req = httpMock.expectOne(
      (r) =>
        r.url === baseUrl &&
        // v22, 13a -- the owner is a header now, so the query carries scope alone.
        r.params.get('scope') === 'AllExcludingCredit'
    );
    req.flush([parkingItem, petFeeItem]);

    expect(component.lineItems()).toEqual([parkingItem, petFeeItem]);
  });

  it('fetches the catalog scoped to DepositOnly when depositOnly', () => {
    component.depositOnly = true;
    fixture.detectChanges();

    const req = httpMock.expectOne(
      (r) => r.url === baseUrl && r.params.get('scope') === 'DepositOnly'
    );
    req.flush([petDepositItem]);

    expect(component.lineItems()).toEqual([petDepositItem]);
  });

  // v26 removed `does not fetch the catalog when propertyOwnerId is not set`, which pinned the defect
  // rather than a requirement. It was written before v22 made the owner a header; when the argument
  // went, this test kept the `return` that used to produce it alive through two versions.
  // `Req15g_NoRecordOwner_StillFetchesTheCatalog` above asserts the opposite, which is the rule.

  it('does not emit and marks fields touched when the form is invalid', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);
    const emitted: AdditionalChargeCreationRequest[] = [];
    component.created.subscribe((c) => emitted.push(c));

    component.create();

    expect(emitted.length).toBe(0);
    expect(component.items.at(0).get('lineItemId')!.touched).toBeTrue();
  });

  it('recalculates the amount when quantity or rate changes', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    const item = component.items.at(0);
    item.patchValue({ quantity: 3, rate: 20 });
    component.recalculateAmount(0);

    expect(item.get('amount')!.value).toBe(60);
    expect(component.subAmount).toBe(60);
  });

  it('supports adding and removing item rows, never dropping below one', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    component.addItem();
    expect(component.items.length).toBe(2);

    component.removeItem(1);
    expect(component.items.length).toBe(1);

    component.removeItem(0);
    expect(component.items.length).toBe(1);
  });

  it('emits a one-time (non-recurring) charge built from the picked catalog item', () => {
    fixture.detectChanges();
    flushLineItems([petFeeItem]);

    const item = component.items.at(0);
    item.patchValue({ lineItemId: petFeeItem.id, description: 'One-time pet fee', quantity: 1, rate: 50 });
    component.recalculateAmount(0);

    component.form.patchValue({
      notes: 'Some notes',
      alreadyPaid: 10,
      dueDate: '2026-08-15'
    });

    let emitted: AdditionalChargeCreationRequest | undefined;
    component.created.subscribe((c) => (emitted = c));

    component.create();

    expect(emitted).toEqual({
      notes: 'Some notes',
      alreadyPaid: 10,
      attachedWithRentalInvoice: false,
      isRecurring: false,
      dueDate: '2026-08-15',

      // v14, requirement 26: sent on EVERY submission, including one carrying no split. An absent
      // field is not neutral -- the service reads it the way the payer-row count used to be read.
      splitMode: 'Shared',
      frequency: null,
      frequencyConfig: null,
      startDate: null,
      endDate: null,
      hasNoEndDate: false,
      items: [
        {
          lineItemId: petFeeItem.id,
          itemType: 'PetFee',
          description: 'One-time pet fee',
          quantity: 1,
          rate: 50,
          amount: 50
        }
      ]
    });
  });

  it('emits a recurring charge with frequency/startDate instead of dueDate', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    const item = component.items.at(0);
    item.patchValue({ lineItemId: parkingItem.id, description: 'Monthly parking', quantity: 1, rate: 30 });
    component.recalculateAmount(0);

    component.form.patchValue({
      isRecurring: true,
      attachedWithRentalInvoice: true,
      frequency: 'monthly',
      dueOnDay: 15,
      startDate: '2026-08-01',
      hasNoEndDate: true
    });

    let emitted: AdditionalChargeCreationRequest | undefined;
    component.created.subscribe((c) => (emitted = c));

    component.create();

    expect(emitted?.isRecurring).toBeTrue();
    expect(emitted?.dueDate).toBeNull();
    expect(emitted?.frequency).toBe('monthly');
    expect(emitted?.frequencyConfig).toEqual({ dueOnDay: 15 });
    expect(emitted?.startDate).toBe('2026-08-01');
    expect(emitted?.hasNoEndDate).toBeTrue();
    expect(emitted?.endDate).toBeNull();
    expect(emitted?.items[0].itemType).toBe('Parking');
  });

  it('omits the cadence for a recurring charge that does not ride the rental invoice (FR-088)', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    const item = component.items.at(0);
    item.patchValue({ lineItemId: parkingItem.id, description: 'Internet', quantity: 1, rate: 20 });
    component.recalculateAmount(0);

    component.form.patchValue({
      isRecurring: true,
      attachedWithRentalInvoice: false,
      frequency: 'monthly',
      dueOnDay: 15,
      startDate: '2026-08-01',
      hasNoEndDate: true
    });

    let emitted: AdditionalChargeCreationRequest | undefined;
    component.created.subscribe((c) => (emitted = c));

    component.create();

    // A standalone recurring charge bills once per rent cycle, so it has no cadence of its own. Sending
    // one is what the server rejects with 422.
    expect(emitted?.isRecurring).toBeTrue();
    expect(emitted?.frequency).toBeNull();
    expect(emitted?.frequencyConfig).toBeNull();
    expect(emitted?.startDate).toBe('2026-08-01');
    expect(emitted?.hasNoEndDate).toBeTrue();
  });

  it('builds a bi-monthly frequencyConfig from the two due-on-day controls', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    const item = component.items.at(0);
    item.patchValue({ lineItemId: parkingItem.id, description: 'Bi-monthly parking', quantity: 1, rate: 15 });
    component.recalculateAmount(0);

    component.form.patchValue({
      isRecurring: true,
      attachedWithRentalInvoice: true,
      frequency: 'bi_monthly',
      startDate: '2026-08-01',
      hasNoEndDate: true
    });
    component.dueOnDays.at(0).setValue(1);
    component.dueOnDays.at(1).setValue(20);

    let emitted: AdditionalChargeCreationRequest | undefined;
    component.created.subscribe((c) => (emitted = c));

    component.create();

    expect(emitted?.frequencyConfig).toEqual({ dueOnDays: [1, 20] });
  });

  it('builds a custom frequencyConfig from the added due-date controls', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    const item = component.items.at(0);
    item.patchValue({ lineItemId: parkingItem.id, description: 'Custom fee', quantity: 1, rate: 15 });
    component.recalculateAmount(0);

    component.form.patchValue({
      isRecurring: true,
      attachedWithRentalInvoice: true,
      frequency: 'custom',
      startDate: '2026-08-01',
      hasNoEndDate: true
    });
    component.dueDates.at(0).setValue('2026-08-15');
    component.addDueDate();
    component.dueDates.at(1).setValue('2026-09-15');

    let emitted: AdditionalChargeCreationRequest | undefined;
    component.created.subscribe((c) => (emitted = c));

    component.create();

    expect(emitted?.frequencyConfig).toEqual({ dueDates: ['2026-08-15', '2026-09-15'] });
  });

  it('always emits attachedWithRentalInvoice false when depositOnly', () => {
    component.depositOnly = true;
    fixture.detectChanges();
    flushLineItems([petDepositItem]);

    const item = component.items.at(0);
    item.patchValue({ lineItemId: petDepositItem.id, description: 'Pet deposit', quantity: 1, rate: 200 });
    component.recalculateAmount(0);
    component.form.patchValue({ dueDate: '2026-08-15', attachedWithRentalInvoice: true });

    let emitted: AdditionalChargeCreationRequest | undefined;
    component.created.subscribe((c) => (emitted = c));

    component.create();

    expect(emitted?.attachedWithRentalInvoice).toBeFalse();
    expect(emitted?.items[0].itemType).toBe('PetDeposit');
  });

  it('never enters "add new item type" mode when depositOnly, even if called directly', () => {
    component.depositOnly = true;
    fixture.detectChanges();
    flushLineItems([petDepositItem]);

    component.startAddingNewItemType();

    expect(component.addingNewItemType()).toBeFalse();
  });

  it('is invalid until a row either picks an existing item or types a new item type', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    const group = component.items.at(0);
    expect(group.hasError('itemRequired')).toBeTrue();

    group.patchValue({ newItemType: 'Snow Removal' });
    expect(group.hasError('itemRequired')).toBeFalse();

    group.patchValue({ newItemType: '', lineItemId: parkingItem.id });
    expect(group.hasError('itemRequired')).toBeFalse();

    group.patchValue({ lineItemId: '' });
    expect(group.hasError('itemRequired')).toBeTrue();
  });

  it('itemDisplayLabel reflects the placeholder, an existing pick, or a typed new type', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    expect(component.itemDisplayLabel(0)).toBe('Select Type');

    component.items.at(0).patchValue({ lineItemId: parkingItem.id });
    expect(component.itemDisplayLabel(0)).toBe('Parking');

    component.items.at(0).patchValue({ lineItemId: '', newItemType: 'Snow Removal' });
    expect(component.itemDisplayLabel(0)).toBe('Snow Removal');
  });

  it('confirmNewItemType sets the row to a brand-new item type and closes the picker', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    component.toggleItemPicker(0, { currentTarget: document.createElement('button') } as unknown as MouseEvent);
    component.startAddingNewItemType();
    component.newItemTypeDraft.set('Snow Removal');
    component.confirmNewItemType(0);

    // Free text with no `lineItemId` is correct for this endpoint: it get-or-creates the catalog entry
    // server-side from `itemType`/`description` at save time.
    expect(component.items.at(0).get('lineItemId')!.value).toBe('');
    expect(component.items.at(0).get('newItemType')!.value).toBe('Snow Removal');
    expect(component.openItemPickerIndex()).toBeNull();
  });

  it('selectExistingItem sets the row to a catalog pick and clears any typed new item type', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    component.items.at(0).patchValue({ newItemType: 'Snow Removal' });
    component.selectExistingItem(0, parkingItem.id);

    expect(component.items.at(0).get('lineItemId')!.value).toBe(parkingItem.id);
    expect(component.items.at(0).get('newItemType')!.value).toBe('');
  });

  it('seeds an empty description from the picked catalog item name', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    expect(component.items.at(0).get('description')!.value).toBe('');

    component.selectExistingItem(0, parkingItem.id);

    expect(component.items.at(0).get('description')!.value).toBe('Parking');
  });

  it('seeds an empty description from a typed new item type too', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    component.startAddingNewItemType();
    component.newItemTypeDraft.set('Snow Removal');
    component.confirmNewItemType(0);

    expect(component.items.at(0).get('description')!.value).toBe('Snow Removal');
  });

  it('never overwrites a description the user already wrote', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem, petFeeItem]);

    component.items.at(0).patchValue({ description: 'Reserved bay, north gate' });
    component.selectExistingItem(0, parkingItem.id);
    expect(component.items.at(0).get('description')!.value).toBe('Reserved bay, north gate');

    // Nor when the item is later corrected to a different one — the description is the line the tenant
    // reads on the invoice, and a type correction must not rewrite it.
    component.selectExistingItem(0, petFeeItem.id);
    expect(component.items.at(0).get('lineItemId')!.value).toBe(petFeeItem.id);
    expect(component.items.at(0).get('description')!.value).toBe('Reserved bay, north gate');
  });

  it('treats a whitespace-only description as empty', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    component.items.at(0).patchValue({ description: '   ' });
    component.selectExistingItem(0, parkingItem.id);

    expect(component.items.at(0).get('description')!.value).toBe('Parking');
  });

  it('leaves the description alone when the picked id matches no fetched catalog entry', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    component.selectExistingItem(0, '99999999-9999-9999-9999-999999999999');

    expect(component.items.at(0).get('description')!.value).toBe('');
  });

  it('emits a charge with lineItemId omitted and itemType set to the typed name for a new item type', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    const item = component.items.at(0);
    item.patchValue({ newItemType: 'Snow Removal', description: 'Winter snow removal', quantity: 1, rate: 75 });
    component.recalculateAmount(0);
    component.form.patchValue({ dueDate: '2026-08-15' });

    let emitted: AdditionalChargeCreationRequest | undefined;
    component.created.subscribe((c) => (emitted = c));

    component.create();

    expect(emitted?.items[0]).toEqual({
      lineItemId: null,
      itemType: 'Snow Removal',
      description: 'Winter snow removal',
      quantity: 1,
      rate: 75,
      amount: 75
    });
  });

  it('prefills a one-time charge from initialCharge (Edit)', () => {
    const existing: AdditionalChargeCreationRequest = {
      notes: 'Existing note',
      alreadyPaid: 15,
      attachedWithRentalInvoice: true,
      isRecurring: false,
      dueDate: '2026-08-20',
      frequency: null,
      frequencyConfig: null,
      startDate: null,
      endDate: null,
      hasNoEndDate: false,
      items: [
        {
          lineItemId: parkingItem.id,
          itemType: 'Parking',
          description: 'Parking space',
          quantity: 2,
          rate: 40,
          amount: 80
        }
      ]
    };
    component.initialCharge = existing;

    fixture.detectChanges();
    flushLineItems([parkingItem]);

    expect(component.form.get('notes')!.value).toBe('Existing note');
    expect(component.form.get('alreadyPaid')!.value).toBe(15);
    expect(component.form.get('attachedWithRentalInvoice')!.value).toBeTrue();
    expect(component.form.get('isRecurring')!.value).toBeFalse();
    expect(component.items.length).toBe(1);
    expect(component.items.at(0).get('lineItemId')!.value).toBe(parkingItem.id);
    expect(component.items.at(0).get('description')!.value).toBe('Parking space');
    expect(component.items.at(0).get('quantity')!.value).toBe(2);
    expect(component.items.at(0).get('rate')!.value).toBe(40);
    expect(component.itemDisplayLabel(0)).toBe('Parking');
  });

  it('prefills a recurring monthly charge from initialCharge, including a brand-new item type', () => {
    const existing: AdditionalChargeCreationRequest = {
      notes: null,
      alreadyPaid: 0,
      attachedWithRentalInvoice: false,
      isRecurring: true,
      dueDate: null,
      frequency: 'monthly',
      frequencyConfig: { dueOnDay: 12 },
      startDate: '2026-09-01',
      endDate: null,
      hasNoEndDate: true,
      items: [
        { lineItemId: null, itemType: 'Snow Removal', description: 'Winter snow removal', quantity: 1, rate: 60, amount: 60 }
      ]
    };
    component.initialCharge = existing;

    fixture.detectChanges();
    flushLineItems([parkingItem]);

    expect(component.form.get('isRecurring')!.value).toBeTrue();
    expect(component.form.get('frequency')!.value).toBe('monthly');
    expect(component.form.get('dueOnDay')!.value).toBe(12);
    expect(component.form.get('startDate')!.value).toBe('2026-09-01');
    expect(component.form.get('hasNoEndDate')!.value).toBeTrue();
    expect(component.items.at(0).get('lineItemId')!.value).toBe('');
    expect(component.items.at(0).get('newItemType')!.value).toBe('Snow Removal');
    expect(component.itemDisplayLabel(0)).toBe('Snow Removal');
  });

  it('prefills a recurring bi-monthly charge, resizing dueOnDays to match', () => {
    const existing: AdditionalChargeCreationRequest = {
      alreadyPaid: 0,
      attachedWithRentalInvoice: false,
      isRecurring: true,
      frequency: 'bi_monthly',
      frequencyConfig: { dueOnDays: [3, 22] },
      startDate: '2026-09-01',
      hasNoEndDate: true,
      items: [{ lineItemId: parkingItem.id, itemType: 'Parking', description: 'x', quantity: 1, rate: 10, amount: 10 }]
    };
    component.initialCharge = existing;

    fixture.detectChanges();
    flushLineItems([parkingItem]);

    expect(component.dueOnDays.length).toBe(2);
    expect(component.dueOnDays.value).toEqual([3, 22]);
  });

  it('prefills a recurring custom charge, rebuilding the dueDates FormArray to match', () => {
    const existing: AdditionalChargeCreationRequest = {
      alreadyPaid: 0,
      attachedWithRentalInvoice: false,
      isRecurring: true,
      frequency: 'custom',
      frequencyConfig: { dueDates: ['2026-09-01', '2026-10-15', '2026-11-30'] },
      startDate: '2026-09-01',
      hasNoEndDate: true,
      items: [{ lineItemId: parkingItem.id, itemType: 'Parking', description: 'x', quantity: 1, rate: 10, amount: 10 }]
    };
    component.initialCharge = existing;

    fixture.detectChanges();
    flushLineItems([parkingItem]);

    expect(component.dueDates.length).toBe(3);
    expect(component.dueDates.value.map((d: Date) => toIsoDate(d))).toEqual(['2026-09-01', '2026-10-15', '2026-11-30']);
    // Custom's own Start Date stays a free-form Date, not the candidate <select>'s ISO string.
    expect(component.form.get('startDate')!.value instanceof Date).toBeTrue();
  });

  it('re-editing and re-creating rebuilds items to exactly match the edited charge (no leftover rows)', () => {
    const existing: AdditionalChargeCreationRequest = {
      alreadyPaid: 0,
      attachedWithRentalInvoice: false,
      isRecurring: false,
      dueDate: '2026-08-20',
      hasNoEndDate: false,
      items: [
        { lineItemId: parkingItem.id, itemType: 'Parking', description: 'a', quantity: 1, rate: 10, amount: 10 },
        { lineItemId: petFeeItem.id, itemType: 'PetFee', description: 'b', quantity: 1, rate: 20, amount: 20 }
      ]
    };
    component.initialCharge = existing;

    fixture.detectChanges();
    flushLineItems([parkingItem, petFeeItem]);

    expect(component.items.length).toBe(2);

    let emitted: AdditionalChargeCreationRequest | undefined;
    component.created.subscribe((c) => (emitted = c));
    component.create();

    expect(emitted?.items.length).toBe(2);
    expect(emitted?.items.map((i) => i.description)).toEqual(['a', 'b']);
  });

  it('emits closed when close() is called', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);
    let closedCount = 0;
    component.closed.subscribe(() => closedCount++);

    component.close();

    expect(closedCount).toBe(1);
  });
  describe('a catalog that could not be read is not an empty catalog', () => {
    /** Fails the catalog GET fired from ngOnInit, the way the real service does. */
    function failLineItems(status: number, statusText: string, body: Object | null = null): void {
      httpMock.expectOne((request) => request.url === baseUrl).flush(body, { status, statusText });
      fixture.detectChanges();
    }

    /**
     * The defect this closes. The fetch had no error branch at all, so `lineItems()` kept its initial
     * `[]` and the panel said *"No catalog items are available to pick from yet"* for a stopped
     * service, a refused request and a genuinely empty catalog alike.
     *
     * **The lease editor is where that mattered.** It reads nothing from the API before this panel is
     * opened, so an empty picker was the only symptom a stopped Billing service produced anywhere on
     * the screen — which is exactly how it was mistaken for a binding bug.
     */
    it('says the catalog could not be loaded, not that it is empty', () => {
      fixture.detectChanges();
      failLineItems(0, 'Unknown Error');

      expect(component.catalogError()).not.toBeNull();
      expect(component.catalogLoading()).toBeFalse();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('could not be loaded');
      expect(text).not.toContain('No catalog items are available to pick from yet');
    });

    it('names the address nothing answered at when the service is not running', () => {
      fixture.detectChanges();

      // `status === 0` is what the browser reports for ERR_CONNECTION_REFUSED — the case that used to
      // be indistinguishable from an empty catalog.
      failLineItems(0, 'Unknown Error');

      expect(component.catalogError()).toContain(environment.apiBaseUrl);
      expect(component.catalogError()).toContain('Billing service is running');
    });

    it('repeats the problem detail verbatim when the request was refused', () => {
      fixture.detectChanges();

      // The other trap on the local build: a token pasted into Test scope replaces the three ids the
      // Billing API reads directly, and it refuses the read for the one it needs.
      failLineItems(400, 'Bad Request', {
        type: 'about:blank',
        title: 'Validation Error',
        status: 400,
        detail: 'The PropertyOwnerUid header is required.'
      });

      expect(component.catalogError()).toBe('The PropertyOwnerUid header is required.');
      expect(fixture.nativeElement.textContent).toContain('The PropertyOwnerUid header is required.');
    });

    it('falls back to the status line when the failure carries no detail', () => {
      fixture.detectChanges();
      failLineItems(500, 'Internal Server Error');

      expect(component.catalogError()).toBe('The request was refused: 500 Internal Server Error');
    });

    it('reads the catalog again on Try again, and clears the message once it answers', () => {
      fixture.detectChanges();
      failLineItems(0, 'Unknown Error');

      const retry = fixture.nativeElement.querySelector('.banner.error .link-btn');
      expect(retry).not.toBeNull();

      retry.click();
      fixture.detectChanges();

      flushLineItems([parkingItem]);
      fixture.detectChanges();

      expect(component.catalogError()).toBeNull();
      expect(component.lineItems()).toEqual([parkingItem]);
      expect(fixture.nativeElement.textContent).not.toContain('could not be loaded');
    });

    it('empties a stale catalog when a later read fails', () => {
      fixture.detectChanges();
      flushLineItems([parkingItem, petFeeItem]);
      fixture.detectChanges();
      expect(component.lineItems().length).toBe(2);

      component.retryCatalog();
      failLineItems(0, 'Unknown Error');

      // Left standing under an error message, the old list invites picking an entry that was read for
      // a different owner, or from a service that is no longer answering.
      expect(component.lineItems()).toEqual([]);
      expect(component.catalogError()).not.toBeNull();
    });

    it('says nothing at all about emptiness while the read is still in flight', () => {
      fixture.detectChanges();

      // The panel can be opened and a picker clicked before the answer arrives. "Not yet" is not
      // "there are none", and the old template could only say the latter.
      expect(component.catalogLoading()).toBeTrue();
      expect(fixture.nativeElement.textContent).not.toContain('No catalog items are available');

      flushLineItems([parkingItem]);
      fixture.detectChanges();

      expect(component.catalogLoading()).toBeFalse();
    });
  });
  describe('who pays, when the host authors it (FR 19, 20 and 22)', () => {
    const tenantA = '11111111-1111-1111-1111-111111111111';
    const tenantB = '22222222-2222-2222-2222-222222222222';

    /** The editor instance the panel rendered, reached the way any child component is in a test. */
    function editor(): TenantSplitEditorComponent {
      return fixture.debugElement.query(By.directive(TenantSplitEditorComponent)).componentInstance;
    }

    function rosterOf(...tenantIds: string[]) {
      return tenantIds.map((tenantId) => ({
        tenantId,
        rentAmount: 0,
        rentPercent: null,
        deposit: 0,
        depositPercent: null
      }));
    }

    /** Renders the panel with a roster and one $300 line item already authored. */
    function openWithRoster(...tenantIds: string[]) {
      component.tenants = rosterOf(...tenantIds);
      fixture.detectChanges();
      flushLineItems([parkingItem]);

      component.items.at(0).patchValue({
        lineItemId: parkingItem.id,
        description: 'Reserved bay',
        quantity: 1,
        rate: 300
      });
      component.recalculateAmount(0);
      fixture.detectChanges();

      return fixture.nativeElement.querySelector('app-tenant-split-editor');
    }

    /** Fills in the one field a one-time charge still needs before Create will run. */
    function completeTheFee(): void {
      component.form.patchValue({ dueDate: new Date('2026-10-01T00:00:00') });
    }

    /**
     * Requirement 22, in the one assertion that keeps it true.
     *
     * The lease create/edit screens host this same panel and must never gain a renter control. They
     * pass no roster, and that is the whole mechanism — so a change that renders the editor
     * unconditionally fails here rather than quietly growing a split editor on the lease editor.
     */
    it('renders no renter control at all when the host passes no roster', () => {
      fixture.detectChanges();
      flushLineItems([parkingItem]);

      expect(component.tenants).toBeNull();
      expect(fixture.nativeElement.querySelector('app-tenant-split-editor')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('Split per Tenant');
    });

    it('offers the split editor when the host passes a roster', () => {
      expect(openWithRoster(tenantA, tenantB)).not.toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Split per Tenant');
    });

    it('sends no tenantShares for a fee left shared by everyone', () => {
      openWithRoster(tenantA, tenantB);

      let emitted: AdditionalChargeCreationRequest | undefined;
      component.created.subscribe((charge) => (emitted = charge));
      completeTheFee();
      component.create();

      // Absent rather than empty: omission says "not specified" where [] says "specified as nobody".
      expect(emitted).toBeDefined();
      expect('tenantShares' in emitted!).toBeFalse();
    });

    it('puts the split on the charge it emits, and never a tenant array', () => {
      openWithRoster(tenantA, tenantB);
      editor().setSplitMode('split');
      fixture.detectChanges();

      let emitted: AdditionalChargeCreationRequest | undefined;
      component.created.subscribe((charge) => (emitted = charge));
      completeTheFee();
      component.create();

      // `alreadyPaid` rides on every share, at 0 here because the fee records none — the server is
      // left no division of its own to make.
      expect(emitted!.tenantShares).toEqual([
        { tenantId: tenantA, amount: 150, alreadyPaid: 0 },
        { tenantId: tenantB, amount: 150, alreadyPaid: 0 }
      ]);
      expect(emitted!.tenantIds).withContext('the retired tenant array was sent').toBeUndefined();
    });

    /**
     * Requirement 19, enforced where Create is. The server refuses the same state with a 422, so this
     * is the panel refusing before it does — and what the owner typed is left exactly as it is.
     */
    it('refuses Create while the split does not total the fee', () => {
      openWithRoster(tenantA, tenantB);

      editor().setSplitMode('split');
      fixture.detectChanges();

      // BOTH rows, deliberately. Typing only one leaves the other untouched, and an untouched row
      // absorbs whatever is left of the fee — so a single typed row still totals $300 and is a
      // perfectly good split. A mismatch needs every row authored, or one over-typed.
      editor().typeShare(tenantA, '100');
      editor().typeShare(tenantB, '100');
      fixture.detectChanges();

      expect(component.splitState().blocker).toBe(
        'The shares total $200.00, the fee is $300.00 — $100.00 short.'
      );

      let emitted = false;
      component.created.subscribe(() => (emitted = true));
      completeTheFee();
      component.create();

      expect(emitted).withContext('a mismatched split was emitted').toBeFalse();
      expect(fixture.nativeElement.querySelector('.submit-btn').disabled).toBeTrue();
    });

    it('follows the item total when the fee is re-priced under an open split', () => {
      openWithRoster(tenantA, tenantB);
      editor().setSplitMode('split');
      fixture.detectChanges();
      expect(component.splitState().shares!.map((share) => share.amount)).toEqual([150, 150]);

      component.items.at(0).patchValue({ rate: 100 });
      component.recalculateAmount(0);
      fixture.detectChanges();

      // The split divides whatever the fee currently is, not what it was when the editor opened.
      expect(component.splitState().shares!.map((share) => share.amount)).toEqual([50, 50]);
      expect(component.splitState().blocker).toBeNull();
    });
  });
});
