import { effect, inject } from '@angular/core';

import { RequestScopeService } from './request-scope.service';

/**
 * Runs `reload` whenever the Test scope changes — a token pasted or cleared, an id retyped
 * (requirement 15g).
 *
 * **The problem this exists for.** Every screen fetches on open, and the token is pasted afterwards:
 * a tester lands on Add Lease, opens the fee panel, sees an empty item list, pastes the token and
 * watches nothing happen. The data on screen was read as whoever the scope said a moment ago, and
 * nothing tells the screen otherwise. Until this, the only way to see the answer for the new scope was
 * a full page reload — which on a form-bearing screen means retyping the lease.
 *
 * **Call it from a constructor**, where an injection context exists. Each caller passes only the
 * fetch that is safe to repeat: a catalog or a list, never a re-hydration of a form the user is
 * halfway through filling in.
 *
 * **The first execution is dropped, and dropping it is what makes this safe.** An `effect` runs once
 * when change detection first reaches the component — the same pass that runs `ngOnInit`, which is
 * already fetching. Letting it through would make every screen fetch twice on open, and would do it
 * before the component's `@Input()`s decided *what* to fetch: the fee panel would ask for the
 * ordinary catalog on a deposit-only panel.
 *
 * **Skipping the first run rather than comparing revisions**, which was tried and is subtly wrong: a
 * scope change between the component's construction and its first change detection would leave the
 * captured revision already stale, and the effect would fire on that same first pass — fetching twice
 * after all, for the one ordering this is hardest to reproduce.
 */
export function reloadOnScopeChange(reload: () => void): void {
  const scope = inject(RequestScopeService);

  let isFirstRun = true;

  effect(() => {
    // Read unconditionally, and before the guard: a dependency only registers when it is read, so a
    // `return` above this line would leave the effect watching nothing at all and never run again.
    scope.revision();

    if (isFirstRun) {
      isFirstRun = false;
      return;
    }

    reload();
  });
}
