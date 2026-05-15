import { getDefaultTenantId, getKulaTenantUuid } from '@/lib/env';

export const KULA_TENANT_KID = 'TEN-001';
export const KULA_TENANT_SLUG = 'kula-glass';
export const KULA_TENANT_NAME = 'Kula Glass Company';
export const KULA_TENANT_LEGAL_ENTITY_NAME = 'Kula Glass Company, Inc.';
export const KULA_TENANT_STATUS = 'active';
export const KULA_TENANT_SUBSCRIPTION_TIER = 'internal';

export interface TenantContext {
  tenantId: string;
  id: string; // compatibility alias for the tenant_id value
  kid: string;
  name: string;
  slug: string;
  legalEntityName: string;
  status: 'active';
  subscriptionTier: 'internal';
}

/**
 * Resolve the current tenant for v1 single-tenant runtime.
 *
 * Packet 000.5 intentionally does not introduce session/subdomain routing yet;
 * callers receive the configured default tenant, which should be Kula Glass in
 * local/staging until a later multi-tenant routing packet supersedes this helper.
 */
export function getCurrentTenant(): TenantContext {
  const tenantId = getDefaultTenantId();

  return {
    tenantId,
    id: tenantId,
    kid: KULA_TENANT_KID,
    name: KULA_TENANT_NAME,
    slug: KULA_TENANT_SLUG,
    legalEntityName: KULA_TENANT_LEGAL_ENTITY_NAME,
    status: KULA_TENANT_STATUS,
    subscriptionTier: KULA_TENANT_SUBSCRIPTION_TIER,
  };
}

export function getKulaTenantId(): string {
  return getKulaTenantUuid();
}
