import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { environment } from '../environments/environment';

import { RequestScopeService } from './request-scope.service';

/**
 * The application shell: the sidebar, the router outlet, and the test-scope settings box.
 *
 * **Why a settings box lives in the shell.** The two caller-scope ids it holds are sent on every
 * Billing API request (backend spec `01-rent-agreement.md` v89 FR-127, v90 FR-128), so they belong to
 * no single screen. Putting them in the sidebar makes them reachable from all of them without a route
 * of their own, and visible enough that nobody has to wonder which account their test lease landed
 * under.
 *
 * **This is a test harness, not a production client** — which is the whole reason these are editable at
 * all. A real client takes both from the signed-in token and shows neither.
 */
@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'rent-schedule-ui';

  /** Holds the two ids the interceptor sends, and remembers them across reloads. */
  protected readonly scope = inject(RequestScopeService);

  /**
   * The environment this build targets, shown beside the token field so a tester on the qa build can
   * see at a glance that they are not looking at the dev token (requirement 15b).
   */
  protected readonly environmentName = environment.name;

  /**
   * Whether to offer the access-token field at all (requirement 15a).
   *
   * **Only the dev and qa builds**, because they are the two that reach Billing through a gateway
   * whose route demands a bearer. The local build talks to Billing directly and Billing registers no
   * authentication scheme, so a token there changes nothing; a production build would carry real
   * sign-in, and a paste-a-credential box is somewhere a token gets typed into the wrong window and
   * then remembered in that browser.
   *
   * This gates the **field**, not the header. The header is attached on whatever the token holds
   * (requirement 15d), so an empty box on any build still sends nothing — hiding the field alone
   * would not give that.
   */
  protected readonly showAccessToken = environment.name === 'dev' || environment.name === 'qa';

  /**
   * Whether to offer the three identifier fields at all (requirement 15g).
   *
   * **The local build only, and this is v26's correction.** They were offered everywhere, which read
   * as though typing one on the qa build pointed that build at an account — it never did. The gateway
   * derives the caller from the token, so on `dev` and `qa` these three are not sent once a token is
   * in play, and as of v26 are not sent before one is either: a value nobody can act on is worse than
   * an absent field, because it invites a tester to set it and then to trust what they set.
   *
   * The two flags are exclusive by construction — `local` gets the ids, `dev` and `qa` get the token,
   * `production` gets neither — and each is written as its own condition rather than one as the
   * negation of the other, because `production` has to fall outside both.
   */
  protected readonly showScopeIds = environment.name === 'local';

  /** Applies a typed account id. Blank input is ignored by the service, leaving the previous value. */
  protected onOrganizationIdInput(value: string): void {
    this.scope.setOrganizationId(value);
  }

  /** Applies a typed property owner id. */
  protected onPropertyOwnerIdInput(value: string): void {
    this.scope.setPropertyOwnerId(value);
  }

  /** Publishes the acting user the Billing API records in `created_by` / `modified_by` (v22, 13c). */
  /**
   * Replaces the access token.
   *
   * **A blank is passed through rather than filtered**, unlike the three ids: clearing the box is how
   * a tester turns the `Authorization` header off again.
   *
   * @param value What was pasted.
   */
  protected onAccessTokenInput(value: string): void {
    this.scope.setAccessToken(value);
  }

  protected onIdentityIdInput(value: string): void {
    this.scope.setIdentityId(value);
  }
}
