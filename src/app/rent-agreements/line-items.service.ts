import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { LineItemResponse, LineItemScope } from './line-item.models';

/**
 * Options for {@link LineItemsService.list}, consulted only when `scope` is `'AllExcludingCredit'`
 * (`docs/specs/02-invoicing.md` §Contract → API Endpoints).
 */
export interface LineItemListOptions {
  isHOATerm?: boolean;
  isFromIncomeList?: boolean;
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class LineItemsService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/line-items`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Lists the `LineItem` catalog entries visible to `propertyOwnerId`, narrowed by `scope`.
   */
  list(propertyOwnerId: string, scope: LineItemScope, options?: LineItemListOptions): Observable<LineItemResponse[]> {
    let params = new HttpParams().set('propertyOwnerId', propertyOwnerId).set('scope', scope);

    if (options?.isHOATerm !== undefined) {
      params = params.set('isHOATerm', String(options.isHOATerm));
    }
    if (options?.isFromIncomeList !== undefined) {
      params = params.set('isFromIncomeList', String(options.isFromIncomeList));
    }
    if (options?.search) {
      params = params.set('search', options.search);
    }

    return this.http.get<LineItemResponse[]>(this.baseUrl, { params });
  }
}
