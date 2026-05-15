import {
  isBusinessAdmin,
  requireBusinessAdmin,
  ROLE_PERMISSIONS_DEFAULT,
  roleHasPermission,
} from '@/lib/permissions';
import { getServerSession } from 'next-auth';

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

describe('ADR-006 Amendment 1 business_admin permission gate', () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;

  beforeEach(() => {
    mockGetServerSession.mockReset();
  });

  it('registers business_admin in the canonical permission map', () => {
    expect(ROLE_PERMISSIONS_DEFAULT.business_admin).toEqual(['business:admin']);
    expect(roleHasPermission('business_admin', 'business:admin')).toBe(true);
    expect(roleHasPermission('business_admin', 'admin:all')).toBe(false);
  });

  it('accepts only the business_admin role for the business-admin helper', () => {
    expect(isBusinessAdmin('business_admin')).toBe(true);

    for (const role of ['super_admin', 'owner', 'gm', 'admin_mgr', 'admin', 'none']) {
      expect(isBusinessAdmin(role)).toBe(false);
    }
  });

  it('allows sessions with the business_admin role', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: 'business-admin@kulaglass.com', role: 'business_admin' },
      expires: '2099-01-01T00:00:00.000Z',
    });

    await expect(requireBusinessAdmin()).resolves.toEqual({
      allowed: true,
      role: 'business_admin',
      email: 'business-admin@kulaglass.com',
    });
  });

  it('denies non-business_admin sessions, including admin-all roles', async () => {
    for (const role of ['super_admin', 'owner', 'gm', 'admin_mgr', 'admin', 'none']) {
      mockGetServerSession.mockResolvedValue({
        user: { email: `${role}@kulaglass.com`, role },
        expires: '2099-01-01T00:00:00.000Z',
      });

      await expect(requireBusinessAdmin()).resolves.toMatchObject({
        allowed: false,
        role,
        email: `${role}@kulaglass.com`,
      });
    }
  });
});
