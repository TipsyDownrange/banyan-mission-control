/**
 * BAN-374 Scheduling Spine — Route tests for /api/schedule/milestones.
 *
 *   GET listing per engagement_kid (kIDFound true/false)
 *   POST validation + happy path
 *   PATCH status transition + actual_date stamp
 *   DELETE
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const MS_ID = '00000000-0000-4000-8000-000000000500';

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
        returning: async () => [{ ...vals, id: MS_ID }],
      };
    },
  })),
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(vals);
      return {
        where: () => ({
          returning: async () => [{ id: MS_ID, ...vals }],
        }),
      };
    },
  })),
  delete: jest.fn(() => ({
    where: (...args: unknown[]) => {
      deleteWhereSpy(...args);
      return {
        returning: async () => [{ id: MS_ID }],
      };
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'id', 'tenant_id', 'engagement_id', 'name', 'type',
    'planned_date', 'actual_date', 'status',
    'kid', 'created_at', 'updated_at',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  schedule_milestones: tbl('schedule_milestones'),
  engagements: tbl('engagements'),
  SCHEDULE_MILESTONE_TYPES: ['substantial_completion', 'permit', 'inspection', 'owner_walkthrough', 'retainage_release', 'custom'],
  SCHEDULE_MILESTONE_STATUSES: ['pending', 'met', 'missed', 'waived'],
  SCHEDULE_MILESTONE_KINDS: ['standard', 'permit', 'inspection', 'gc_clearance', 'matson_freight'],
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

describe('GET /api/schedule/milestones', () => {
  it('returns 400 when engagement_kid is missing', async () => {
    const { GET } = await import('@/app/api/schedule/milestones/route');
    const res = await GET(new Request('http://localhost/api/schedule/milestones'));
    expect(res.status).toBe(400);
  });

  it('returns kIDFound:false when engagement does not exist', async () => {
    selectResultQueue.push([]);
    const { GET } = await import('@/app/api/schedule/milestones/route');
    const res = await GET(new Request('http://localhost/api/schedule/milestones?engagement_kid=PRJ-99-9999'));
    const j = await res.json();
    expect(j.kIDFound).toBe(false);
  });

  it('lists milestones for a known engagement', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]);
    selectResultQueue.push([
      { id: MS_ID, name: 'Substantial Completion', type: 'substantial_completion', status: 'pending' },
    ]);
    const { GET } = await import('@/app/api/schedule/milestones/route');
    const res = await GET(new Request('http://localhost/api/schedule/milestones?engagement_kid=PRJ-26-0001'));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.items).toHaveLength(1);
  });
});

describe('POST /api/schedule/milestones', () => {
  it('rejects unknown milestone type', async () => {
    const { POST } = await import('@/app/api/schedule/milestones/route');
    const res = await POST(new Request('http://localhost/api/schedule/milestones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        name: 'X',
        type: 'made_up',
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when engagement_kid is unknown', async () => {
    selectResultQueue.push([]);
    const { POST } = await import('@/app/api/schedule/milestones/route');
    const res = await POST(new Request('http://localhost/api/schedule/milestones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-99-9999',
        name: 'X',
        type: 'permit',
      }),
    }));
    expect(res.status).toBe(404);
  });

  it('creates a milestone with default status pending', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]);
    const { POST } = await import('@/app/api/schedule/milestones/route');
    const res = await POST(new Request('http://localhost/api/schedule/milestones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        name: 'Substantial Completion',
        type: 'substantial_completion',
        planned_date: '2026-09-01',
      }),
    }));
    expect(res.status).toBe(201);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      'schedule_milestones',
      expect.objectContaining({
        tenant_id: TENANT_ID,
        engagement_id: ENG_ID,
        type: 'substantial_completion',
        status: 'pending',
        planned_date: '2026-09-01',
      }),
    );
  });
});

describe('PATCH /api/schedule/milestones/[id]', () => {
  it('rejects invalid status', async () => {
    const { PATCH } = await import('@/app/api/schedule/milestones/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/milestones/${MS_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'bogus' }),
      }),
      { params: Promise.resolve({ id: MS_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('updates status to met and stamps actual_date', async () => {
    const { PATCH } = await import('@/app/api/schedule/milestones/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/milestones/${MS_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'met', actual_date: '2026-09-02' }),
      }),
      { params: Promise.resolve({ id: MS_ID }) },
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'met', actual_date: '2026-09-02' }),
    );
  });
});

describe('DELETE /api/schedule/milestones/[id]', () => {
  it('removes a milestone', async () => {
    const { DELETE } = await import('@/app/api/schedule/milestones/[id]/route');
    const res = await DELETE(
      new Request(`http://localhost/api/schedule/milestones/${MS_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: MS_ID }) },
    );
    expect(res.status).toBe(200);
    expect(deleteWhereSpy).toHaveBeenCalled();
  });
});
