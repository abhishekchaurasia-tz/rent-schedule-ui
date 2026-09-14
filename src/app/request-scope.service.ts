import { Injectable, signal } from '@angular/core';

/** Where the remembered scope ids live between reloads. */
const STORAGE_KEY = 'innago.test-scope';

/** The shape persisted under {@link STORAGE_KEY}. */
interface StoredScope {
  organizationId?: string;
  propertyOwnerId?: string;
  identityId?: string;
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

  private persist(): void {
    const scope: StoredScope = {
      organizationId: this._organizationId(),
      propertyOwnerId: this._propertyOwnerId(),
      identityId: this._identityId()
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
