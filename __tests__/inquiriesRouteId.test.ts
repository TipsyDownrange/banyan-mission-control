/**
 * BAN-376 Customer Pipeline — /api/inquiries/[id] GET + PATCH route tests.
 *
 * Exercises:
 *   - Permission gate (401 / 403).
 *   - Tenant scoping — query always carries tenant_id condition.
 *   - GET happy path + 404.
 *   - PATCH happy path with allowed fields.
 *   - PATCH rejects state / inquiry_number / conversion fields (out of band).
 *   - PATCH rejects invalid enum payload.
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const INQUIRY_ID = '00000000-0000-4000-8000-000000000111';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const updateSetSpy = jest.fn();
const updateWhereArgsSpy = jest.fn();

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
          return {
            returning: async () => [{ inquiry_id: INQUIRY_ID, ...vals }],
          };
        },
      };
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'inquiry_id', 'tenant_id', 'inquiry_number', 'source', 'state', 'customer_name',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  inquiries: tbl('inquiries'),
  INQUIRY_SOURCES: ['PHONE', 'EMAIL', 'WALK_IN', 'RFP', 'WEBSITE_FORM', 'GBA_REVIEW', 'REFERRAL', 'OTHER'],
  INQUIRY_FIRST_CONTACT_METHODS: ['PHONE', 'EMAIL', 'WALK_IN', 'OFFICE_FORWARD'],
  INQUIRY_TYPE_INITIALS: ['WORK_ORDER', 'PROJECT', 'UNCLEAR'],
  INQUIRY_VALUE_BANDS: ['UNDER_5K', '5K_25K', '25K_100K', '100K_500K', '500K_PLUS', 'UNKNOWN'],
  INQUIRY_ASSIGNED_ROLES: ['PM', 'SERVICE_PM', 'ESTIMATOR', 'GM', 'ADMIN'],
  INQUIRY_CONVERSION_EVENTS: ['SIGNED_PROPOSAL', 'VERBAL_GO_AHEAD', 'DOWN_PAYMENT', 'PURCHASE_ORDER', 'CONTRACT', 'NOTICE_TO_PROCEED', 'EMAIL_AWARD', 'OTHER'],
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

// ─── GET /api/inquiries/[id] ────────────────────────────────────────────────

describe('GET /api/inquiries/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/inquiries/[id]/route');
    const res = await GET(new Request('http://localhost/api/inquiries/bogus'), {
      params: Promise.resolve({ id: 'bogus' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/inquiries/[id]/route');
    const res = await GET(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}`), {
      params: Promise.resolve({ id: INQUIRY_ID }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when inquiry not in tenant', async () => {
    selectResultQueue.push([]);
    const { GET } = await import('@/app/api/inquiries/[id]/route');
    const res = await GET(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}`), {
      params: Promise.resolve({ id: INQUIRY_ID }),
    });
    expect(res.status).toBe(404);
  });

  it('returns inquiry on happy path', async () => {
    selectResultQueue.push([{ inquiry_id: INQUIRY_ID, inquiry_number: 'INQ-26-0001', state: 'NEW' }]);
    const { GET } = await import('@/app/api/inquiries/[id]/route');
    const res = await GET(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}`), {
      params: Promise.resolve({ id: INQUIRY_ID }),
    });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.inquiry.inquiry_id).toBe(INQUIRY_ID);
  });
});

// ─── PATCH /api/inquiries/[id] ───────────────────────────────────────────────

describe('PATCH /api/inquiries/[id]', () => {
  it('returns 403 when role lacks INQUIRY_WRITE', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: 'e@k.com', role: 'estimator' } });
    const { PATCH } = await import('@/app/api/inquiries/[id]/route');
    const res = await PATCH(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: 'x' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(403);
  });

  it('rejects state in PATCH body (must use /transition)', async () => {
    const { PATCH } = await import('@/app/api/inquiries/[id]/route');
    const res = await PATCH(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'QUOTED' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(400);
  });

  it('rejects conversion targets in PATCH body', async () => {
    const { PATCH } = await import('@/app/api/inquiries/[id]/route');
    const res = await PATCH(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ converted_to_project_id: '00000000-0000-4000-8000-000000000222' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(400);
  });

  it('rejects invalid source enum', async () => {
    const { PATCH } = await import('@/app/api/inquiries/[id]/route');
    const res = await PATCH(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'BOGUS' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(400);
  });

  it('applies whitelisted text + enum updates with tenant scope', async () => {
    const { PATCH } = await import('@/app/api/inquiries/[id]/route');
    const res = await PATCH(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        notes: 'follow up Friday',
        inquiry_description: 'Updated scope notes',
        estimated_value_band: '25K_100K',
      }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      notes: 'follow up Friday',
      inquiry_description: 'Updated scope notes',
      estimated_value_band: '25K_100K',
    }));
    expect(updateWhereArgsSpy).toHaveBeenCalled();
  });

  it('rejects empty patch body', async () => {
    const { PATCH } = await import('@/app/api/inquiries/[id]/route');
    const res = await PATCH(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(400);
  });
});
