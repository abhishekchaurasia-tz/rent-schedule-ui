import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { LineItemsService } from './line-items.service';
import { LineItemResponse } from './line-item.models';

describe('LineItemsService', () => {
  let service: LineItemsService;
  let httpMock: HttpTestingController;

  const baseUrl = `${environment.apiBaseUrl}/api/v1/line-items`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });

    service = TestBed.inject(LineItemsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('list() gets /api/v1/line-items with propertyOwnerId and scope as query params', () => {
    const expectedResponse: LineItemResponse[] = [
      { id: '11111111-1111-1111-1111-111111111111', name: 'Parking', itemType: 'Parking', isDepositType: false }
    ];

    let actualResponse: LineItemResponse[] | undefined;
    service.list('22222222-2222-2222-2222-222222222222', 'AllExcludingCredit').subscribe((response) => (actualResponse = response));

    const req = httpMock.expectOne(
      (r) => r.url === baseUrl && r.params.get('propertyOwnerId') === '22222222-2222-2222-2222-222222222222' && r.params.get('scope') === 'AllExcludingCredit'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('isHOATerm')).toBeFalse();
    expect(req.request.params.has('isFromIncomeList')).toBeFalse();
    expect(req.request.params.has('search')).toBeFalse();

    req.flush(expectedResponse);

    expect(actualResponse).toEqual(expectedResponse);
  });

  it('list() includes isHOATerm, isFromIncomeList, and search when provided', () => {
    service
      .list('22222222-2222-2222-2222-222222222222', 'AllExcludingCredit', {
        isHOATerm: true,
        isFromIncomeList: false,
        search: 'park'
      })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === baseUrl);
    expect(req.request.params.get('isHOATerm')).toBe('true');
    expect(req.request.params.get('isFromIncomeList')).toBe('false');
    expect(req.request.params.get('search')).toBe('park');

    req.flush([]);
  });

  it('list() propagates an HTTP error response to the caller', () => {
    let error: unknown;
    service.list('22222222-2222-2222-2222-222222222222', 'DepositOnly').subscribe({
      error: (err) => (error = err)
    });

    const req = httpMock.expectOne((r) => r.url === baseUrl);
    req.flush(
      {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'PropertyOwnerId is required.'
      },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(error).toBeTruthy();
  });
});
