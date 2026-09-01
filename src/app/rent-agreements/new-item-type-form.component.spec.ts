import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { LineItemResponse } from './line-item.models';
import { NewItemTypeFormComponent } from './new-item-type-form.component';

describe('NewItemTypeFormComponent', () => {
  let fixture: ComponentFixture<NewItemTypeFormComponent>;
  let component: NewItemTypeFormComponent;
  let httpMock: HttpTestingController;

  const lineItemsUrl = `${environment.apiBaseUrl}/api/v1/line-items`;
  const propertyOwnerId = '55555555-5555-5555-5555-555555555555';

  const resolved: LineItemResponse = {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    name: 'Rooftop parking',
    itemType: 'Parking',
    isDepositType: false
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewItemTypeFormComponent, HttpClientTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(NewItemTypeFormComponent);
    component = fixture.componentInstance;
    component.propertyOwnerId = propertyOwnerId;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('posts just the trimmed name and the owner, filed under the custom type', () => {
    component.name.set('  Rooftop parking  ');
    component.submit();

    const request = httpMock.expectOne((r) => r.url === lineItemsUrl && r.method === 'POST');
    expect(request.request.body.propertyOwnerId).toBe(propertyOwnerId);
    expect(request.request.body.name).withContext('trimmed').toBe('Rooftop parking');

    // `miscellaneous` — the same type `AdditionalChargeItemProvisioningService.CustomItemType` assigns
    // when the additional-fee route get-or-creates an entry from a typed name, so both paths file a
    // custom item identically rather than by coincidence. It is snake_case because this field binds to
    // a C# enum, unlike the PascalCase `itemType` the catalog hands back.
    expect(request.request.body.itemType).toBe('miscellaneous');

    request.flush(resolved);
  });

  it('emits the resolved entry, PascalCase itemType intact', () => {
    let emitted: LineItemResponse | undefined;
    component.created.subscribe((item) => (emitted = item));

    component.name.set('Rooftop parking');
    component.submit();
    httpMock.expectOne((r) => r.url === lineItemsUrl && r.method === 'POST').flush(resolved);

    // PascalCase on the way back, which is what `Enum.TryParse(ignoreCase: true)` accepts downstream —
    // the snake_case form is only ever the create body's.
    expect(emitted).toEqual(resolved);
    expect(emitted!.itemType).toBe('Parking');
  });

  it('ignores an unnamed type without calling the API', () => {
    component.name.set('   ');
    component.submit();

    // Silently, like the panel: an empty box with Add pressed is a slip, not something to report.
    httpMock.expectNone((r) => r.url === lineItemsUrl && r.method === 'POST');
  });

  it('refuses when no property owner is loaded — there is nothing to scope a new entry to', () => {
    component.propertyOwnerId = null;
    component.name.set('Rooftop parking');
    component.submit();

    expect(component.error()).toContain('property owner');
    httpMock.expectNone((r) => r.url === lineItemsUrl && r.method === 'POST');
  });

  it('renders a failure detail and stays open for a correction', () => {
    component.name.set('Rooftop parking');
    component.submit();

    httpMock.expectOne((r) => r.url === lineItemsUrl && r.method === 'POST').flush(
      {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'A deposit item type must be system defined.'
      },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(component.error()).toBe('A deposit item type must be system defined.');
    expect(component.submitting()).toBeFalse();
    expect(component.name()).withContext('what was typed survives the refusal').toBe('Rooftop parking');
  });

  it('drops a second submit while one is in flight', () => {
    component.name.set('Rooftop parking');
    component.submit();
    component.submit();

    httpMock.expectOne((r) => r.url === lineItemsUrl && r.method === 'POST').flush(resolved);
  });

});
