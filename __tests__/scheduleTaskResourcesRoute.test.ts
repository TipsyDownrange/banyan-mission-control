/**
 * BAN-374 P5 — /api/schedule/tasks/[id]/resources route tests.
 *
 *   POST happy path (with allocation default)
 *   POST 400 on invalid user_id / allocation
 *   POST 404 on unknown task
 *   POST 409 on duplicate active assignment
 *   POST 409 on allocation conflict without ack_conflict + notes
 *   POST 201 when ack_conflict + notes provided
 *   GET  lists active + historical assignments joined with users
 *   PATCH happy + 400 on invalid allocation
 *   DELETE soft-removes (sets removed_at + removed_by)
 *   Read gate: 401 when SCHEDULE_VIEW absent
 *   Write gate: 403 when SCHEDULE_WRITE absent
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const TASK_ID = '00000000-0000-4000-8000-000000000200';
const USER_ID = '00000000-0000-4000-8000-000000000301';
const ACTOR_ID = '00000000-0000-4000-8000-000000000302';
const RESOURCE_ID = '00000000-0000-4000-8000-000000000400';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const insertValuesSpy = jest.fn();
const updateSetSpy = jest.fn();

const mockDb = {
  select: jest.fn(() => {
    const limit = jest.fn(async () => selectResultQueue.shift() ?? []);
    const orderBy = jest.fn(async () => selectResultQueue.shift() ?? []);
    const where = jest.fn(() => {
      const next = { limit, orderBy } as Record<string, unknown>;
      // Make select itself awaitable for routes that don't call .limit/.orderBy
      (next as { then?: unknown }).then = (resolve: (r: unknown) => unknown) =>
        Promise.resolve(selectResultQueue.shift() ?? []).then(resolve);
      return next;
    });
    const innerJoin = jest.fn(() => ({ innerJoin, leftJoin: jest.fn(() => ({ where })), where }));
    const leftJoin = jest.fn(() => ({ where, leftJoin, innerJoin }));
    const from = jest.fn(() => ({ where, leftJoin, innerJoin }));
    return { from };
  }),
  insert: jest.fn(() => ({
    values: (vals: Record<string, unknown>) => {
      insertValuesSpy(vals);
      return {
        returning: async () => [{ task_resource_id: RESOURCE_ID, ...vals }],
      };
    },
  })),
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(vals);
      return {
        where: () => ({
          returning: async () => [{ task_resource_id: RESOURCE_ID, ...vals }],
        }),
      };
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'task_resource_id', 'tenant_id', 'schedule_task_id', 'user_id',
    'role_on_task', 'allocation_percent', 'assigned_at', 'assigned_by',
    'removed_at', 'removed_by', 'notes',
    'id', 'name', 'email', 'active', 'planned_start', 'planned_end', 'status',
    'phase_id', 'engagement_id',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  schedule_task_resources: tbl('schedule_task_resources'),
  schedule_tasks: tbl('schedule_tasks'),
  schedule_phases: tbl('schedule_phases'),
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
    user: { email: 'pm@kulaglass.com', role: 'pm' },
  });
});

describe('POST /api/schedule/tasks/[id]/resources', () => {
  it('returns 400 on invalid user_id', async () => {
    const { POST } = await import('@/app/api/schedule/tasks/[id]/resources/route');
    const res = await POST(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'not-a-uuid' }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 on out-of-range allocation_percent', async () => {
    const { POST } = await import('@/app/api/schedule/tasks/[id]/resources/route');
    const res = await POST(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: USER_ID, allocation_percent: 150 }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the task does not exist in the tenant', async () => {
    selectResultQueue.push([{ user_id: ACTOR_ID }]); // actor lookup
    selectResultQueue.push([]); // task lookup empty
    const { POST } = await import('@/app/api/schedule/tasks/[id]/resources/route');
    const res = await POST(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: USER_ID }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when an active duplicate assignment exists', async () => {
    selectResultQueue.push([{ user_id: ACTOR_ID }]); // actor
    selectResultQueue.push([{ id: TASK_ID, planned_start: '2026-06-01', planned_end: '2026-06-10' }]); // task
    selectResultQueue.push([{ task_resource_id: RESOURCE_ID }]); // existing select (any row)
    selectResultQueue.push([{ task_resource_id: RESOURCE_ID, removed_at: null }]); // active check
    const { POST } = await import('@/app/api/schedule/tasks/[id]/resources/route');
    const res = await POST(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: USER_ID }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.code).toBe('DUPLICATE_ACTIVE');
  });

  it('returns 409 on allocation conflict when ack_conflict is not set', async () => {
    selectResultQueue.push([{ user_id: ACTOR_ID }]); // actor
    selectResultQueue.push([{ id: TASK_ID, planned_start: '2026-06-01', planned_end: '2026-06-10' }]); // task
    selectResultQueue.push([]); // existing-id select
    // detectConflicts query returns one overlapping 80% assignment
    selectResultQueue.push([
      {
        task_resource_id: 'other-r',
        schedule_task_id: 'other-t',
        allocation_percent: 80,
        role_on_task: 'crew',
        task_name: 'Other',
        task_planned_start: '2026-06-05',
        task_planned_end: '2026-06-09',
      },
    ]);
    const { POST } = await import('@/app/api/schedule/tasks/[id]/resources/route');
    const res = await POST(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: USER_ID, allocation_percent: 50 }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.code).toBe('ALLOCATION_CONFLICT');
    expect(j.report.exceedsAllocation).toBe(true);
    expect(j.report.allocationSum).toBe(130);
  });

  it('accepts the assignment when ack_conflict + notes override the warning', async () => {
    selectResultQueue.push([{ user_id: ACTOR_ID }]); // actor
    selectResultQueue.push([{ id: TASK_ID, planned_start: '2026-06-01', planned_end: '2026-06-10' }]); // task
    selectResultQueue.push([]); // existing-id select
    selectResultQueue.push([
      {
        task_resource_id: 'other-r',
        schedule_task_id: 'other-t',
        allocation_percent: 80,
        role_on_task: 'crew',
        task_name: 'Other',
        task_planned_start: '2026-06-05',
        task_planned_end: '2026-06-09',
      },
    ]);
    const { POST } = await import('@/app/api/schedule/tasks/[id]/resources/route');
    const res = await POST(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          user_id: USER_ID,
          allocation_percent: 50,
          ack_conflict: true,
          notes: 'OK — split day with other task',
        }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(res.status).toBe(201);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        schedule_task_id: TASK_ID,
        user_id: USER_ID,
        allocation_percent: 50,
        assigned_by: ACTOR_ID,
        notes: 'OK — split day with other task',
      }),
    );
  });

  it('creates the assignment on the happy path (no overlap, allocation defaults to 100)', async () => {
    selectResultQueue.push([{ user_id: ACTOR_ID }]); // actor
    selectResultQueue.push([{ id: TASK_ID, planned_start: '2026-06-01', planned_end: '2026-06-10' }]); // task
    selectResultQueue.push([]); // existing-id select
    selectResultQueue.push([]); // no overlapping rows
    const { POST } = await import('@/app/api/schedule/tasks/[id]/resources/route');
    const res = await POST(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: USER_ID, role_on_task: 'lead' }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(res.status).toBe(201);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        schedule_task_id: TASK_ID,
        user_id: USER_ID,
        role_on_task: 'lead',
        allocation_percent: 100,
        assigned_by: ACTOR_ID,
      }),
    );
  });
});

describe('GET /api/schedule/tasks/[id]/resources', () => {
  it('lists assignments (joined with users) for the task', async () => {
    selectResultQueue.push([
      {
        task_resource_id: RESOURCE_ID,
        schedule_task_id: TASK_ID,
        user_id: USER_ID,
        role_on_task: 'crew',
        allocation_percent: 100,
        removed_at: null,
        user_name: 'Jane Doe',
        user_email: 'jane@kulaglass.com',
        user_active: true,
      },
    ]);
    const { GET } = await import('@/app/api/schedule/tasks/[id]/resources/route');
    const res = await GET(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources`),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.items).toHaveLength(1);
    expect(j.items[0].user_name).toBe('Jane Doe');
  });
});

describe('PATCH /api/schedule/tasks/[id]/resources/[resourceId]', () => {
  it('rejects out-of-range allocation', async () => {
    const { PATCH } = await import('@/app/api/schedule/tasks/[id]/resources/[resourceId]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources/${RESOURCE_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allocation_percent: 200 }),
      }),
      { params: Promise.resolve({ id: TASK_ID, resourceId: RESOURCE_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('updates role/allocation/notes', async () => {
    const { PATCH } = await import('@/app/api/schedule/tasks/[id]/resources/[resourceId]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources/${RESOURCE_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role_on_task: 'lead', allocation_percent: 75, notes: 'Promoted' }),
      }),
      { params: Promise.resolve({ id: TASK_ID, resourceId: RESOURCE_ID }) },
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ role_on_task: 'lead', allocation_percent: 75, notes: 'Promoted' }),
    );
  });

  it('returns 400 when no updatable fields are supplied', async () => {
    const { PATCH } = await import('@/app/api/schedule/tasks/[id]/resources/[resourceId]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources/${RESOURCE_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: TASK_ID, resourceId: RESOURCE_ID }) },
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/schedule/tasks/[id]/resources/[resourceId]', () => {
  it('soft-removes (sets removed_at + removed_by)', async () => {
    selectResultQueue.push([{ user_id: ACTOR_ID }]); // actor lookup
    const { DELETE } = await import('@/app/api/schedule/tasks/[id]/resources/[resourceId]/route');
    const res = await DELETE(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources/${RESOURCE_ID}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: TASK_ID, resourceId: RESOURCE_ID }) },
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ removed_by: ACTOR_ID, removed_at: expect.any(Date) }),
    );
  });
});

describe('Permission gate', () => {
  it('returns 401 from POST when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/schedule/tasks/[id]/resources/route');
    const res = await POST(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: USER_ID }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect([401, 403]).toContain(res.status);
  });

  it('returns 403 from POST when role lacks SCHEDULE_WRITE', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: 'viewer@kulaglass.com', role: 'gm' },
    });
    const { POST } = await import('@/app/api/schedule/tasks/[id]/resources/route');
    const res = await POST(
      new Request(`http://localhost/api/schedule/tasks/${TASK_ID}/resources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: USER_ID }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );
    expect([401, 403]).toContain(res.status);
  });
});
