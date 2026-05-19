/**
 * MC-AUTH-PHASE2-WARROOM (+ WARROOM-PERMISSIONS, 2026-05-19) — War Room auth
 * route tests.
 *
 * Confirms each /api/war-room/* route enforces the canonical permission gate
 * (WARROOM_VIEW for reads, WARROOM_TASK_WRITE for writes) and rejects
 * insufficient sessions with 401 / 403 while permitting the documented
 * leadership roles (business_admin, super_admin) under the default
 * ROLE_PERMISSIONS_DEFAULTS map.
 *
 * Mocks next-auth's getServerSession so the suite drives the real
 * passPermissionGate / hasPermission logic in lib/permissions.ts.
 */

export {}; // mark this file as a module so top-level consts don't collide with peer test files

const warRoomGetServerSessionMock = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => warRoomGetServerSessionMock(...args),
}));

const warRoomDashboardDataMock = jest.fn();
jest.mock('@/lib/war-room/data', () => ({
  getWarRoomDashboardData: () => warRoomDashboardDataMock(),
}));

const warRoomRuntimeHealthMock = jest.fn();
jest.mock('@/lib/war-room/runtimeStatus', () => ({
  buildWarRoomRuntimeHealth: (...args: unknown[]) => warRoomRuntimeHealthMock(...args),
}));

const warRoomSourceHealthMock = jest.fn();
jest.mock('@/lib/war-room/sourceHealth', () => ({
  buildWarRoomSourceHealthSnapshot: () => warRoomSourceHealthMock(),
}));

const warRoomValidateMock = jest.fn();
const warRoomLabelsMock = jest.fn().mockReturnValue(['war-room']);
const warRoomDescriptionMock = jest.fn().mockReturnValue('description');
const warRoomPayloadMock = jest.fn().mockReturnValue({ teamId: 't', input: {} });
jest.mock('@/lib/war-room/commandBridge', () => ({
  validateWarRoomTaskIntake: (...args: unknown[]) => warRoomValidateMock(...args),
  buildWarRoomLinearLabels: (...args: unknown[]) => warRoomLabelsMock(...args),
  buildWarRoomLinearDescription: (...args: unknown[]) => warRoomDescriptionMock(...args),
  buildWarRoomLinearIssuePayload: (...args: unknown[]) => warRoomPayloadMock(...args),
}));

function warRoomSession(role: string | null, email: string | null = null) {
  if (!role) return null;
  const resolvedEmail = email ?? `${role}@kulaglass.com`;
  return { user: { email: resolvedEmail, role } };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Make sure tests run with the default permission map, regardless of env.
  delete process.env.ROLE_PERMISSIONS_JSON;
  // Reset the memoized permissions cache so each test sees defaults fresh.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const perms = require('@/lib/permissions');
  perms.resetRolePermissionsCacheForTests();

  warRoomDashboardDataMock.mockResolvedValue({ queues: [], source: 'fixture' });
  warRoomRuntimeHealthMock.mockResolvedValue({ kai: { health: 'ready' } });
  warRoomSourceHealthMock.mockResolvedValue({
    generatedAt: '2026-05-19T00:00:00.000Z',
    environment: 'test',
    sources: [],
    conflicts: [],
  });
  warRoomValidateMock.mockReturnValue({
    ok: true,
    intake: { title: 'Test', requestedBy: 'super_admin@kulaglass.com' },
  });
  delete process.env.LINEAR_API_KEY;
  delete process.env.LINEAR_TEAM_ID;
  delete process.env.LINEAR_BANYANOS_TEAM_ID;
});

// ═══ GET /api/war-room — dashboard read gate (WARROOM_VIEW) ════════════════

describe('GET /api/war-room — gate', () => {
  it('returns 401 when no session', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/war-room/route');
    const res = await GET(new Request('http://t/api/war-room'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for pm (not leadership)', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('pm'));
    const { GET } = await import('@/app/api/war-room/route');
    const res = await GET(new Request('http://t/api/war-room'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for field role', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('field'));
    const { GET } = await import('@/app/api/war-room/route');
    const res = await GET(new Request('http://t/api/war-room'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for estimator', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('estimator'));
    const { GET } = await import('@/app/api/war-room/route');
    const res = await GET(new Request('http://t/api/war-room'));
    expect(res.status).toBe(403);
  });

  it('returns 200 for business_admin', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('business_admin'));
    const { GET } = await import('@/app/api/war-room/route');
    const res = await GET(new Request('http://t/api/war-room'));
    expect(res.status).toBe(200);
    expect(warRoomDashboardDataMock).toHaveBeenCalled();
  });

  it('returns 200 for super_admin', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('super_admin'));
    const { GET } = await import('@/app/api/war-room/route');
    const res = await GET(new Request('http://t/api/war-room'));
    expect(res.status).toBe(200);
  });
});

// ═══ GET /api/war-room/runtime-status — read gate ══════════════════════════

describe('GET /api/war-room/runtime-status — gate', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allInTotal: 0 }),
    }) as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns 401 when no session', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/war-room/runtime-status/route');
    const res = await GET(new Request('http://t/api/war-room/runtime-status'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for pm', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('pm'));
    const { GET } = await import('@/app/api/war-room/runtime-status/route');
    const res = await GET(new Request('http://t/api/war-room/runtime-status'));
    expect(res.status).toBe(403);
  });

  it('returns 200 for business_admin', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('business_admin'));
    const { GET } = await import('@/app/api/war-room/runtime-status/route');
    const res = await GET(new Request('http://t/api/war-room/runtime-status'));
    expect(res.status).toBe(200);
    expect(warRoomRuntimeHealthMock).toHaveBeenCalled();
  });

  it('returns 200 for super_admin', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('super_admin'));
    const { GET } = await import('@/app/api/war-room/runtime-status/route');
    const res = await GET(new Request('http://t/api/war-room/runtime-status'));
    expect(res.status).toBe(200);
  });
});

// ═══ GET /api/war-room/source-health — read gate ═══════════════════════════

describe('GET /api/war-room/source-health — gate', () => {
  it('returns 401 when no session', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/war-room/source-health/route');
    const res = await GET(new Request('http://t/api/war-room/source-health'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for pm', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('pm'));
    const { GET } = await import('@/app/api/war-room/source-health/route');
    const res = await GET(new Request('http://t/api/war-room/source-health'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for sales', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('sales'));
    const { GET } = await import('@/app/api/war-room/source-health/route');
    const res = await GET(new Request('http://t/api/war-room/source-health'));
    expect(res.status).toBe(403);
  });

  it('returns 200 for business_admin', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('business_admin'));
    const { GET } = await import('@/app/api/war-room/source-health/route');
    const res = await GET(new Request('http://t/api/war-room/source-health'));
    expect(res.status).toBe(200);
    expect(warRoomSourceHealthMock).toHaveBeenCalled();
  });

  it('returns 200 for super_admin', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('super_admin'));
    const { GET } = await import('@/app/api/war-room/source-health/route');
    const res = await GET(new Request('http://t/api/war-room/source-health'));
    expect(res.status).toBe(200);
  });
});

// ═══ POST /api/war-room/tasks — write gate (WARROOM_TASK_WRITE) ════════════

describe('POST /api/war-room/tasks — gate', () => {
  const body = JSON.stringify({ title: 'Test intake' });

  it('returns 401 when no session', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(null);
    const { POST } = await import('@/app/api/war-room/tasks/route');
    const res = await POST(new Request('http://t/api/war-room/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for pm', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('pm'));
    const { POST } = await import('@/app/api/war-room/tasks/route');
    const res = await POST(new Request('http://t/api/war-room/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for catalog_admin (not in war-room leadership set)', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('catalog_admin'));
    const { POST } = await import('@/app/api/war-room/tasks/route');
    const res = await POST(new Request('http://t/api/war-room/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 202 preview for business_admin without LINEAR_API_KEY', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('business_admin'));
    const { POST } = await import('@/app/api/war-room/tasks/route');
    const res = await POST(new Request('http://t/api/war-room/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(202);
    expect(warRoomValidateMock).toHaveBeenCalled();
    const callArgs = warRoomValidateMock.mock.calls[0];
    expect(callArgs[1]).toBe('business_admin@kulaglass.com');
  });

  it('returns 202 preview for super_admin without LINEAR_API_KEY', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('super_admin'));
    const { POST } = await import('@/app/api/war-room/tasks/route');
    const res = await POST(new Request('http://t/api/war-room/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(202);
  });

  it('returns 400 when JSON body is invalid (after passing gate)', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('super_admin'));
    const { POST } = await import('@/app/api/war-room/tasks/route');
    const res = await POST(new Request('http://t/api/war-room/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when intake validation fails', async () => {
    warRoomGetServerSessionMock.mockResolvedValue(warRoomSession('super_admin'));
    warRoomValidateMock.mockReturnValueOnce({ ok: false, errors: ['title required'] });
    const { POST } = await import('@/app/api/war-room/tasks/route');
    const res = await POST(new Request('http://t/api/war-room/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(400);
  });
});

// ═══ Backward-compat role set sanity ═══════════════════════════════════════
//
// WAR_ROOM_ROLES is @deprecated and no longer referenced by any active call
// site, but kept exported for backward-compat with anything that imported it
// before the WARROOM-PERMISSIONS migration.

describe('WAR_ROOM_ROLES role set (legacy export)', () => {
  it('still contains business_admin and super_admin', async () => {
    const { WAR_ROOM_ROLES } = await import('@/lib/war-room/api-gate');
    expect(Array.from(WAR_ROOM_ROLES).sort()).toEqual(['business_admin', 'super_admin']);
  });
});
