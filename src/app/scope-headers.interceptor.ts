import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { environment } from '../environments/environment';

import { RequestScopeService } from './request-scope.service';

/**
 * Whether a request carries the three test-scope ids — `OrganizationUid`, `PropertyOwnerUid` and
 * `IdentityId` (requirement 15f, narrowed by 15g).
 *
 * **Two conditions, and each rules out a different mistake.**
 *
 * *No token.* The gateway derives the caller from a bearer — `UserId`, `OrganizationId`,
 * `PropertyOwnerId` and more. Sending ours alongside it would put two answers to one question in one
 * request, and the client cannot know which the backend records.
 *
 * *The local build only.* This is **v26's correction, and the bug it fixes was invisible from the
 * code.** The ids are typed into the Test scope box, and that box is shown on `local` alone — so on
 * `dev`, `qa` and `production` this application was sending three GUIDs **nobody could see, set or
 * correct**, invented by `crypto.randomUUID()` on first load. Keying on the token alone left exactly
 * that gap: a dev or qa build before a token had been pasted sent three fabricated identifiers as
 * though they meant something. A build whose ids cannot be set does not send ids.
 *
 * Exported and taking both values as arguments rather than reading `environment` itself, because the
 * rule is per-environment and the tests have to be able to ask it about all four builds — a spec that
 * can only ever observe the build it runs under could not cover this at all.
 */
export function sendsScopeIds(environmentName: string, token: string): boolean {
  return token.length === 0 && environmentName === 'local';
}

/**
 * Attaches whichever set of caller headers this build and this token call for — the bearer
 * (requirement 15) or the three scope ids the Billing API reads directly (backend spec
 * `01-rent-agreement.md` v89 FR-127, v90 FR-128), never both.
 *
 * **Scoped to the API on purpose.** Only requests whose URL starts with `environment.apiBaseUrl` are
 * touched; anything else passes through untouched, so neither a credential nor the ids leak to a
 * third party this application happens to call later.
 *
 * **The known cost, accepted rather than hidden (requirement 12e).** Because this is central rather
 * than bolted onto the one save that needs it, the headers ride *every* Billing API call — the invoice
 * list, the line-item pickers, `PUT …/terms`, the lifecycle calls. That is the point: when sign-in
 * lands this interceptor is deleted rather than rewritten.
 */
export const scopeHeadersInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(environment.apiBaseUrl)) {
    return next(request);
  }

  const scope = inject(RequestScopeService);

  const token = scope.accessToken();

  // ONE SET OR THE OTHER, never both -- and on the dev, qa and production builds, never the ids at
  // all. See `sendsScopeIds` for why each half of that is here.
  const headers: Record<string, string> = sendsScopeIds(environment.name, token)
    ? {
        OrganizationUid: scope.organizationId(),
        PropertyOwnerUid: scope.propertyOwnerId(),
        IdentityId: scope.identityId()
      }
    : token
      ? { Authorization: `Bearer ${token}` }
      : {};

  return next(request.clone({ setHeaders: headers }));
};
