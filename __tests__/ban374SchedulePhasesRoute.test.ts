/**
 * BAN-374 Scheduling Spine — Route tests for /api/schedule/phases.
 *
 * Mocks @/db, next-auth, and @/lib/env to exercise:
 *   - GET listing per engagement_kid (kid-found and not-found paths)
 *   - POST create (validation + happy path)
 *   - PATCH update on /[id]
 *   - DELETE on /[id]
 *   - Permission gate (no session = 401, wrong role = 403)
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const PHASE_ID = '00000000-0000-4000-8000-000000000100';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const insertValuesSpy = jest.fn();
const updateSetSpy = jest.fn();
const deleteWhereSpy = jest.fn();

const mockDb = {
  select: jest.fn(() => {
    const limit = jest.fn(async () => selectResultQueue.shift() ?? []);
    const orderBy = jest.fn(async () => selectResultQueue.shift() ?? []);
    const where = jest.fn(() => ({ limit, orderBy }));
    const from = jest.fn(() => ({ where }));
    return { from };
  }),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      insertValuesSpy(tableHandle._label ?? 'unknown', vals);
      return {
        returning: async () => [{ ...vals, id: PHASE_ID }],
      };
    },
  })),
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(vals);
      return {
        where: () => ({
          returning: async () => [{ id: PHASE_ID, ...vals }],
        }),
      };
    },
  })),
  delete: jest.fn(() => ({
    where: (...args: unknown[]) => {
      deleteWhereSpy(...args);
      return {
        returning: async () => [{ id: PHASE_ID }],
      };
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'id', 'tenant_id', 'engagement_id', 'phase_id', 'name', 'sort_order',
    'planned_start', 'planned_end', 'actual_start', 'actual_end', 'status',
    'kid', 'created_at', 'updated_at',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  schedule_phases: tbl('schedule_phases'),
  schedule_tasks: tbl('schedule_tasks'),
  schedule_dependencies: tbl('schedule_dependencies'),
  schedule_milestones: tbl('schedule_milestones'),
  engagements: tbl('engagements'),
  SCHEDULE_PHASE_STATUSES: ['planned', 'in_progress', 'complete', 'on_hold'],
  SCHEDULE_TASK_STATUSES: ['planned', 'in_progress', 'complete', 'blocked', 'on_hold'],
  SCHEDULE_DEPENDENCY_TYPES: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'],
  SCHEDULE_MILESTONE_TYPES: ['substantial_completion', 'permit', 'inspection', 'owner_walkthrough', 'retainage_release', 'custom'],
  SCHEDULE_MILESTONE_STATUSES: ['pending', 'met', 'missed', 'waived'],
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
    user: { email: 'pm@kulaglass.com', role: 'pm' },
  });
});

describe('GET /api/schedule/phases', () => {
  it('returns 400 when engagement_kid is missing', async () => {
    const { GET } = await import('@/app/api/schedule/phases/route');
    const res = await GET(new Request('http://localhost/api/schedule/phases'));
    expect(res.status).toBe(400);
  });

  it('returns kIDFound:false when the engagement does not exist', async () => {
    selectResultQueue.push([]); // engagement lookup
    const { GET } = await import('@/app/api/schedule/phases/route');
    const res = await GET(new Request('http://localhost/api/schedule/phases?engagement_kid=PRJ-99-9999'));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.kIDFound).toBe(false);
    expect(j.items).toEqual([]);
  });

  it('lists phases for a known engagement', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]); // engagement lookup
    selectResultQueue.push([
      { id: PHASE_ID, name: 'Mobilization', sort_order: 0, status: 'planned' },
    ]); // phases
    const { GET } = await import('@/app/api/schedule/phases/route');
    const res = await GET(new Request('http://localhost/api/schedule/phases?engagement_kid=PRJ-26-0001'));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.kIDFound).toBe(true);
    expect(j.items).toHaveLength(1);
    expect(j.items[0].name).toBe('Mobilization');
  });

  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/schedule/phases/route');
    const res = await GET(new Request('http://localhost/api/schedule/phases?engagement_kid=PRJ-26-0001'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a role that lacks SCHEDULE_VIEW', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: 'none@kulaglass.com', role: 'none' },
    });
    const { GET } = await import('@/app/api/schedule/phases/route');
    const res = await GET(new Request('http://localhost/api/schedule/phases?engagement_kid=PRJ-26-0001'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/schedule/phases', () => {
  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/schedule/phases/route');
    const res = await POST(new Request('http://localhost/api/schedule/phases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engagement_kid: 'PRJ-26-0001' }),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when engagement_kid is unknown', async () => {
    selectResultQueue.push([]); // engagement lookup empty
    const { POST } = await import('@/app/api/schedule/phases/route');
    const res = await POST(new Request('http://localhost/api/schedule/phases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engagement_kid: 'PRJ-99-9999', name: 'X' }),
    }));
    expect(res.status).toBe(404);
  });

  it('rejects invalid status', async () => {
    const { POST } = await import('@/app/api/schedule/phases/route');
    const res = await POST(new Request('http://localhost/api/schedule/phases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engagement_kid: 'PRJ-26-0001', name: 'X', status: 'bogus' }),
    }));
    expect(res.status).toBe(400);
  });

  it('creates a phase under a known engagement', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]); // engagement lookup
    const { POST } = await import('@/app/api/schedule/phases/route');
    const res = await POST(new Request('http://localhost/api/schedule/phases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        name: 'Mobilization',
        sort_order: 2,
        planned_start: '2026-06-01',
        planned_end: '2026-06-15',
      }),
    }));
    expect(res.status).toBe(201);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      'schedule_phases',
      expect.objectContaining({
        tenant_id: TENANT_ID,
        engagement_id: ENG_ID,
        name: 'Mobilization',
        sort_order: 2,
        status: 'planned',
      }),
    );
  });

  it('returns 403 for a role that lacks SCHEDULE_WRITE', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: 'field@kulaglass.com', role: 'field' },
    });
    const { POST } = await import('@/app/api/schedule/phases/route');
    const res = await POST(new Request('http://localhost/api/schedule/phases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engagement_kid: 'PRJ-26-0001', name: 'X' }),
    }));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/schedule/phases/[id]', () => {
  it('returns 400 on invalid id', async () => {
    const { PATCH } = await import('@/app/api/schedule/phases/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/phases/bogus`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      }),
      { params: Promise.resolve({ id: 'bogus' }) },
    );
    expect(res.status).toBe(400);
  });

  it('updates name and status', async () => {
    const { PATCH } = await import('@/app/api/schedule/phases/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/phases/${PHASE_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Construction', status: 'in_progress' }),
      }),
      { params: Promise.resolve({ id: PHASE_ID }) },
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Construction', status: 'in_progress' }),
    );
  });
});

describe('DELETE /api/schedule/phases/[id]', () => {
  it('cascade-deletes a phase', async () => {
    const { DELETE } = await import('@/app/api/schedule/phases/[id]/route');
    const res = await DELETE(
      new Request(`http://localhost/api/schedule/phases/${PHASE_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: PHASE_ID }) },
    );
    expect(res.status).toBe(200);
    expect(deleteWhereSpy).toHaveBeenCalled();
  });
});
