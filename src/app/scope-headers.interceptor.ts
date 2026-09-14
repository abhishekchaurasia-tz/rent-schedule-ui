import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { environment } from '../environments/environment';

import { RequestScopeService } from './request-scope.service';

/**
 * Attaches the two caller-scope headers the Billing API reads — `OrganizationId` and
 * `PropertyOwnerId` (backend spec `01-rent-agreement.md` v89 FR-127, v90 FR-128).
 *
 * **Scoped to the API on purpose.** Only requests whose URL starts with `environment.apiBaseUrl` are
 * touched; anything else passes through untouched, so the ids never leak to a third party this
 * application happens to call later.
 *
 * **The known cost, accepted rather than hidden (requirement 12e).** Because this is central rather
 * than bolted onto the one save that needs it, both headers ride *every* Billing API call — the invoice
 * list, the line-item pickers, `PUT …/terms`, the lifecycle calls. None of them read the headers and
 * the backend ignores what it was not expecting, so nothing breaks. The reason for paying that cost is
 * that this is exactly where a bearer token will be attached when sign-in lands, at which point this
 * interceptor is deleted rather than rewritten.
 */
export const scopeHeadersInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(environment.apiBaseUrl)) {
    return next(request);
  }

  const scope = inject(RequestScopeService);

  return next(
    request.clone({
      setHeaders: {
        OrganizationUid: scope.organizationId(),
        PropertyOwnerUid: scope.propertyOwnerId()
      }
    })
  );
};
