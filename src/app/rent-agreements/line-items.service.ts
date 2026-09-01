import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { CreateLineItemRequest, LineItemResponse, LineItemScope } from './line-item.models';

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

  /**
   * Resolves a catalog entry by name, creating one scoped to `propertyOwnerId` when no visible entry
   * already carries that name.
   *
   * **Get-or-create, not create** — the backend is idempotent by design, so typing a name that already
   * exists returns that entry rather than failing or duplicating it. That is what makes it safe to call
   * straight from a picker without searching first.
   *
   * Answers `200` with the resolved item either way; `400` on business validation — a deposit-shaped
   * `itemType`, which may only ever be system-defined, is the one a picker can realistically provoke.
   */
  create(request: CreateLineItemRequest): Observable<LineItemResponse> {
    return this.http.post<LineItemResponse>(this.baseUrl, request);
  }
}
