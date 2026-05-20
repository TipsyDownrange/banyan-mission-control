/**
 * BAN-374 Scheduling Spine — Route tests for /api/schedule/dependencies.
 *
 *   GET listing for an engagement
 *   POST happy path + 400 self-loop + 400 cycle + 400 cross-project + 404
 *   DELETE happy path
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const TASK_A = '00000000-0000-4000-8000-000000000001';
const TASK_B = '00000000-0000-4000-8000-000000000002';
const TASK_C = '00000000-0000-4000-8000-000000000003';
const DEP_ID = '00000000-0000-4000-8000-000000000900';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const insertValuesSpy = jest.fn();
const deleteWhereSpy = jest.fn();

const mockDb = {
  select: jest.fn(() => {
    const limit = jest.fn(async () => selectResultQueue.shift() ?? []);
    const orderBy = jest.fn(async () => selectResultQueue.shift() ?? []);
    // The .where() result is itself thenable so plain `await db.select()...where(...)`
    // works for routes that don't call limit/orderBy explicitly.
    const where = jest.fn(() => {
      const chain = { limit, orderBy } as Record<string, unknown>;
      (chain as { then?: (resolve: (rows: unknown[]) => void) => void }).then = (resolve) => {
        resolve(selectResultQueue.shift() ?? []);
      };
      return chain;
    });
    const from = jest.fn(() => ({ where }));
    return { from };
  }),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      insertValuesSpy(tableHandle._label ?? 'unknown', vals);
      return {
        returning: async () => [{ ...vals, id: DEP_ID }],
      };
    },
  })),
  delete: jest.fn(() => ({
    where: (...args: unknown[]) => {
      deleteWhereSpy(...args);
      return {
        returning: async () => [{ id: DEP_ID }],
      };
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'id', 'tenant_id', 'engagement_id', 'phase_id', 'name',
    'predecessor_task_id', 'successor_task_id', 'type', 'lag_days',
    'kid', 'created_at',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  schedule_tasks: tbl('schedule_tasks'),
  schedule_dependencies: tbl('schedule_dependencies'),
  engagements: tbl('engagements'),
  SCHEDULE_DEPENDENCY_TYPES: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'],
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

describe('POST /api/schedule/dependencies', () => {
  it('rejects self-loops at the route layer', async () => {
    const { POST } = await import('@/app/api/schedule/dependencies/route');
    const res = await POST(new Request('http://localhost/api/schedule/dependencies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        predecessor_task_id: TASK_A,
        successor_task_id: TASK_A,
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects malformed UUIDs', async () => {
    const { POST } = await import('@/app/api/schedule/dependencies/route');
    const res = await POST(new Request('http://localhost/api/schedule/dependencies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        predecessor_task_id: 'bad',
        successor_task_id: TASK_B,
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects when tasks are in different engagements', async () => {
    selectResultQueue.push([
      { id: TASK_A, engagement_id: ENG_ID },
      { id: TASK_B, engagement_id: '00000000-0000-4000-8000-000000000fff' },
    ]);
    const { POST } = await import('@/app/api/schedule/dependencies/route');
    const res = await POST(new Request('http://localhost/api/schedule/dependencies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        predecessor_task_id: TASK_A,
        successor_task_id: TASK_B,
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects when adding the edge would create a cycle', async () => {
    // task lookup for both endpoints
    selectResultQueue.push([
      { id: TASK_A, engagement_id: ENG_ID },
      { id: TASK_B, engagement_id: ENG_ID },
    ]);
    // all tasks under the engagement
    selectResultQueue.push([
      { id: TASK_A }, { id: TASK_B }, { id: TASK_C },
    ]);
    // existing edges: A→B, B→C (route then tries to add C→A → cycle)
    selectResultQueue.push([
      { predecessor_task_id: TASK_A, successor_task_id: TASK_B },
      { predecessor_task_id: TASK_B, successor_task_id: TASK_C },
    ]);
    const { POST } = await import('@/app/api/schedule/dependencies/route');
    const res = await POST(new Request('http://localhost/api/schedule/dependencies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        predecessor_task_id: TASK_C,
        successor_task_id: TASK_A,
      }),
    }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.code).toBe('DEPENDENCY_CYCLE');
  });

  it('creates the dependency when no cycle is formed', async () => {
    selectResultQueue.push([
      { id: TASK_A, engagement_id: ENG_ID },
      { id: TASK_B, engagement_id: ENG_ID },
    ]);
    selectResultQueue.push([{ id: TASK_A }, { id: TASK_B }]);
    selectResultQueue.push([]); // no existing edges
    const { POST } = await import('@/app/api/schedule/dependencies/route');
    const res = await POST(new Request('http://localhost/api/schedule/dependencies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        predecessor_task_id: TASK_A,
        successor_task_id: TASK_B,
        type: 'finish_to_start',
        lag_days: 2,
      }),
    }));
    expect(res.status).toBe(201);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      'schedule_dependencies',
      expect.objectContaining({
        predecessor_task_id: TASK_A,
        successor_task_id: TASK_B,
        type: 'finish_to_start',
        lag_days: 2,
        tenant_id: TENANT_ID,
      }),
    );
  });
});

describe('GET /api/schedule/dependencies', () => {
  it('returns 400 when engagement_kid is missing', async () => {
    const { GET } = await import('@/app/api/schedule/dependencies/route');
    const res = await GET(new Request('http://localhost/api/schedule/dependencies'));
    expect(res.status).toBe(400);
  });

  it('returns empty list when no tasks exist', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]); // engagement
    selectResultQueue.push([]); // no tasks
    const { GET } = await import('@/app/api/schedule/dependencies/route');
    const res = await GET(new Request('http://localhost/api/schedule/dependencies?engagement_kid=PRJ-26-0001'));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.kIDFound).toBe(true);
    expect(j.items).toEqual([]);
  });
});

describe('DELETE /api/schedule/dependencies/[id]', () => {
  it('removes a dep', async () => {
    const { DELETE } = await import('@/app/api/schedule/dependencies/[id]/route');
    const res = await DELETE(
      new Request(`http://localhost/api/schedule/dependencies/${DEP_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: DEP_ID }) },
    );
    expect(res.status).toBe(200);
    expect(deleteWhereSpy).toHaveBeenCalled();
  });
});
