/**
 * WARROOM-PERMISSIONS dispatch (2026-05-19) — War Room page redirect tests.
 *
 * Confirms app/war-room/page.tsx now gates on hasPermission(WARROOM_VIEW)
 * instead of email-endsWith and exercises the three redirect scenarios that
 * PR #188 left out of scope:
 *   1. No session  → redirect('/login')
 *   2. Session w/ insufficient permission → redirect('/?error=war_room_access')
 *   3. Session w/ WARROOM_VIEW → renders WarRoomDashboard (no redirect)
 */

export {}; // module-scope guard

const warRoomPageGetServerSessionMock = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => warRoomPageGetServerSessionMock(...args),
}));

const warRoomPageRedirectMock = jest.fn(() => {
  throw new Error('NEXT_REDIRECT');
});
jest.mock('next/navigation', () => ({
  redirect: (target: string) => warRoomPageRedirectMock(target),
}));

const warRoomPageDataMock = jest.fn();
jest.mock('@/lib/war-room/data', () => ({
  getWarRoomDashboardData: () => warRoomPageDataMock(),
}));

jest.mock('@/components/WarRoomDashboard', () => ({
  __esModule: true,
  default: (props: { initialData?: unknown }) => ({
    type: 'WarRoomDashboard',
    props,
  }),
}));

function warRoomPageSession(role: string, email = `${role}@kulaglass.com`) {
  return { user: { email, role } };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ROLE_PERMISSIONS_JSON;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const perms = require('@/lib/permissions');
  perms.resetRolePermissionsCacheForTests();
  warRoomPageDataMock.mockResolvedValue({ queues: [], source: 'fixture' });
});

describe('WarRoomPage redirect behavior', () => {
  it('redirects to /login when there is no session', async () => {
    warRoomPageGetServerSessionMock.mockResolvedValue(null);
    const mod = await import('@/app/war-room/page');
    await expect(mod.default()).rejects.toThrow('NEXT_REDIRECT');
    expect(warRoomPageRedirectMock).toHaveBeenCalledWith('/login');
    expect(warRoomPageDataMock).not.toHaveBeenCalled();
  });

  it('redirects to /login when session has no email', async () => {
    warRoomPageGetServerSessionMock.mockResolvedValue({ user: { email: null } });
    const mod = await import('@/app/war-room/page');
    await expect(mod.default()).rejects.toThrow('NEXT_REDIRECT');
    expect(warRoomPageRedirectMock).toHaveBeenCalledWith('/login');
  });

  it('redirects to /?error=war_room_access when role lacks WARROOM_VIEW', async () => {
    warRoomPageGetServerSessionMock.mockResolvedValue(warRoomPageSession('pm'));
    const mod = await import('@/app/war-room/page');
    await expect(mod.default()).rejects.toThrow('NEXT_REDIRECT');
    expect(warRoomPageRedirectMock).toHaveBeenCalledWith('/?error=war_room_access');
    expect(warRoomPageDataMock).not.toHaveBeenCalled();
  });

  it('renders WarRoomDashboard for business_admin (WARROOM_VIEW granted)', async () => {
    warRoomPageGetServerSessionMock.mockResolvedValue(warRoomPageSession('business_admin'));
    const mod = await import('@/app/war-room/page');
    const result = await mod.default();
    expect(warRoomPageRedirectMock).not.toHaveBeenCalled();
    expect(warRoomPageDataMock).toHaveBeenCalled();
    // Mocked WarRoomDashboard default export is the JSX element type; assert
    // by props rather than by type identifier to stay decoupled from the JSX
    // factory wrapping.
    expect(result?.props?.initialData).toEqual({ queues: [], source: 'fixture' });
  });

  it('renders WarRoomDashboard for super_admin (WARROOM_VIEW granted)', async () => {
    warRoomPageGetServerSessionMock.mockResolvedValue(warRoomPageSession('super_admin'));
    const mod = await import('@/app/war-room/page');
    const result = await mod.default();
    expect(warRoomPageRedirectMock).not.toHaveBeenCalled();
    // Mocked WarRoomDashboard default export is the JSX element type; assert
    // by props rather than by type identifier to stay decoupled from the JSX
    // factory wrapping.
    expect(result?.props?.initialData).toEqual({ queues: [], source: 'fixture' });
  });
});
