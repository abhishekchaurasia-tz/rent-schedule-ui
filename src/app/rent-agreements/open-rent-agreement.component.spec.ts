import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { OpenRentAgreementComponent } from './open-rent-agreement.component';

describe('OpenRentAgreementComponent', () => {
  let fixture: ComponentFixture<OpenRentAgreementComponent>;
  let component: OpenRentAgreementComponent;
  let router: jasmine.SpyObj<Router>;

  const validId = '8f14e45f-ceea-467e-bd9f-000000000001';

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);

    TestBed.configureTestingModule({
      imports: [OpenRentAgreementComponent],
      providers: [{ provide: Router, useValue: router }]
    });

    fixture = TestBed.createComponent(OpenRentAgreementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('navigates to the edit route for a valid id', () => {
    component.agreementId.setValue(validId);

    component.open();

    expect(router.navigate).toHaveBeenCalledWith(['/rent-agreements', validId, 'edit']);
    expect(component.error()).toBeNull();
  });

  it('trims surrounding whitespace before navigating', () => {
    component.agreementId.setValue(`  ${validId}  `);

    component.open();

    expect(router.navigate).toHaveBeenCalledWith(['/rent-agreements', validId, 'edit']);
  });

  it('accepts an uppercase id', () => {
    component.agreementId.setValue(validId.toUpperCase());

    component.open();

    expect(router.navigate).toHaveBeenCalledWith(['/rent-agreements', validId.toUpperCase(), 'edit']);
  });

  it('reports an empty id without navigating', () => {
    component.agreementId.setValue('   ');

    component.open();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.error()).toBe('Enter a rent agreement id.');
  });

  it('reports a malformed id without navigating', () => {
    component.agreementId.setValue('not-a-guid');

    component.open();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.error()).toContain('not a valid id');
  });

  it('clears a previous error once a valid id is entered', () => {
    component.agreementId.setValue('nope');
    component.open();
    expect(component.error()).not.toBeNull();

    component.agreementId.setValue(validId);
    component.open();

    expect(component.error()).toBeNull();
  });
});
