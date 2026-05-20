/**
 * BAN-376 Customer Pipeline — /api/inquiries/[id]/transition route tests.
 *
 * Verifies the spec §9 state machine:
 *   - Valid forward transitions for each non-terminal state (NEW, IN_DISCUSSION,
 *     QUOTED, AWARDED, DEFERRED) succeed and write an audit row.
 *   - Terminal states (LOST, CONVERTED) have no allowed exit and return 400.
 *   - Invalid backward / sideways transitions return 400.
 *   - AWARDED requires a conversion_event.
 *   - Audit row captures from/to/reason.
 */

// NOTE: do not `import` from '@/db' at the top of this file — jest.mock is
// hoisted, and a real import here would trigger @/db (and the pg driver) to
// load before the mock-factory closures are initialized.  The state-machine
// constant is hardcoded inline below.
const EXPECTED_STATES = ['AWARDED', 'CONVERTED', 'DEFERRED', 'IN_DISCUSSION', 'LOST', 'NEW', 'QUOTED'] as const;

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
  const cols = ['inquiry_id', 'tenant_id', 'state', 'state_changed_at', 'updated_at'];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  inquiries: tbl('inquiries'),
  inquiry_state_transitions: tbl('inquiry_state_transitions'),
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

async function postTransition(currentState: string, body: Record<string, unknown>) {
  selectResultQueue.push([{ inquiry_id: INQUIRY_ID, state: currentState, tenant_id: TENANT_ID }]);
  const { POST } = await import('@/app/api/inquiries/[id]/transition/route');
  return POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/transition`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: INQUIRY_ID }) });
}

describe('POST /api/inquiries/[id]/transition — state machine', () => {
  it('rejects invalid to_state', async () => {
    const res = await postTransition('NEW', { to_state: 'BOGUS' });
    expect(res.status).toBe(400);
  });

  it('rejects same-state transition', async () => {
    const res = await postTransition('NEW', { to_state: 'NEW' });
    expect(res.status).toBe(400);
  });

  it('all 7 states are covered by the mocked INQUIRY_STATE_TRANSITIONS map', async () => {
    // Lazy require so the jest.mock factory has already been resolved.
    const { INQUIRY_STATE_TRANSITIONS } = await import('@/db');
    const keys = Object.keys(INQUIRY_STATE_TRANSITIONS).sort();
    expect(keys).toEqual([...EXPECTED_STATES].sort());
  });

  it('LOST is terminal (no exits allowed)', async () => {
    const res = await postTransition('LOST', { to_state: 'IN_DISCUSSION' });
    expect(res.status).toBe(400);
  });

  it('CONVERTED is terminal (no exits allowed)', async () => {
    const res = await postTransition('CONVERTED', { to_state: 'NEW' });
    expect(res.status).toBe(400);
  });

  // 5 happy paths — one per non-terminal state.
  it('NEW → IN_DISCUSSION succeeds and writes audit row', async () => {
    const res = await postTransition('NEW', { to_state: 'IN_DISCUSSION', reason: 'first call' });
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({ state: 'IN_DISCUSSION' }));
    const audit = insertValuesSpy.mock.calls.find(([label]) => label === 'inquiry_state_transitions');
    expect(audit![1]).toEqual(expect.objectContaining({
      from_state: 'NEW',
      to_state: 'IN_DISCUSSION',
      reason: 'first call',
    }));
  });

  it('IN_DISCUSSION → QUOTED succeeds', async () => {
    const res = await postTransition('IN_DISCUSSION', { to_state: 'QUOTED' });
    expect(res.status).toBe(200);
  });

  it('QUOTED → AWARDED requires conversion_event', async () => {
    const res = await postTransition('QUOTED', { to_state: 'AWARDED' });
    expect(res.status).toBe(400);
  });

  it('QUOTED → AWARDED with conversion_event stamps conversion_at', async () => {
    const res = await postTransition('QUOTED', {
      to_state: 'AWARDED',
      conversion_event: 'PURCHASE_ORDER',
    });
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      state: 'AWARDED',
      conversion_event: 'PURCHASE_ORDER',
      conversion_at: expect.any(Date),
    }));
  });

  it('AWARDED → CONVERTED succeeds', async () => {
    const res = await postTransition('AWARDED', { to_state: 'CONVERTED' });
    expect(res.status).toBe(200);
  });

  it('DEFERRED → IN_DISCUSSION (re-activation) succeeds', async () => {
    const res = await postTransition('DEFERRED', { to_state: 'IN_DISCUSSION' });
    expect(res.status).toBe(200);
  });

  it('any non-terminal → LOST succeeds (early loss)', async () => {
    const res = await postTransition('NEW', { to_state: 'LOST', reason: 'changed mind' });
    expect(res.status).toBe(200);
  });

  it('rejects QUOTED → NEW (backward)', async () => {
    const res = await postTransition('QUOTED', { to_state: 'NEW' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when inquiry not found', async () => {
    selectResultQueue.push([]); // not found
    const { POST } = await import('@/app/api/inquiries/[id]/transition/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to_state: 'IN_DISCUSSION' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(404);
  });
});
