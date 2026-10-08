import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';

import { environment } from '../../environments/environment';
import { OwnerBankDetail } from './owner-bank.models';

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
   * **A failure answers an empty list rather than an error.** The panel treats "no accounts" and
   * "could not read the accounts" the same way — it says an online return cannot be started and keeps
   * the offline tab working — so a 401 from a missing token, or merlin being down, degrades the one
   * tab that needs the list instead of breaking the whole screen.
   */
  list(): Observable<OwnerBankDetail[]> {
    return this.http.get<OwnerBankDetail[]>(this.url).pipe(catchError(() => of([])));
  }
}
