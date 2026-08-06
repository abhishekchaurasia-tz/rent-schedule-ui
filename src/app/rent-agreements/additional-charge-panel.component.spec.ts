import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AdditionalChargePanelComponent } from './additional-charge-panel.component';
import { CreatedAdditionalCharge } from './rent-agreement.models';
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

  it('splits the fetched catalog into rent and deposit slices by isDepositType', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem, petFeeItem, petDepositItem]);

    expect(component.rentCatalogItems()).toEqual([parkingItem, petFeeItem]);
    expect(component.depositCatalogItems()).toEqual([petDepositItem]);
  });

  it('does not emit and marks fields touched when the form is invalid', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);
    const emitted: CreatedAdditionalCharge[][] = [];
    component.created.subscribe((c) => emitted.push(c));

    component.create();

    expect(emitted.length).toBe(0);
    // dueDate is required whenever isRecurring is false (the default) — always present regardless
    // of which item groups have rows, unlike a per-item control.
    expect(component.form.get('dueDate')!.touched).toBeTrue();
  });

  it('shows the "add at least one item" error when neither group has a row (not depositOnly)', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);
    component.form.patchValue({ dueDate: '2026-08-15' });

    component.create();

    expect(component.noItemsError()).toBeTrue();
  });

  it('recalculates the amount for the group it was called on', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem, petDepositItem]);

    component.addItem('rent');
    component.addItem('deposit');
    component.rentItems.at(0).patchValue({ quantity: 3, rate: 20 });
    component.recalculateAmount('rent', 0);
    component.depositItems.at(0).patchValue({ quantity: 2, rate: 100 });
    component.recalculateAmount('deposit', 0);

    expect(component.rentItems.at(0).get('amount')!.value).toBe(60);
    expect(component.subAmount('rent')).toBe(60);
    expect(component.depositItems.at(0).get('amount')!.value).toBe(200);
    expect(component.subAmount('deposit')).toBe(200);
  });

  it('lets the rent/deposit groups empty out to zero rows (not depositOnly)', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    component.addItem('rent');
    expect(component.rentItems.length).toBe(1);

    component.removeItem('rent', 0);
    expect(component.rentItems.length).toBe(0);
  });

  it('never drops the deposit-only panel below one row', () => {
    component.depositOnly = true;
    fixture.detectChanges();
    flushLineItems([petDepositItem]);

    expect(component.depositItems.length).toBe(1);

    component.removeItem('deposit', 0);

    expect(component.depositItems.length).toBe(1);
  });

  it('emits a one-time (non-recurring) Rent charge built from the picked catalog item', () => {
    fixture.detectChanges();
    flushLineItems([petFeeItem]);

    component.addItem('rent');
    const item = component.rentItems.at(0);
    item.patchValue({ lineItemId: petFeeItem.id, description: 'One-time pet fee', quantity: 1, rate: 50 });
    component.recalculateAmount('rent', 0);

    component.form.patchValue({
      notes: 'Some notes',
      rentAlreadyPaid: 10,
      dueDate: '2026-08-15'
    });

    let emitted: CreatedAdditionalCharge[] | undefined;
    component.created.subscribe((c) => (emitted = c));

    component.create();

    expect(emitted).toEqual([
      {
        target: 'Rent',
        charge: {
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
          isGrouped: false,
          isSharedByAll: true,
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
        }
      }
    ]);
  });

  it('emits two charges — one per group — when both Rent and Deposit items are added', () => {
    fixture.detectChanges();
    flushLineItems([petFeeItem, petDepositItem]);

    component.addItem('rent');
    component.rentItems.at(0).patchValue({ lineItemId: petFeeItem.id, description: 'Pet fee', quantity: 1, rate: 50 });
    component.recalculateAmount('rent', 0);

    component.addItem('deposit');
    component.depositItems
      .at(0)
      .patchValue({ lineItemId: petDepositItem.id, description: 'Pet deposit', quantity: 1, rate: 200 });
    component.recalculateAmount('deposit', 0);

    component.form.patchValue({
      dueDate: '2026-08-15',
      rentAlreadyPaid: 5,
      depositAlreadyPaid: 15,
      attachedWithRentalInvoice: true
    });

    let emitted: CreatedAdditionalCharge[] | undefined;
    component.created.subscribe((c) => (emitted = c));

    component.create();

    expect(emitted?.length).toBe(2);

    const rentCharge = emitted?.find((c) => c.target === 'Rent');
    const depositCharge = emitted?.find((c) => c.target === 'Deposit');

    expect(rentCharge?.charge.alreadyPaid).toBe(5);
    expect(rentCharge?.charge.attachedWithRentalInvoice).toBeTrue();
    expect(rentCharge?.charge.items[0].itemType).toBe('PetFee');

    // Deposit can never attach to the rental invoice, regardless of the shared checkbox value.
    expect(depositCharge?.charge.alreadyPaid).toBe(15);
    expect(depositCharge?.charge.attachedWithRentalInvoice).toBeFalse();
    expect(depositCharge?.charge.items[0].itemType).toBe('PetDeposit');
  });

  it('emits a recurring charge with frequency/startDate instead of dueDate', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    component.addItem('rent');
    const item = component.rentItems.at(0);
    item.patchValue({ lineItemId: parkingItem.id, description: 'Monthly parking', quantity: 1, rate: 30 });
    component.recalculateAmount('rent', 0);

    component.form.patchValue({
      isRecurring: true,
      frequency: 'monthly',
      dueOnDay: 15,
      startDate: '2026-08-01',
      hasNoEndDate: true
    });

    let emitted: CreatedAdditionalCharge[] | undefined;
    component.created.subscribe((c) => (emitted = c));

    component.create();

    const charge = emitted?.[0].charge;
    expect(charge?.isRecurring).toBeTrue();
    expect(charge?.dueDate).toBeNull();
    expect(charge?.frequency).toBe('monthly');
    expect(charge?.frequencyConfig).toEqual({ dueOnDay: 15 });
    expect(charge?.startDate).toBe('2026-08-01');
    expect(charge?.hasNoEndDate).toBeTrue();
    expect(charge?.endDate).toBeNull();
    expect(charge?.items[0].itemType).toBe('Parking');
  });

  it('builds a bi-monthly frequencyConfig from the two due-on-day controls', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    component.addItem('rent');
    const item = component.rentItems.at(0);
    item.patchValue({ lineItemId: parkingItem.id, description: 'Bi-monthly parking', quantity: 1, rate: 15 });
    component.recalculateAmount('rent', 0);

    component.form.patchValue({
      isRecurring: true,
      frequency: 'bi_monthly',
      startDate: '2026-08-01',
      hasNoEndDate: true
    });
    component.dueOnDays.at(0).setValue(1);
    component.dueOnDays.at(1).setValue(20);

    let emitted: CreatedAdditionalCharge[] | undefined;
    component.created.subscribe((c) => (emitted = c));

    component.create();

    expect(emitted?.[0].charge.frequencyConfig).toEqual({ dueOnDays: [1, 20] });
  });

  it('builds a custom frequencyConfig from the added due-date controls', () => {
    fixture.detectChanges();
    flushLineItems([parkingItem]);

    component.addItem('rent');
    const item = component.rentItems.at(0);
    item.patchValue({ lineItemId: parkingItem.id, description: 'Custom fee', quantity: 1, rate: 15 });
    component.recalculateAmount('rent', 0);

    component.form.patchValue({
      isRecurring: true,
      frequency: 'custom',
      startDate: '2026-08-01',
      hasNoEndDate: true
    });
    component.dueDates.at(0).setValue('2026-08-15');
    component.addDueDate();
    component.dueDates.at(1).setValue('2026-09-15');

    let emitted: CreatedAdditionalCharge[] | undefined;
    component.created.subscribe((c) => (emitted = c));

    component.create();

    expect(emitted?.[0].charge.frequencyConfig).toEqual({ dueDates: ['2026-08-15', '2026-09-15'] });
  });

  it('always emits attachedWithRentalInvoice false when depositOnly', () => {
    component.depositOnly = true;
    fixture.detectChanges();
    flushLineItems([petDepositItem]);

    const item = component.depositItems.at(0);
    item.patchValue({ lineItemId: petDepositItem.id, description: 'Pet deposit', quantity: 1, rate: 200 });
    component.recalculateAmount('deposit', 0);
    component.form.patchValue({ dueDate: '2026-08-15', attachedWithRentalInvoice: true });

    let emitted: CreatedAdditionalCharge[] | undefined;
    component.created.subscribe((c) => (emitted = c));

    component.create();

    expect(emitted?.length).toBe(1);
    expect(emitted?.[0].target).toBe('Deposit');
    expect(emitted?.[0].charge.attachedWithRentalInvoice).toBeFalse();
    expect(emitted?.[0].charge.items[0].itemType).toBe('PetDeposit');
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
