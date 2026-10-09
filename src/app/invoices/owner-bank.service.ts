import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  OwnerBankDetail,
  OwnerBankDetailWire,
  OwnerBankListResponse,
  OwnerBankListResult
} from './owner-bank.models';

/**
 * The owner's bank accounts, read from merlin.
 *
 * **merlin owns this list and Billing does not have it**, so the call goes straight to merlin's
 * `Home/DropDown/GetPropertyOwnerBankDetails` through the same gateway and on the same bearer as every
 * Billing call (`scopeHeadersInterceptor`). merlin takes no parameters here — it reads the
 * organization from the caller's session — so the list is always *this* owner's accounts.
 *
 * Read-only, and the monolith is not changed in any way to serve it: the endpoint already exists and
 * already backs the owner app's own bank picker.
 */
@Injectable({ providedIn: 'root' })
export class OwnerBankService {
  private readonly url = `${environment.monolithBaseUrl}/Home/DropDown/GetPropertyOwnerBankDetails`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Lists the owner's bank accounts.
   *
   * **A failure answers rather than throwing, but it says it failed.** The panel blocks an online
   * return either way and keeps the offline tab working, so merlin being unreachable degrades the one
   * tab that needs the list instead of breaking the whole screen — but `unavailable` lets it tell the
   * owner that the list could not be read, instead of claiming they have no bank account. A 404 from
   * a proxy pointed at the wrong service and a 401 from a missing bearer both land here.
   */
  list(): Observable<OwnerBankListResult> {
    return this.http.get<OwnerBankListResponse>(this.url).pipe(
      map((response) =>
        Array.isArray(response?.Data)
          ? { banks: response.Data.map(OwnerBankService.fromWire), unavailable: false }
          : { banks: [], unavailable: true }
      ),
      catchError(() => of({ banks: [], unavailable: true }))
    );
  }

  /**
   * Turns one of merlin's PascalCase accounts into the camelCase shape the panel reads.
   *
   * **Both halves of this were wrong before and both failed silently.** The response was typed as a
   * bare array when merlin wraps it in `{ Data: [...] }`, and the fields were read in camelCase when
   * merlin sends PascalCase -- so the list came back empty, and would have come back as a row of
   * `undefined`s had the first been fixed alone. Neither threw, so the panel simply said no account
   * was available.
   *
   * The three encrypted fields are copied across untouched; see `OwnerBankDetail`.
   */
  private static fromWire(wire: OwnerBankDetailWire): OwnerBankDetail {
    return {
      bankId: wire.BankId,
      bankAccountNumber: wire.BankAccountNumber,
      bankAccountName: wire.BankAccountName,
      routingNumber: wire.RoutingNumber,
      fundingSourceId: wire.FundingSourceId,
      accountHolder: wire.AccountHolder,
      accountTypeId: wire.AccountTypeId,
      paymentServiceTypeId: wire.PaymentServiceTypeId,
      displayBankAccountNumber: wire.DisplayBankAccountNumber,
      companyName: wire.CompanyName,
      verifier: wire.Verifier
    };
  }
}
