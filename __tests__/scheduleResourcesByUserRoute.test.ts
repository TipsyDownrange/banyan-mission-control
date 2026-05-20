/**
 * BAN-374 P5 — /api/schedule/resources/by-user/[userId] route tests.
 *
 *   400 on malformed user_id / from / to
 *   200 lists active joined-task rows for the user
 *   from/to date window filtering uses planned date overlap
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000301';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];

const mockDb = {
  select: jest.fn(() => {
    const orderBy = jest.fn(async () => selectResultQueue.shift() ?? []);
    const where = jest.fn(() => ({ orderBy }));
    const innerJoinFinal = jest.fn(() => ({ where }));
    const innerJoinFirst = jest.fn(() => ({ innerJoin: innerJoinFinal }));
    const from = jest.fn(() => ({ innerJoin: innerJoinFirst }));
    return { from };
  }),
};

function tbl(label: string) {
  const cols = [
    'task_resource_id', 'tenant_id', 'schedule_task_id', 'user_id',
    'role_on_task', 'allocation_percent', 'assigned_at', 'notes',
    'removed_at', 'id', 'name', 'planned_start', 'planned_end', 'status',
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

describe('GET /api/schedule/resources/by-user/[userId]', () => {
  it('rejects malformed user_id', async () => {
    const { GET } = await import('@/app/api/schedule/resources/by-user/[userId]/route');
    const res = await GET(
      new Request('http://localhost/api/schedule/resources/by-user/bogus'),
      { params: Promise.resolve({ userId: 'bogus' }) },
    );
    expect(res.status).toBe(400);
  });

  it('rejects malformed from/to date strings', async () => {
    const { GET } = await import('@/app/api/schedule/resources/by-user/[userId]/route');
    const res = await GET(
      new Request(`http://localhost/api/schedule/resources/by-user/${USER_ID}?from=garbage`),
      { params: Promise.resolve({ userId: USER_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns joined task fields for the user', async () => {
    selectResultQueue.push([
      {
        task_resource_id: 'r-1',
        schedule_task_id: 't-1',
        user_id: USER_ID,
        role_on_task: 'lead',
        allocation_percent: 100,
        task_name: 'Glaze unit A',
        task_planned_start: '2026-06-05',
        task_planned_end: '2026-06-10',
        task_status: 'planned',
        phase_id: 'p-1',
        engagement_id: 'e-1',
        phase_name: 'Construction',
      },
    ]);
    const { GET } = await import('@/app/api/schedule/resources/by-user/[userId]/route');
    const res = await GET(
      new Request(`http://localhost/api/schedule/resources/by-user/${USER_ID}`),
      { params: Promise.resolve({ userId: USER_ID }) },
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.items).toHaveLength(1);
    expect(j.items[0].task_name).toBe('Glaze unit A');
    expect(j.items[0].phase_name).toBe('Construction');
  });

  it('filters by from/to window', async () => {
    selectResultQueue.push([
      {
        task_resource_id: 'r-in',
        schedule_task_id: 't-in',
        user_id: USER_ID,
        role_on_task: 'crew',
        allocation_percent: 100,
        task_name: 'In window',
        task_planned_start: '2026-06-05',
        task_planned_end: '2026-06-10',
        task_status: 'planned',
        phase_id: 'p-1',
        engagement_id: 'e-1',
        phase_name: 'Construction',
      },
      {
        task_resource_id: 'r-out',
        schedule_task_id: 't-out',
        user_id: USER_ID,
        role_on_task: 'crew',
        allocation_percent: 100,
        task_name: 'Out window',
        task_planned_start: '2026-08-05',
        task_planned_end: '2026-08-10',
        task_status: 'planned',
        phase_id: 'p-1',
        engagement_id: 'e-1',
        phase_name: 'Construction',
      },
    ]);
    const { GET } = await import('@/app/api/schedule/resources/by-user/[userId]/route');
    const res = await GET(
      new Request(`http://localhost/api/schedule/resources/by-user/${USER_ID}?from=2026-06-01&to=2026-06-30`),
      { params: Promise.resolve({ userId: USER_ID }) },
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.items.map((r: { task_name: string }) => r.task_name)).toEqual(['In window']);
  });
});
