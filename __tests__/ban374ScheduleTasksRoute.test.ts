/**
 * BAN-374 Scheduling Spine — Route tests for /api/schedule/tasks.
 *
 *   GET ?phase_id=... and ?engagement_kid=... listing modes
 *   POST validation + percent_complete range + happy path
 *   PATCH "mark complete" stamps percent_complete=100 + actual_end
 *   DELETE happy path
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const PHASE_ID = '00000000-0000-4000-8000-000000000100';
const TASK_ID = '00000000-0000-4000-8000-000000000200';

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
        returning: async () => [{ ...vals, id: TASK_ID }],
      };
    },
  })),
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(vals);
      return {
        where: () => ({
          returning: async () => [{ id: TASK_ID, ...vals }],
        }),
      };
    },
  })),
  delete: jest.fn(() => ({
    where: (...args: unknown[]) => {
      deleteWhereSpy(...args);
      return {
        returning: async () => [{ id: TASK_ID }],
      };
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'id', 'tenant_id', 'engagement_id', 'phase_id', 'name', 'description',
    'sort_order', 'planned_start', 'planned_end', 'planned_duration_days',
    'actual_start', 'actual_end', 'percent_complete', 'status',
    'assigned_to_user_id', 'kid', 'created_at', 'updated_at',
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
  engagements: tbl('engagements'),
  SCHEDULE_TASK_STATUSES: ['planned', 'in_progress', 'complete', 'blocked', 'on_hold'],
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

describe('GET /api/schedule/tasks', () => {
  it('requires phase_id or engagement_kid', async () => {
    const { GET } = await import('@/app/api/schedule/tasks/route');
    const res = await GET(new Request('http://localhost/api/schedule/tasks'));
    expect(res.status).toBe(400);
  });

  it('rejects malformed phase_id', async () => {
    const { GET } = await import('@/app/api/schedule/tasks/route');
    const res = await GET(new Request('http://localhost/api/schedule/tasks?phase_id=bogus'));
    expect(res.status).toBe(400);
  });

  it('lists tasks under a phase', async () => {
    selectResultQueue.push([{ id: TASK_ID, name: 'Frame walls', status: 'planned' }]);
    const { GET } = await import('@/app/api/schedule/tasks/route');
    const res = await GET(new Request(`http://localhost/api/schedule/tasks?phase_id=${PHASE_ID}`));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.items).toHaveLength(1);
  });

  it('lists tasks across all phases for an engagement', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]); // engagement lookup
    selectResultQueue.push([
      { id: TASK_ID, name: 'A', status: 'planned' },
      { id: '00000000-0000-4000-8000-000000000201', name: 'B', status: 'in_progress' },
    ]); // tasks
    const { GET } = await import('@/app/api/schedule/tasks/route');
    const res = await GET(new Request('http://localhost/api/schedule/tasks?engagement_kid=PRJ-26-0001'));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.kIDFound).toBe(true);
    expect(j.items).toHaveLength(2);
  });
});

describe('POST /api/schedule/tasks', () => {
  it('requires a valid phase_id', async () => {
    const { POST } = await import('@/app/api/schedule/tasks/route');
    const res = await POST(new Request('http://localhost/api/schedule/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phase_id: 'bogus', name: 'X' }),
    }));
    expect(res.status).toBe(400);
  });

  it('requires a name', async () => {
    const { POST } = await import('@/app/api/schedule/tasks/route');
    const res = await POST(new Request('http://localhost/api/schedule/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phase_id: PHASE_ID }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects percent_complete out of range', async () => {
    const { POST } = await import('@/app/api/schedule/tasks/route');
    const res = await POST(new Request('http://localhost/api/schedule/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phase_id: PHASE_ID, name: 'X', percent_complete: 150 }),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when phase_id is unknown', async () => {
    selectResultQueue.push([]); // phase lookup empty
    const { POST } = await import('@/app/api/schedule/tasks/route');
    const res = await POST(new Request('http://localhost/api/schedule/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phase_id: PHASE_ID, name: 'X' }),
    }));
    expect(res.status).toBe(404);
  });

  it('creates a task under a known phase, copying its engagement_id', async () => {
    selectResultQueue.push([{ phase_id: PHASE_ID, engagement_id: ENG_ID }]);
    const { POST } = await import('@/app/api/schedule/tasks/route');
    const res = await POST(new Request('http://localhost/api/schedule/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phase_id: PHASE_ID,
        name: 'Frame walls',
        planned_start: '2026-06-05',
        planned_end: '2026-06-10',
        planned_duration_days: 5,
      }),
    }));
    expect(res.status).toBe(201);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      'schedule_tasks',
      expect.objectContaining({
        tenant_id: TENANT_ID,
        phase_id: PHASE_ID,
        engagement_id: ENG_ID,
        name: 'Frame walls',
        status: 'planned',
        percent_complete: 0,
      }),
    );
  });
});

describe('PATCH /api/schedule/tasks/[id]', () => {
  it('rejects out-of-range percent_complete', async () => {
    const { PATCH } = await import('@/app/api/schedule/tasks/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ percent_complete: -1 }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('marking complete stamps percent_complete=100 and actual_end=today', async () => {
    const { PATCH } = await import('@/app/api/schedule/tasks/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'complete' }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'complete',
        percent_complete: 100,
        actual_end: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it('explicit percent_complete override is preserved', async () => {
    const { PATCH } = await import('@/app/api/schedule/tasks/[id]/route');
    await PATCH(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'complete', percent_complete: 80 }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete', percent_complete: 80 }),
    );
  });
});

describe('DELETE /api/schedule/tasks/[id]', () => {
  it('removes a task', async () => {
    const { DELETE } = await import('@/app/api/schedule/tasks/[id]/route');
    const res = await DELETE(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(res.status).toBe(200);
    expect(deleteWhereSpy).toHaveBeenCalled();
  });
});
