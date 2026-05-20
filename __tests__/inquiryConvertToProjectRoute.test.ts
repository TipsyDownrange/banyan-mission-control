/**
 * BAN-376 Customer Pipeline — /api/inquiries/[id]/convert-to-project tests.
 *
 *   - Link mode: existing engagement_id, FK back-link set, inquiry state →
 *     CONVERTED, audit row written.
 *   - Stub mode: minimal engagement insert with source_inquiry_id + inherited
 *     is_test_project from the inquiry.
 *   - Validation: invalid engagement_id format, missing kid/org/site in stub,
 *     terminal-state guard.
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const INQUIRY_ID = '00000000-0000-4000-8000-000000000111';
const ENG_ID = '00000000-0000-4000-8000-000000000222';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const updateSetSpy = jest.fn();
const updateWhereArgsSpy = jest.fn();
const insertValuesSpy = jest.fn();

const mockDb = {
  select: jest.fn(() => {
    const limit = jest.fn(async () => selectResultQueue.shift() ?? []);
    const orderBy = jest.fn(async () => selectResultQueue.shift() ?? []);
    const where = jest.fn(() => ({ limit, orderBy }));
    const from = jest.fn(() => ({ where }));
    return { from };
  }),
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(vals);
      return {
        where: (...args: unknown[]) => {
          updateWhereArgsSpy(...args);
          return { returning: async () => [{ inquiry_id: INQUIRY_ID, ...vals }] };
        },
      };
    },
  })),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      insertValuesSpy(tableHandle._label ?? 'unknown', vals);
      return {
        returning: async () => [{ engagement_id: ENG_ID, ...vals }],
      };
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'inquiry_id', 'tenant_id', 'state', 'is_test_project',
    'engagement_id', 'kid', 'org_id', 'site_id', 'source_inquiry_id',
    'engagement_type', 'pm_handoff_state',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  inquiries: tbl('inquiries'),
  inquiry_state_transitions: tbl('inquiry_state_transitions'),
  engagements: tbl('engagements'),
  INQUIRY_STATE_TRANSITIONS: {
    NEW:           ['IN_DISCUSSION', 'QUOTED', 'AWARDED', 'LOST', 'DEFERRED', 'CONVERTED'],
    IN_DISCUSSION: ['QUOTED', 'AWARDED', 'LOST', 'DEFERRED', 'CONVERTED'],
    QUOTED:        ['AWARDED', 'LOST', 'DEFERRED', 'CONVERTED'],
    AWARDED:       ['CONVERTED', 'LOST'],
    DEFERRED:      ['IN_DISCUSSION', 'QUOTED', 'AWARDED', 'LOST', 'CONVERTED'],
    LOST:          [],
    CONVERTED:     [],
  },
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

describe('POST /api/inquiries/[id]/convert-to-project', () => {
  it('returns 404 when inquiry not found', async () => {
    selectResultQueue.push([]); // inquiry lookup empty
    const { POST } = await import('@/app/api/inquiries/[id]/convert-to-project/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/convert-to-project`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engagement_id: ENG_ID }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(404);
  });

  it('rejects conversion from terminal state CONVERTED', async () => {
    selectResultQueue.push([{ inquiry_id: INQUIRY_ID, state: 'CONVERTED', is_test_project: false }]);
    const { POST } = await import('@/app/api/inquiries/[id]/convert-to-project/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/convert-to-project`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engagement_id: ENG_ID }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(400);
  });

  it('link mode — sets engagements.source_inquiry_id and transitions to CONVERTED', async () => {
    selectResultQueue.push([{ inquiry_id: INQUIRY_ID, state: 'AWARDED', is_test_project: false }]);
    selectResultQueue.push([{ engagement_id: ENG_ID, tenant_id: TENANT_ID }]);
    const { POST } = await import('@/app/api/inquiries/[id]/convert-to-project/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/convert-to-project`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engagement_id: ENG_ID, reason: 'NTP received' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(200);

    // Two update calls: one on engagements (source_inquiry_id), one on inquiries (state).
    const engagementUpdate = updateSetSpy.mock.calls.find(([vals]) => vals && (vals as Record<string, unknown>).source_inquiry_id === INQUIRY_ID);
    expect(engagementUpdate).toBeDefined();
    const inquiryUpdate = updateSetSpy.mock.calls.find(([vals]) => vals && (vals as Record<string, unknown>).state === 'CONVERTED');
    expect(inquiryUpdate).toBeDefined();
    expect((inquiryUpdate![0] as Record<string, unknown>).converted_to_project_id).toBe(ENG_ID);

    const audit = insertValuesSpy.mock.calls.find(([label]) => label === 'inquiry_state_transitions');
    expect(audit![1]).toEqual(expect.objectContaining({ from_state: 'AWARDED', to_state: 'CONVERTED' }));
  });

  it('stub mode — inserts engagement with source_inquiry_id + inherited is_test_project', async () => {
    selectResultQueue.push([{ inquiry_id: INQUIRY_ID, state: 'NEW', is_test_project: true }]);
    const { POST } = await import('@/app/api/inquiries/[id]/convert-to-project/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/convert-to-project`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-9999',
        org_id: '00000000-0000-4000-8000-000000000333',
        site_id: '00000000-0000-4000-8000-000000000444',
      }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(200);
    const engInsert = insertValuesSpy.mock.calls.find(([label]) => label === 'engagements');
    expect(engInsert).toBeDefined();
    expect(engInsert![1]).toEqual(expect.objectContaining({
      kid: 'PRJ-26-9999',
      engagement_type: 'project',
      source_inquiry_id: INQUIRY_ID,
      is_test_project: true,
    }));
  });

  it('rejects stub mode missing kid', async () => {
    selectResultQueue.push([{ inquiry_id: INQUIRY_ID, state: 'NEW', is_test_project: false }]);
    const { POST } = await import('@/app/api/inquiries/[id]/convert-to-project/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/convert-to-project`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ org_id: 'x', site_id: 'y' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(400);
  });

  it('rejects non-UUID engagement_id in link mode', async () => {
    selectResultQueue.push([{ inquiry_id: INQUIRY_ID, state: 'NEW', is_test_project: false }]);
    const { POST } = await import('@/app/api/inquiries/[id]/convert-to-project/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/convert-to-project`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engagement_id: 'not-uuid' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(400);
  });
});
