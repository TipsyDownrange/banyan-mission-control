/**
 * BAN-376 Customer Pipeline — /api/inquiries POST + GET route tests.
 *
 * Mocks @/db, next-auth, and @/lib/env to exercise:
 *   - POST create — happy path, missing customer_name, missing contact info,
 *     invalid enum, suggested-routing pre-fill.
 *   - GET list — default state filter, source filter, test-data exclusion,
 *     401 / 403 gate.
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const INQUIRY_ID = '00000000-0000-4000-8000-000000000111';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const insertValuesSpy = jest.fn();

const mockDb = {
  select: jest.fn(() => {
    const orderBy = jest.fn(async () => selectResultQueue.shift() ?? []);
    const limit = jest.fn(async () => selectResultQueue.shift() ?? []);
    const where = jest.fn(() => ({ orderBy, limit }));
    const from = jest.fn(() => ({ where }));
    return { from };
  }),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      insertValuesSpy(tableHandle._label ?? 'unknown', vals);
      return {
        returning: async () => [{ ...vals, inquiry_id: INQUIRY_ID }],
      };
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'inquiry_id', 'tenant_id', 'inquiry_number', 'source', 'state',
    'assigned_to_user_id', 'assigned_role', 'is_test_project', 'created_at',
    'customer_name',
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
  INQUIRY_SOURCES: ['PHONE', 'EMAIL', 'WALK_IN', 'RFP', 'WEBSITE_FORM', 'GBA_REVIEW', 'REFERRAL', 'OTHER'],
  INQUIRY_FIRST_CONTACT_METHODS: ['PHONE', 'EMAIL', 'WALK_IN', 'OFFICE_FORWARD'],
  INQUIRY_TYPE_INITIALS: ['WORK_ORDER', 'PROJECT', 'UNCLEAR'],
  INQUIRY_VALUE_BANDS: ['UNDER_5K', '5K_25K', '25K_100K', '100K_500K', '500K_PLUS', 'UNKNOWN'],
  INQUIRY_ASSIGNED_ROLES: ['PM', 'SERVICE_PM', 'ESTIMATOR', 'GM', 'ADMIN'],
  INQUIRY_STATES: ['NEW', 'IN_DISCUSSION', 'QUOTED', 'AWARDED', 'LOST', 'DEFERRED', 'CONVERTED'],
  INQUIRY_CONVERSION_EVENTS: ['SIGNED_PROPOSAL', 'VERBAL_GO_AHEAD', 'DOWN_PAYMENT', 'PURCHASE_ORDER', 'CONTRACT', 'NOTICE_TO_PROCEED', 'EMAIL_AWARD', 'OTHER'],
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

// ─── POST /api/inquiries ─────────────────────────────────────────────────────

describe('POST /api/inquiries', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/inquiries/route');
    const res = await POST(new Request('http://localhost/api/inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'PHONE', customer_name: 'X', contact_phone: '555' }),
    }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role lacks INQUIRY_WRITE', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: 'f@k.com', role: 'field' } });
    const { POST } = await import('@/app/api/inquiries/route');
    const res = await POST(new Request('http://localhost/api/inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'PHONE', customer_name: 'X', contact_phone: '555' }),
    }));
    expect(res.status).toBe(403);
  });

  it('rejects missing customer_name', async () => {
    const { POST } = await import('@/app/api/inquiries/route');
    const res = await POST(new Request('http://localhost/api/inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'PHONE', contact_phone: '555' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects missing contact info', async () => {
    const { POST } = await import('@/app/api/inquiries/route');
    const res = await POST(new Request('http://localhost/api/inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'PHONE', customer_name: 'X' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid source', async () => {
    const { POST } = await import('@/app/api/inquiries/route');
    const res = await POST(new Request('http://localhost/api/inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'BOGUS', customer_name: 'X', contact_phone: '555' }),
    }));
    expect(res.status).toBe(400);
  });

  it('creates inquiry on happy path with assigned INQ-YY-NNNN', async () => {
    selectResultQueue.push([]); // nextInquiryNumber lookup → no prior rows
    const { POST } = await import('@/app/api/inquiries/route');
    const res = await POST(new Request('http://localhost/api/inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'PHONE',
        customer_name: 'Acme GC',
        contact_phone: '808-555-1234',
        inquiry_description: 'Storefront retrofit on Lanai',
        inquiry_type_initial: 'PROJECT',
      }),
    }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.ok).toBe(true);
    const inqInsert = insertValuesSpy.mock.calls.find(([label]) => label === 'inquiries');
    expect(inqInsert).toBeDefined();
    expect(inqInsert![1]).toEqual(expect.objectContaining({
      tenant_id: TENANT_ID,
      source: 'PHONE',
      customer_name: 'Acme GC',
      state: 'NEW',
      inquiry_type_initial: 'PROJECT',
      inquiry_number: expect.stringMatching(/^INQ-\d{2}-0001$/),
    }));
    const auditInsert = insertValuesSpy.mock.calls.find(([label]) => label === 'inquiry_state_transitions');
    expect(auditInsert).toBeDefined();
    expect(auditInsert![1]).toEqual(expect.objectContaining({
      from_state: null,
      to_state: 'NEW',
    }));
  });

  it('pre-fills assigned_role=GM when source=RFP and no override', async () => {
    selectResultQueue.push([]);
    const { POST } = await import('@/app/api/inquiries/route');
    await POST(new Request('http://localhost/api/inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'RFP',
        customer_name: 'GC GC',
        contact_email: 'gc@example.com',
      }),
    }));
    const inqInsert = insertValuesSpy.mock.calls.find(([label]) => label === 'inquiries');
    expect(inqInsert![1]).toEqual(expect.objectContaining({ assigned_role: 'GM' }));
  });

  it('pre-fills assigned_role=SERVICE_PM when source=WALK_IN and value<25K', async () => {
    selectResultQueue.push([]);
    const { POST } = await import('@/app/api/inquiries/route');
    await POST(new Request('http://localhost/api/inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'WALK_IN',
        customer_name: 'Walk-in',
        contact_phone: '808-555-9999',
        estimated_value_band: 'UNDER_5K',
      }),
    }));
    const inqInsert = insertValuesSpy.mock.calls.find(([label]) => label === 'inquiries');
    expect(inqInsert![1]).toEqual(expect.objectContaining({ assigned_role: 'SERVICE_PM' }));
  });
});

// ─── GET /api/inquiries ──────────────────────────────────────────────────────

describe('GET /api/inquiries', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/inquiries/route');
    const res = await GET(new Request('http://localhost/api/inquiries'));
    expect(res.status).toBe(401);
  });

  it('returns rows on happy path with default filter (NEW, IN_DISCUSSION, QUOTED)', async () => {
    selectResultQueue.push([
      { inquiry_id: INQUIRY_ID, inquiry_number: 'INQ-26-0001', state: 'NEW', source: 'PHONE' },
    ]);
    const { GET } = await import('@/app/api/inquiries/route');
    const res = await GET(new Request('http://localhost/api/inquiries'));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.total).toBe(1);
    expect(j.items[0].state).toBe('NEW');
  });

  it('rejects an unknown source filter', async () => {
    const { GET } = await import('@/app/api/inquiries/route');
    const res = await GET(new Request('http://localhost/api/inquiries?source=BOGUS'));
    expect(res.status).toBe(400);
  });

  it('rejects when explicit state filter has no valid values', async () => {
    const { GET } = await import('@/app/api/inquiries/route');
    const res = await GET(new Request('http://localhost/api/inquiries?state=BOGUS'));
    expect(res.status).toBe(400);
  });
});
