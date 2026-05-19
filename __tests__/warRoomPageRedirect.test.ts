/**
 * WARROOM-PERMISSIONS — page-level redirect tests for `/war-room`.
 *
 * Covers the three redirect scenarios on the server component
 * `app/war-room/page.tsx`:
 *
 *   1. No session                → redirect('/login')
 *   2. Session without WARROOM_VIEW → redirect('/?error=war_room_access')
 *   3. Session with    WARROOM_VIEW → renders the dashboard (no redirect)
 *
 * Replaces the previous `email.endsWith('@kulaglass.com')` redirect — the
 * page now consults `hasPermission(session, 'WARROOM_VIEW')` so widening
 * access is an env-var edit, not a code change.  See PR description for
 * the `ROLE_PERMISSIONS_JSON` override shape.
 */

export {};

class RedirectError extends Error {
  constructor(public readonly target: string) {
    super(`REDIRECT:${target}`);
    this.name = 'RedirectError';
  }
}

const redirectMock = jest.fn((target: string) => {
  throw new RedirectError(target);
});
jest.mock('next/navigation', () => ({
  redirect: (target: string) => redirectMock(target),
}));

const getServerSessionMock = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => getServerSessionMock(...args),
}));

const dashboardDataMock = jest.fn();
jest.mock('@/lib/war-room/data', () => ({
  getWarRoomDashboardData: () => dashboardDataMock(),
}));

jest.mock('@/components/WarRoomDashboard', () => ({
  __esModule: true,
  default: () => null,
}));

function sessionFor(role: string, email = `${role}@kulaglass.com`) {
  return {
    user: { email, role },
    expires: '2099-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ROLE_PERMISSIONS_JSON;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { __resetRolePermissionsForTest } = require('@/lib/permissions-config');
  __resetRolePermissionsForTest();
  dashboardDataMock.mockResolvedValue({ queues: [], source: 'fixture' });
});

async function loadPage() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/app/war-room/page');
  return mod.default as () => Promise<unknown>;
}

describe('app/war-room/page.tsx — redirect guard', () => {
  it('redirects unauthenticated callers to /login', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const Page = await loadPage();
    await expect(Page()).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith('/login');
    expect(dashboardDataMock).not.toHaveBeenCalled();
  });

  it('redirects authenticated callers without WARROOM_VIEW to /?error=war_room_access', async () => {
    getServerSessionMock.mockResolvedValue(sessionFor('pm'));
    const Page = await loadPage();
    await expect(Page()).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith('/?error=war_room_access');
    expect(dashboardDataMock).not.toHaveBeenCalled();
  });

  it('renders the dashboard for sessions that hold WARROOM_VIEW (business_admin)', async () => {
    getServerSessionMock.mockResolvedValue(sessionFor('business_admin'));
    const Page = await loadPage();
    await expect(Page()).resolves.toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(dashboardDataMock).toHaveBeenCalled();
  });

  it('renders the dashboard for super_admin', async () => {
    getServerSessionMock.mockResolvedValue(sessionFor('super_admin'));
    const Page = await loadPage();
    await expect(Page()).resolves.toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(dashboardDataMock).toHaveBeenCalled();
  });

  it('redirects field role even with valid kulaglass.com email (old email-endsWith gate would have allowed)', async () => {
    getServerSessionMock.mockResolvedValue(sessionFor('field', 'someone@kulaglass.com'));
    const Page = await loadPage();
    await expect(Page()).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith('/?error=war_room_access');
  });

  it('honors ROLE_PERMISSIONS_JSON env override to widen access (gm gains WARROOM_VIEW)', async () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({ gm: ['WARROOM_VIEW'] });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { __resetRolePermissionsForTest } = require('@/lib/permissions-config');
    __resetRolePermissionsForTest();
    getServerSessionMock.mockResolvedValue(sessionFor('gm'));
    const Page = await loadPage();
    await expect(Page()).resolves.toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
