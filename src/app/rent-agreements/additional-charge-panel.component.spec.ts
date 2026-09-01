import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { toIsoDate } from '../shared/date.util';
import { AdditionalChargePanelComponent } from './additional-charge-panel.component';
import { AdditionalChargeCreationRequest } from './rent-agreement.models';
import { LineItemResponse } from './line-item.models';

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
  });

  /** Flushes the catalog GET fired from ngOnInit (via fixture.detectChanges()). */
  function flushLineItems(items: LineItemResponse[]): void {
    const req = httpMock.expectOne((r) => r.url === baseUrl);
    req.flush(items);
  }

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
        r.params.get('propertyOwnerId') === propertyOwnerId &&
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

  it('does not fetch the catalog when propertyOwnerId is not set', () => {
    component.propertyOwnerId = null;
    fixture.detectChanges();

    expect(() => httpMock.expectNone(baseUrl)).not.toThrow();
  });

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
});
