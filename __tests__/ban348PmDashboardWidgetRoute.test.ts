/**
 * BAN-348 PM-V1.0-I — /api/pm-dashboard/widgets/[widget_kind]/data tests.
 *
 * Focused on the role/widget gating + 400 invalid-widget paths.  The
 * per-widget query bodies are exercised end-to-end through the build;
 * here we mock @/db to return empty results so we can assert the route
 * dispatches correctly.
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const PM_USER_ID = '00000000-0000-4000-8000-000000000010';
const PM_EMAIL = 'pm@kulaglass.com';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];

function makeSelectChain() {
  const limit = jest.fn(async () => selectResultQueue.shift() ?? []);
  const orderBy = jest.fn(() => {
    const chain = { limit } as Record<string, unknown>;
    (chain as { then?: (resolve: (rows: unknown[]) => void) => void }).then = (resolve) => {
      resolve(selectResultQueue.shift() ?? []);
    };
    return chain;
  });
  const groupBy = jest.fn(() => {
    const chain = {} as Record<string, unknown>;
    (chain as { then?: (resolve: (rows: unknown[]) => void) => void }).then = (resolve) => {
      resolve(selectResultQueue.shift() ?? []);
    };
    return chain;
  });
  const where = jest.fn(() => {
    const chain = { limit, orderBy, groupBy } as Record<string, unknown>;
    (chain as { then?: (resolve: (rows: unknown[]) => void) => void }).then = (resolve) => {
      resolve(selectResultQueue.shift() ?? []);
    };
    return chain;
  });
  const leftJoin = jest.fn(() => ({ where }));
  const from = jest.fn(() => ({ where, leftJoin }));
  return { from };
}

const mockDb = {
  select: jest.fn(() => makeSelectChain()),
};

function tbl(label: string) {
  const cols = [
    'engagement_id', 'kid', 'status', 'pm_assigned_user_id', 'pm_handoff_state',
    'target_completion_date',
    'submittal_id', 'submittal_number', 'display_label', 'ball_in_court',
    'required_by_date', 'submitted_date',
    'rfi_id', 'rfi_number', 'subject', 'required_response_by_date',
    'pay_app_id', 'pay_app_number', 'period_start', 'period_end', 'state',
    'current_amount_due', 'submitted_at', 'gc_approved_at',
    'event_id', 'event_type', 'description', 'entity_id', 'created_at', 'test_data',
    'action_item_id', 'source_event_type', 'source_entity_type', 'title',
    'assigned_to', 'due_date', 'priority',
    'user_id', 'email', 'name', 'tenant_id', 'role',
  ];
  const out: Record<string, { name: string; enumValues?: string[] }> = {};
  for (const c of cols) out[c] = { name: c };
  // Drizzle enum columns expose enumValues — stub for our typed casts.
  if (label === 'submittals') out.status = { name: 'status', enumValues: ['REQUIRED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'CLOSED'] };
  if (label === 'rfis') out.status = { name: 'status', enumValues: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ANSWERED', 'CLOSED'] };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  action_items: tbl('action_items'),
  engagements: tbl('engagements'),
  field_events: tbl('field_events'),
  pay_applications: tbl('pay_applications'),
  rfis: tbl('rfis'),
  submittals: tbl('submittals'),
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

function req(): Request {
  return new Request('http://localhost/api/pm-dashboard/widgets/x/data');
}

async function callRoute(widgetKind: string) {
  const { GET } = await import('@/app/api/pm-dashboard/widgets/[widget_kind]/data/route');
  return GET(req(), { params: Promise.resolve({ widget_kind: widgetKind }) });
}

describe('widget-kind validation', () => {
  it('returns 400 for an unknown widget_kind', async () => {
    selectResultQueue.push([{ user_id: PM_USER_ID }]);
    const res = await callRoute('NOT_REAL');
    expect(res.status).toBe(400);
  });

  it('returns 401 with no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await callRoute('MY_OPEN_ACTIONS');
    expect(res.status).toBe(401);
  });

  it('returns 403 when glazier asks for any widget', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: 'glz@kulaglass.com', role: 'glazier' },
    });
    const res = await callRoute('MY_OPEN_ACTIONS');
    expect(res.status).toBe(403);
  });
});

describe('senior-widget gating', () => {
  beforeEach(() => {
    selectResultQueue.push([{ user_id: PM_USER_ID }]); // resolveCallerUserId
  });

  it('pm cannot fetch ALL_PM_WORKLOAD', async () => {
    const res = await callRoute('ALL_PM_WORKLOAD');
    expect(res.status).toBe(403);
  });

  it('pm cannot fetch CROSS_PM_SUBMITTALS_RFIS', async () => {
    const res = await callRoute('CROSS_PM_SUBMITTALS_RFIS');
    expect(res.status).toBe(403);
  });

  it('pm cannot fetch PROJECT_HEALTH_HEAT_MAP', async () => {
    const res = await callRoute('PROJECT_HEALTH_HEAT_MAP');
    expect(res.status).toBe(403);
  });

  it('super_admin can fetch ALL_PM_WORKLOAD', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: 'sa@kulaglass.com', role: 'super_admin' },
    });
    selectResultQueue.length = 0;
    selectResultQueue.push([{ user_id: 'sa-user' }]);
    selectResultQueue.push([]);
    const res = await callRoute('ALL_PM_WORKLOAD');
    expect(res.status).toBe(200);
  });
});

describe('base-widget happy paths (pm role)', () => {
  beforeEach(() => {
    selectResultQueue.push([{ user_id: PM_USER_ID }]); // resolveCallerUserId
  });

  it('MY_OPEN_ACTIONS returns 200 with the items envelope', async () => {
    selectResultQueue.push([]); // action_items query
    const res = await callRoute('MY_OPEN_ACTIONS');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('project_count');
  });

  it('MY_PROJECTS short-circuits when the PM has no projects', async () => {
    selectResultQueue.push([]); // projectsAssignedToUser → no engagements
    const res = await callRoute('MY_PROJECTS');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ items: [], total: 0 });
  });

  it('CROSS_PROJECT_SUBMITTALS short-circuits with no projects', async () => {
    selectResultQueue.push([]);
    const res = await callRoute('CROSS_PROJECT_SUBMITTALS');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ items: [], total: 0 });
  });

  it('RECENT_ACTIVITY short-circuits with no projects', async () => {
    selectResultQueue.push([]);
    const res = await callRoute('RECENT_ACTIVITY');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ items: [], total: 0 });
  });
});
