import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { RentSchedulePreviewComponent } from './rent-schedule-preview.component';
import { CandidateDateResponse, PreviewRentScheduleResponse } from './rent-schedule.models';

describe('RentSchedulePreviewComponent', () => {
  let fixture: ComponentFixture<RentSchedulePreviewComponent>;
  let component: RentSchedulePreviewComponent;
  let httpMock: HttpTestingController;

  const previewUrl = 'http://localhost:5169/api/v1/rent/schedule/preview';
  const optionsUrl = 'http://localhost:5169/api/v1/rent/schedule/first-rental-due-date-options';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RentSchedulePreviewComponent, HttpClientTestingModule]
    });

    fixture = TestBed.createComponent(RentSchedulePreviewComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not request candidate dates when startDate is not yet filled in', fakeAsync(() => {
    fixture.detectChanges();
    tick(300);

    httpMock.expectNone(optionsUrl);
    expect(component.candidateDates()).toEqual([]);
  }));

  it('requests candidate dates once the fixed-term form has enough data, and populates the dropdown', fakeAsync(() => {
    fixture.detectChanges();

    component.form.patchValue({
      startDate: '2026-08-01',
      endDate: '2027-08-01',
      leaseTermType: 'fixed',
      frequency: 'monthly',
      dueOnDay: 1
    });
    tick(300);

    const req = httpMock.expectOne(optionsUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.startDate).toBe('2026-08-01');
    expect(req.request.body.endDate).toBe('2027-08-01');
    expect(req.request.body.leaseTermType).toBe('fixed');
    expect(req.request.body.frequency).toBe('monthly');
    expect(req.request.body.rent).toBeUndefined();
    expect(req.request.body.firstRentalDueDate).toBeUndefined();

    const response: CandidateDateResponse = { dates: ['2026-08-01', '2026-09-01', '2026-10-01'] };
    req.flush(response);

    expect(component.candidateDates()).toEqual(response.dates);
    expect(component.candidateDatesLoading()).toBeFalse();
  }));

  it('never requests candidate dates for Custom frequency, since there is no computed candidate list', fakeAsync(() => {
    fixture.detectChanges();

    component.form.patchValue({
      startDate: '2026-08-01',
      endDate: '2027-08-01',
      leaseTermType: 'fixed',
      frequency: 'custom'
    });
    tick(300);

    httpMock.expectNone(optionsUrl);
    expect(component.candidateDates()).toEqual([]);
  }));

  it('requests candidate dates for a month-to-month lease once the invoice count is set, with no endDate', fakeAsync(() => {
    fixture.detectChanges();

    component.form.patchValue({
      startDate: '2026-08-01',
      leaseTermType: 'month_to_month',
      frequency: 'monthly',
      monthToMonthInvoiceCount: 6
    });
    tick(300);

    const req = httpMock.expectOne(optionsUrl);
    expect(req.request.body.leaseTermType).toBe('month_to_month');
    expect(req.request.body.endDate).toBeNull();
    expect(req.request.body.monthToMonthInvoiceCount).toBe(6);

    req.flush({ dates: ['2026-08-01'] } as CandidateDateResponse);
  }));

  it('clears the selected first rental due date when it no longer appears in the refreshed candidate list', fakeAsync(() => {
    fixture.detectChanges();

    component.form.patchValue({
      startDate: '2026-08-01',
      endDate: '2027-08-01',
      leaseTermType: 'fixed',
      frequency: 'monthly',
      dueOnDay: 1,
      firstRentalDueDate: '2026-09-15'
    });
    tick(300);

    const req = httpMock.expectOne(optionsUrl);
    req.flush({ dates: ['2026-08-01', '2026-09-01'] } as CandidateDateResponse);

    expect(component.form.get('firstRentalDueDate')!.value).toBe('');
  }));

  it('clears candidate dates and stops loading when the options request fails', fakeAsync(() => {
    fixture.detectChanges();

    component.form.patchValue({
      startDate: '2026-08-01',
      endDate: '2027-08-01',
      leaseTermType: 'fixed',
      frequency: 'monthly',
      dueOnDay: 1
    });
    tick(300);

    const req = httpMock.expectOne(optionsUrl);
    req.flush('error', { status: 400, statusText: 'Bad Request' });

    expect(component.candidateDates()).toEqual([]);
    expect(component.candidateDatesLoading()).toBeFalse();
  }));

  it('does not submit and marks all fields touched when the form is invalid', () => {
    fixture.detectChanges();

    component.submit();

    httpMock.expectNone(previewUrl);
    expect(component.form.get('startDate')!.touched).toBeTrue();
  });

  it('submits a valid form and populates the result on success', fakeAsync(() => {
    fixture.detectChanges();

    component.form.patchValue({
      startDate: '2026-08-01',
      endDate: '2027-08-01',
      leaseTermType: 'fixed',
      rent: 100,
      frequency: 'monthly',
      dueOnDay: 1,
      firstRentalDueDate: '2026-08-01'
    });
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);

    component.submit();

    expect(component.loading()).toBeTrue();

    const response: PreviewRentScheduleResponse = {
      rows: [{ scheduledDate: '2026-08-01', dueDate: '2026-08-01', rent: 100 }],
      totalInvoices: 1,
      totalAmount: 100
    };
    httpMock.expectOne(previewUrl).flush(response);

    expect(component.loading()).toBeFalse();
    expect(component.result()).toEqual(response);
    expect(component.requestError()).toBeNull();
  }));

  it('surfaces the Problem Details detail message when submit fails with a business validation error', fakeAsync(() => {
    fixture.detectChanges();

    component.form.patchValue({
      startDate: '2026-08-01',
      endDate: '2027-08-01',
      leaseTermType: 'fixed',
      rent: 100,
      frequency: 'monthly',
      dueOnDay: 1,
      firstRentalDueDate: '2026-08-01'
    });
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);

    component.submit();

    httpMock.expectOne(previewUrl).flush(
      { type: 'about:blank', title: 'Bad Request', status: 400, detail: 'Rent must be greater than 0.' },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(component.loading()).toBeFalse();
    expect(component.result()).toBeNull();
    expect(component.requestError()).toBe('Rent must be greater than 0.');
  }));

  it('shows a connectivity message when the API cannot be reached', fakeAsync(() => {
    fixture.detectChanges();

    component.form.patchValue({
      startDate: '2026-08-01',
      endDate: '2027-08-01',
      leaseTermType: 'fixed',
      rent: 100,
      frequency: 'monthly',
      dueOnDay: 1,
      firstRentalDueDate: '2026-08-01'
    });
    tick(300);
    httpMock.expectOne(optionsUrl).flush({ dates: ['2026-08-01'] } as CandidateDateResponse);

    component.submit();

    httpMock.expectOne(previewUrl).error(new ProgressEvent('error'), { status: 0 });

    expect(component.requestError()).toBe(
      'Could not reach the API. Is it running and is CORS configured for this origin?'
    );
  }));
});
