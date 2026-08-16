import { randomUUID } from "crypto";

// In-memory stand-in for the identity/tenant_user split described in the
// design doc: one identity per verified phone, one profile per tenant.

type Identity = { id: string; phoneE164: string; verifiedAt: number };
type TenantUser = {
  id: string;
  tenantSlug: string;
  identityId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  createdAt: number;
};

const identitiesByPhone = new Map<string, Identity>();
const tenantUsersByKey = new Map<string, TenantUser>();

function tenantUserKey(tenantSlug: string, identityId: string) {
  return `${tenantSlug}:${identityId}`;
}

export function findOrCreateIdentity(phoneE164: string): Identity {
  const existing = identitiesByPhone.get(phoneE164);
  if (existing) return existing;
  const identity: Identity = {
    id: randomUUID(),
    phoneE164,
    verifiedAt: Date.now(),
  };
  identitiesByPhone.set(phoneE164, identity);
  return identity;
}

export function getTenantUser(
  tenantSlug: string,
  identityId: string,
): TenantUser | undefined {
  return tenantUsersByKey.get(tenantUserKey(tenantSlug, identityId));
}

export function createTenantUser(
  tenantSlug: string,
  identityId: string,
  profile: { firstName: string | null; lastName: string | null; email: string | null },
): TenantUser {
  const tenantUser: TenantUser = {
    id: randomUUID(),
    tenantSlug,
    identityId,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    createdAt: Date.now(),
  };
  tenantUsersByKey.set(tenantUserKey(tenantSlug, identityId), tenantUser);
  return tenantUser;
}
