/**
 * BAN-348 PM-V1.0-I — GET/PATCH/DELETE /api/pm-dashboard/layout route tests.
 *
 * Mocks @/db, next-auth, and lib/env to exercise:
 *   - GET returns seeded default when no row exists
 *   - GET returns persisted layout when row exists
 *   - PATCH inserts a new row when none exists
 *   - PATCH updates an existing row when one exists
 *   - DELETE clears the row and returns the seeded default
 *   - 401 when no session, 403 when role unauthorized
 *   - PATCH 400 when payload is malformed
 *   - per-user isolation guarantee
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const PM_USER_ID = '00000000-0000-4000-8000-000000000010';
const PM_EMAIL = 'pm@kulaglass.com';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const insertValuesSpy = jest.fn();
const updateSetSpy = jest.fn();
const deleteWhereSpy = jest.fn();

function makeSelectChain() {
  const limit = jest.fn(async () => selectResultQueue.shift() ?? []);
  const where = jest.fn(() => ({ limit }));
  const from = jest.fn(() => ({ where }));
  return { from };
}

const mockDb = {
  select: jest.fn(() => makeSelectChain()),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      insertValuesSpy(tableHandle._label, vals);
      return undefined;
    },
  })),
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(vals);
      return { where: () => undefined };
    },
  })),
  delete: jest.fn(() => ({
    where: (clause: unknown) => {
      deleteWhereSpy(clause);
      return undefined;
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'layout_id', 'tenant_id', 'user_id', 'dashboard_kind',
    'layout_data', 'visible_widgets', 'last_modified', 'created_at',
    'email', 'role',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  user_dashboard_layouts: tbl('user_dashboard_layouts'),
  users: tbl('users'),
}));

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  __esModule: true,
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock('@/lib/env', () => ({
  getDefaultTenantId: () => TENANT_ID,
  isPostgresWriteEnabled: () => true,
}));

beforeEach(() => {
  jest.clearAllMocks();
  selectResultQueue.length = 0;
  mockGetServerSession.mockResolvedValue({
    user: { email: PM_EMAIL, role: 'pm' },
  });
});

describe('GET /api/pm-dashboard/layout', () => {
  it('returns the seeded default when no row exists', async () => {
    selectResultQueue.push([{ user_id: PM_USER_ID }]); // resolveCallerUserId
    selectResultQueue.push([]);                        // layout fetch
    const { GET } = await import('@/app/api/pm-dashboard/layout/route');
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.is_default).toBe(true);
    expect(body.dashboard_kind).toBe('PM_OVERVIEW');
    expect(body.layout_data.items.length).toBeGreaterThan(0);
    expect(body.visible_widgets).toContain('MY_OPEN_ACTIONS');
  });

  it('returns the persisted layout when a row exists', async () => {
    selectResultQueue.push([{ user_id: PM_USER_ID }]);
    selectResultQueue.push([{
      layout_id: 'layout-1',
      tenant_id: TENANT_ID,
      user_id: PM_USER_ID,
      dashboard_kind: 'PM_OVERVIEW',
      layout_data: { items: [{ i: 'MY_OPEN_ACTIONS', x: 1, y: 2, w: 3, h: 4 }] },
      visible_widgets: ['MY_OPEN_ACTIONS'],
      last_modified: '2026-05-19T12:00:00Z',
    }]);
    const { GET } = await import('@/app/api/pm-dashboard/layout/route');
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.is_default).toBe(false);
    expect(body.layout_data.items[0]).toMatchObject({ i: 'MY_OPEN_ACTIONS', x: 1, y: 2, w: 3, h: 4 });
    expect(body.visible_widgets).toEqual(['MY_OPEN_ACTIONS']);
  });

  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/pm-dashboard/layout/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not PM-class', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: 'glazier@kulaglass.com', role: 'glazier' },
    });
    const { GET } = await import('@/app/api/pm-dashboard/layout/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('routes super_admin to the GM_OVERVIEW variant', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: 'sa@kulaglass.com', role: 'super_admin' },
    });
    selectResultQueue.push([{ user_id: 'sa-user' }]);
    selectResultQueue.push([]);
    const { GET } = await import('@/app/api/pm-dashboard/layout/route');
    const res = await GET();
    const body = await res.json();
    expect(body.dashboard_kind).toBe('GM_OVERVIEW');
    expect(body.visible_widgets).toContain('PROJECT_HEALTH_HEAT_MAP');
  });
});

describe('PATCH /api/pm-dashboard/layout', () => {
  it('rejects malformed layout_data', async () => {
    selectResultQueue.push([{ user_id: PM_USER_ID }]);
    const { PATCH } = await import('@/app/api/pm-dashboard/layout/route');
    const res = await PATCH(new Request('http://localhost/api/pm-dashboard/layout', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ layout_data: 'oops', visible_widgets: [] }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects malformed visible_widgets', async () => {
    selectResultQueue.push([{ user_id: PM_USER_ID }]);
    const { PATCH } = await import('@/app/api/pm-dashboard/layout/route');
    const res = await PATCH(new Request('http://localhost/api/pm-dashboard/layout', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        layout_data: { items: [{ i: 'MY_OPEN_ACTIONS', x: 0, y: 0, w: 6, h: 2 }] },
        visible_widgets: 'all',
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('inserts a new row when none exists', async () => {
    selectResultQueue.push([{ user_id: PM_USER_ID }]);
    selectResultQueue.push([]); // existing layout check
    const { PATCH } = await import('@/app/api/pm-dashboard/layout/route');
    const res = await PATCH(new Request('http://localhost/api/pm-dashboard/layout', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        layout_data: { items: [{ i: 'MY_OPEN_ACTIONS', x: 0, y: 0, w: 6, h: 2 }] },
        visible_widgets: ['MY_OPEN_ACTIONS'],
      }),
    }));
    expect(res.status).toBe(200);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      'user_dashboard_layouts',
      expect.objectContaining({
        tenant_id: TENANT_ID,
        user_id: PM_USER_ID,
        dashboard_kind: 'PM_OVERVIEW',
        visible_widgets: ['MY_OPEN_ACTIONS'],
      }),
    );
    expect(updateSetSpy).not.toHaveBeenCalled();
  });

  it('updates an existing row when one exists', async () => {
    selectResultQueue.push([{ user_id: PM_USER_ID }]);
    selectResultQueue.push([{ layout_id: 'existing-row' }]);
    const { PATCH } = await import('@/app/api/pm-dashboard/layout/route');
    const res = await PATCH(new Request('http://localhost/api/pm-dashboard/layout', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        layout_data: { items: [{ i: 'MY_PROJECTS', x: 6, y: 0, w: 6, h: 2 }] },
        visible_widgets: ['MY_PROJECTS'],
      }),
    }));
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        layout_data: { items: [{ i: 'MY_PROJECTS', x: 6, y: 0, w: 6, h: 2 }] },
        visible_widgets: ['MY_PROJECTS'],
      }),
    );
    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

});

describe('DELETE /api/pm-dashboard/layout', () => {
  it('deletes the row and returns the seeded default', async () => {
    selectResultQueue.push([{ user_id: PM_USER_ID }]);
    const { DELETE } = await import('@/app/api/pm-dashboard/layout/route');
    const res = await DELETE();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.is_default).toBe(true);
    expect(mockDb.delete).toHaveBeenCalled();
    expect(deleteWhereSpy).toHaveBeenCalled();
  });
});

describe('PATCH gated by isPostgresWriteEnabled', () => {
  beforeAll(() => {
    jest.resetModules();
    jest.doMock('@/db', () => ({
      __esModule: true,
      db: mockDb,
      user_dashboard_layouts: tbl('user_dashboard_layouts'),
      users: tbl('users'),
    }));
    jest.doMock('next-auth', () => ({
      __esModule: true,
      getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
    }));
    jest.doMock('@/lib/env', () => ({
      getDefaultTenantId: () => TENANT_ID,
      isPostgresWriteEnabled: () => false,
    }));
  });

  it('returns 503 when writes are disabled', async () => {
    selectResultQueue.push([{ user_id: PM_USER_ID }]);
    const { PATCH } = await import('@/app/api/pm-dashboard/layout/route');
    const res = await PATCH(new Request('http://localhost/api/pm-dashboard/layout', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        layout_data: { items: [{ i: 'MY_OPEN_ACTIONS', x: 0, y: 0, w: 6, h: 2 }] },
        visible_widgets: ['MY_OPEN_ACTIONS'],
      }),
    }));
    expect(res.status).toBe(503);
  });
});
