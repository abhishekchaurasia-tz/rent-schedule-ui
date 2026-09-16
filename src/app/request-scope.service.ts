import { Injectable, signal } from '@angular/core';

import { environment } from '../environments/environment';

/**
 * Where the remembered scope values live between reloads, **keyed by environment** (requirement 15b).
 *
 * One shared key would mean pasting a qa token wipes the dev one, and the next dev run fails with a
 * `401` that looks like a broken environment rather than last Tuesday's paste. The same reasoning
 * applies to the three ids, which is why they moved here too: a qa account id is not a dev one.
 *
 * **One-time effect of that move:** values remembered under the old un-keyed name are not found on the
 * first load after this ships, and each id falls back to a freshly generated one. Nothing breaks — a
 * generated id is what a fresh browser has always had — but a tester who had typed real ids will need
 * to type them once more.
 */
const STORAGE_KEY = `innago.test-scope.${environment.name}`;

/** The shape persisted under {@link STORAGE_KEY}. */
interface StoredScope {
  organizationId?: string;
  propertyOwnerId?: string;
  identityId?: string;
  accessToken?: string;
}

/**
 * Holds the three identifiers this application sends on every Billing API request —
 * `OrganizationUid` and `PropertyOwnerUid`, which say *on whose behalf* it is acting (backend spec
 * `01-rent-agreement.md` v89 FR-127, v90 FR-128), and `IdentityId`, which says *who* is acting and is
 * recorded in `created_by` / `modified_by` on every row written (v91 FR-129).
 *
 * **Why a service and not a form control.** `scopeHeadersInterceptor` runs outside any component and
 * cannot read an input box, so something has to sit between the two. This is that something, and it is
 * the only new structure requirement 12 introduces.
 *
 * **Why the values are typed rather than invented (spec D1, reversed 2026-09-14).** This application is
 * a test harness that never reaches production. Its purpose is to drive real dev and qa environments,
 * and an identifier nobody can set cannot be pointed at a real account — which would leave the whole
 * header change untestable against anything but itself. So both values are editable in the shell's
 * settings box.
 *
 * **Why they still start populated.** A tester who never opens the box must still get a `201`, not a
 * `400` about a header they have never heard of. Each id falls back to a freshly invented one, so the
 * headers are always well-formed; what the box buys is the ability to *override* them.
 *
 * When real sign-in arrives this service and the interceptor both retire: the token supplies the same
 * two values and the headers stop being the client's business.
 */
@Injectable({ providedIn: 'root' })
export class RequestScopeService {
  private readonly _organizationId = signal(readStored('organizationId'));

  private readonly _propertyOwnerId = signal(readStored('propertyOwnerId'));

  private readonly _identityId = signal(readStored('identityId'));

  /**
   * The bearer token, if one has been pasted.
   *
   * **Read without the generated fallback the three ids use**, because an invented token is worse than
   * none: it looks real, is refused at the gateway, and sends whoever is debugging to look for the
   * wrong problem.
   */
  private readonly _accessToken = signal(readStoredToken());

  /** The account the agreement is filed under — sent as the `OrganizationUid` header. */
  readonly organizationId = this._organizationId.asReadonly();

  /** The property owner the agreement is for — sent as the `PropertyOwnerUid` header. */
  readonly propertyOwnerId = this._propertyOwnerId.asReadonly();

  /**
   * The person performing the action — sent as the `IdentityId` header (v22, requirement 13c).
   *
   * **Unlike the other two, this one is not required.** The backend never refuses a write for its
   * absence (FR-129d): it records the row as unattributed and logs a warning. So a wrong or missing
   * value here costs an honest audit trail, not a working screen — which is why nothing in this
   * application validates it or blocks on it.
   */
  readonly identityId = this._identityId.asReadonly();

  /**
   * The access token sent as `Authorization: Bearer …` on every Billing API request (requirement 15).
   *
   * **Empty means send no header at all**, which is the local build's normal state: there is no
   * gateway in front of Billing and Billing registers no authentication scheme of its own. On the dev
   * and qa builds the gateway's `/billing/{everything}` route requires a bearer, so without one every
   * request is refused **before Billing is reached** — which is what this exists to fix.
   */
  readonly accessToken = this._accessToken.asReadonly();

  /**
   * Replaces the account id and remembers it.
   *
   * An empty or blank value is ignored rather than stored: a blank box would send an empty header,
   * which the backend refuses with a `400` that reads as a bug in the service rather than an empty
   * field here.
   */
  setOrganizationId(value: string): void {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return;
    }

    this._organizationId.set(trimmed);
    this.persist();
  }

  /** Replaces the property owner id and remembers it. Blank values are ignored, as above. */
  setPropertyOwnerId(value: string): void {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return;
    }

    this._propertyOwnerId.set(trimmed);
    this.persist();
  }

  /**
   * Replaces the acting user and remembers it. Blank values are ignored, as above — though for a
   * different reason than the other two: an empty `IdentityId` is accepted by the backend and simply
   * records the row as unattributed, so ignoring a blank here keeps the last usable value rather than
   * silently degrading the audit trail on a stray keystroke.
   */
  setIdentityId(value: string): void {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return;
    }

    this._identityId.set(trimmed);
    this.persist();
  }

  /**
   * Replaces the access token and remembers it.
   *
   * **A blank is stored, not ignored — the opposite of the three setters above**, and the difference is
   * the point. They ignore a blank because an empty header is a `400` from the backend. An empty token
   * means *send no `Authorization` at all*, so ignoring a blank here would make the box impossible to
   * clear once anything had been typed into it.
   *
   * Trimmed because a copied token routinely carries whitespace, and a leading space makes the header
   * malformed in a way that reads as a server fault rather than a bad paste.
   */
  setAccessToken(value: string): void {
    this._accessToken.set(value.trim());
    this.persist();
  }

  private persist(): void {
    const scope: StoredScope = {
      organizationId: this._organizationId(),
      propertyOwnerId: this._propertyOwnerId(),
      identityId: this._identityId(),
      accessToken: this._accessToken()
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scope));
    } catch {
      // A browser with storage disabled still works; the values simply do not survive a reload.
    }
  }
}

/**
 * Reads one remembered id, falling back to a fresh invented one.
 *
 * Wrapped in try/catch because `localStorage` throws rather than returning null in a private window
 * with site data blocked — and a settings box is not worth breaking the whole application over.
 */
/**
 * Reads the remembered token, defaulting to **empty** rather than a generated value.
 *
 * Separate from {@link readStored} for exactly that reason: the three ids seed themselves so a tester
 * who never opens the box still gets a `201` instead of a `400` about a header they have never heard
 * of. A token has no such safe invention — a fabricated one is refused, and looks real while it is.
 */
function readStoredToken(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredScope;
      if (typeof parsed.accessToken === 'string') {
        return parsed.accessToken.trim();
      }
    }
  } catch {
    // `localStorage` throws rather than returning null in a private window with site data blocked,
    // and a settings box is not worth breaking the whole application over.
  }

  return '';
}

function readStored(key: keyof StoredScope): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredScope;
      const value = parsed[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
  } catch {
    // Fall through to a generated value.
  }

  return crypto.randomUUID();
}
