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

  const token = scope.accessToken();

  // Requirement 15f -- ONE SET OR THE OTHER, never both.
  //
  // With a token, the gateway derives the caller from it: UserId, OrganizationId, PropertyOwnerId and
  // more. Sending our three ids alongside would put two answers to one question in one request, and
  // the client cannot know which the backend records. Not sending them removes the question rather
  // than documenting it.
  //
  // Without a token -- the local build's normal state -- there is no gateway to derive anything and
  // Billing reads the three headers itself (requirement 12).
  //
  // Keyed on the token rather than on environment.name, and the difference shows in one case: a dev or
  // qa build before a token has been pasted. Keyed on the environment that build would send neither,
  // so every call would carry no caller information at all -- a second failure under the gateway's
  // refusal, teaching nobody anything. Keyed on the token it still sends the ids, is still refused for
  // the real reason, and the refusal still reads as `no token`.
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {
        OrganizationUid: scope.organizationId(),
        PropertyOwnerUid: scope.propertyOwnerId(),
        IdentityId: scope.identityId()
      };

  return next(request.clone({ setHeaders: headers }));
};
