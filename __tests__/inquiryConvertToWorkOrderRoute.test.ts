/**
 * BAN-376 Customer Pipeline — /api/inquiries/[id]/convert-to-work-order tests.
 *
 *   - SRV-YY-NNNN format validation (ADR-026 service-WO id contract).
 *   - Terminal-state guard.
 *   - Happy path: records converted_to_work_order_id, transitions to
 *     CONVERTED, writes audit row, does NOT insert any postgres WO row.
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const INQUIRY_ID = '00000000-0000-4000-8000-000000000111';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const updateSetSpy = jest.fn();
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
        where: () => ({ returning: async () => [{ inquiry_id: INQUIRY_ID, ...vals }] }),
      };
    },
  })),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      insertValuesSpy(tableHandle._label ?? 'unknown', vals);
      return { returning: async () => [{ ...vals }] };
    },
  })),
};

function tbl(label: string) {
  const cols = ['inquiry_id', 'tenant_id', 'state'];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  inquiries: tbl('inquiries'),
  inquiry_state_transitions: tbl('inquiry_state_transitions'),
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
    user: { email: 'sp@kulaglass.com', role: 'service_pm' },
  });
});

describe('POST /api/inquiries/[id]/convert-to-work-order', () => {
  it('rejects missing work_order_id', async () => {
    const { POST } = await import('@/app/api/inquiries/[id]/convert-to-work-order/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/convert-to-work-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(400);
  });

  it('rejects malformed work_order_id (not SRV-YY-NNNN)', async () => {
    const { POST } = await import('@/app/api/inquiries/[id]/convert-to-work-order/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/convert-to-work-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ work_order_id: 'PRJ-26-0001' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when inquiry not found', async () => {
    selectResultQueue.push([]); // inquiry lookup empty
    const { POST } = await import('@/app/api/inquiries/[id]/convert-to-work-order/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/convert-to-work-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ work_order_id: 'SRV-26-0042' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(404);
  });

  it('rejects conversion from terminal LOST', async () => {
    selectResultQueue.push([{ inquiry_id: INQUIRY_ID, state: 'LOST' }]);
    const { POST } = await import('@/app/api/inquiries/[id]/convert-to-work-order/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/convert-to-work-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ work_order_id: 'SRV-26-0042' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(400);
  });

  it('happy path — sets converted_to_work_order_id, transitions to CONVERTED, writes audit', async () => {
    selectResultQueue.push([{ inquiry_id: INQUIRY_ID, state: 'NEW' }]);
    const { POST } = await import('@/app/api/inquiries/[id]/convert-to-work-order/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/convert-to-work-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ work_order_id: 'SRV-26-0042', reason: 'walk-in service call' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.work_order_id).toBe('SRV-26-0042');
    expect(j.to_state).toBe('CONVERTED');
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      state: 'CONVERTED',
      converted_to_work_order_id: 'SRV-26-0042',
    }));
    const audit = insertValuesSpy.mock.calls.find(([label]) => label === 'inquiry_state_transitions');
    expect(audit![1]).toEqual(expect.objectContaining({
      from_state: 'NEW',
      to_state: 'CONVERTED',
      reason: 'walk-in service call',
    }));
    // ADR-026: no postgres WO insert should have happened.
    const woInsert = insertValuesSpy.mock.calls.find(([label]) => label === 'service_work_orders');
    expect(woInsert).toBeUndefined();
  });
});
