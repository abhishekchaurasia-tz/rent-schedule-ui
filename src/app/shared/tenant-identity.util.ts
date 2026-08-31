/** A made-up person standing in for a tenant the backend only knows by id. */
export interface TenantIdentity {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
}

/** Names the placeholder identities are drawn from. Arbitrary — nothing depends on the values. */
const FIRST_NAMES = [
  'Ada', 'Bilal', 'Chandra', 'Diego', 'Elif', 'Farhan', 'Grace', 'Hina',
  'Ivan', 'Jaya', 'Kenji', 'Leila', 'Marco', 'Nadia', 'Omar', 'Priya'
];

/** Surnames the placeholder identities are drawn from. */
const LAST_NAMES = [
  'Ahmed', 'Baker', 'Chowdhury', 'Diaz', 'Eriksen', 'Fontaine', 'Gupta', 'Haddad',
  'Iyer', 'Jensen', 'Kaur', 'Lindqvist', 'Mensah', 'Novak', 'Okafor', 'Pereira'
];

/**
 * Invents a stable stand-in person for a tenant id.
 *
 * The tenants endpoint stores shares against a `tenantId` and carries no personal fields, and this
 * app has no tenant-profile service to look one up in — so the name, email and mobile on screen have
 * to come from somewhere. They are **derived from the id** rather than randomised, so re-opening a
 * screen shows the same made-up person each time instead of a fresh one on every reload; a row that
 * changed its name on every load would look like the data had changed when nothing had.
 *
 * Shared between the ADD TENANTS screen and the Add Additional Fee page rather than duplicated in
 * each: the whole point is that the *same* tenant id reads as the *same* person wherever it appears,
 * which two independent copies would stop guaranteeing the moment either one was edited.
 *
 * None of it is sent anywhere. The `tenantId` is the only identity that leaves a screen.
 */
export function placeholderTenantIdentity(tenantId: string): TenantIdentity {
  // A plain FNV-style walk over the id. It needs to be stable and well-spread, nothing more —
  // there is no security or collision concern in naming a demo row.
  let hash = 2166136261;
  for (const character of tenantId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  const firstName = FIRST_NAMES[hash % FIRST_NAMES.length];
  const lastName = LAST_NAMES[(hash >>> 8) % LAST_NAMES.length];

  // The last four hex characters of the id, so two placeholder people who happen to draw the same
  // name still get different contact details.
  const suffix = tenantId.replace(/[^0-9a-f]/gi, '').slice(-4).toLowerCase() || '0000';

  return {
    firstName,
    lastName,
    email: `${firstName}.${lastName}.${suffix}@example.com`.toLowerCase(),
    mobile: `555-${(hash % 900 + 100).toString()}-${(hash >>> 16) % 9000 + 1000}`
  };
}
