import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

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

  /** Applies a typed account id. Blank input is ignored by the service, leaving the previous value. */
  protected onOrganizationIdInput(value: string): void {
    this.scope.setOrganizationId(value);
  }

  /** Applies a typed property owner id. */
  protected onPropertyOwnerIdInput(value: string): void {
    this.scope.setPropertyOwnerId(value);
  }
}
