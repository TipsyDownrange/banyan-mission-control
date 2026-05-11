import { getRoleFromEmail } from '@/lib/auth';
import { ROLE_PERMISSIONS_DEFAULT, roleHasPermission } from '@/lib/permissions';
import { BANYAN_TENANT_KULA_UUID, getDefaultTenantId, getKulaTenantUuid } from '@/lib/env';
import { getCurrentTenant } from '@/lib/tenant';

describe('Packet 000.5 tenant bootstrap', () => {
  const originalDefaultTenantId = process.env.DEFAULT_TENANT_ID;
  const originalKulaTenantUuid = process.env.BANYAN_TENANT_KULA_UUID;

  afterEach(() => {
    if (originalDefaultTenantId === undefined) delete process.env.DEFAULT_TENANT_ID;
    else process.env.DEFAULT_TENANT_ID = originalDefaultTenantId;

    if (originalKulaTenantUuid === undefined) delete process.env.BANYAN_TENANT_KULA_UUID;
    else process.env.BANYAN_TENANT_KULA_UUID = originalKulaTenantUuid;
  });

  it('resolves Kula as the canonical default tenant', () => {
    delete process.env.DEFAULT_TENANT_ID;
    delete process.env.BANYAN_TENANT_KULA_UUID;

    expect(getKulaTenantUuid()).toBe(BANYAN_TENANT_KULA_UUID);
    expect(getDefaultTenantId()).toBe(BANYAN_TENANT_KULA_UUID);
    expect(getCurrentTenant()).toMatchObject({
      tenantId: BANYAN_TENANT_KULA_UUID,
      id: BANYAN_TENANT_KULA_UUID,
      kid: 'TEN-001',
      name: 'Kula Glass Company',
      slug: 'kula-glass',
      legalEntityName: 'Kula Glass Company, Inc.',
      status: 'active',
      subscriptionTier: 'internal',
    });
  });

  it('allows DEFAULT_TENANT_ID to override the runtime current tenant', () => {
    process.env.BANYAN_TENANT_KULA_UUID = BANYAN_TENANT_KULA_UUID;
    process.env.DEFAULT_TENANT_ID = '11111111-1111-4111-8111-111111111111';

    expect(getCurrentTenant().tenantId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('maps Sean to super_admin with full admin permissions', () => {
    expect(getRoleFromEmail('sean@kulaglass.com')).toBe('super_admin');
    expect(ROLE_PERMISSIONS_DEFAULT.super_admin).toContain('admin:all');
    expect(roleHasPermission('super_admin', 'admin:all')).toBe(true);
    expect(roleHasPermission('super_admin', 'wo:edit')).toBe(true);
  });
});
