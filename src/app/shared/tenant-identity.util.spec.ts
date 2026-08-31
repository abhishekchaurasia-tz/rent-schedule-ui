import { placeholderTenantIdentity } from './tenant-identity.util';

describe('placeholderTenantIdentity', () => {
  const tenantId = '8f14e45f-ceea-467e-bd9f-000000000001';

  it('derives the same person every time for the same tenant id', () => {
    const first = placeholderTenantIdentity(tenantId);
    const second = placeholderTenantIdentity(tenantId);

    expect(second).toEqual(first);
  });

  it('derives a different person for a different tenant id', () => {
    const other = placeholderTenantIdentity('11111111-2222-3333-4444-555555555555');

    // Not merely "some field differs" — the contact details are suffixed with the id's own last four
    // hex characters, so two different ids can never share an email.
    expect(other.email).not.toBe(placeholderTenantIdentity(tenantId).email);
  });

  it('builds the email from the derived name plus the id last four hex characters', () => {
    const identity = placeholderTenantIdentity(tenantId);

    expect(identity.email).toBe(
      `${identity.firstName}.${identity.lastName}.0001@example.com`.toLowerCase()
    );
  });

  it('falls back to a 0000 suffix when the id carries no hex characters', () => {
    const identity = placeholderTenantIdentity('zzzz');

    expect(identity.email.endsWith('.0000@example.com')).toBeTrue();
  });

  it('always produces a non-empty name and mobile', () => {
    const identity = placeholderTenantIdentity(tenantId);

    expect(identity.firstName.length).toBeGreaterThan(0);
    expect(identity.lastName.length).toBeGreaterThan(0);
    expect(identity.mobile).toMatch(/^555-\d{3}-\d{4}$/);
  });
});
