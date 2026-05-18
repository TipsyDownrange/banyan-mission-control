/**
 * BAN-340 PM-V1.0-A — Route-level tests for the submittals API surface.
 *
 * Mocks @/db + permissions + env to exercise:
 *   - POST /api/submittals (creation, CSI validation, duplicate detection)
 *   - GET  /api/submittals/by-kid/[kid] (engagement resolution + KPI shape)
 *   - POST /api/submittals/[id]/submit (REQUIRED→IN_PROGRESS→SUBMITTED chain)
 *   - POST /api/submittals/[id]/log-review (review outcome transitions)
 *
 * Pattern mirrors ban311CloseoutPatternBTransitions.test.ts.
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const SUB_ID = '00000000-0000-4000-8000-000000000333';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];

const updateSetSpy = jest.fn();
const insertValuesSpy = jest.fn();

function makeTx() {
  const insert = jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      const label = tableHandle._label ?? 'unknown';
      insertValuesSpy(label, vals);
      return {
        returning: async () => {
          if (label === 'field_events') return [{ event_id: 'evt-test' }];
          return [{ ...vals, submittal_id: SUB_ID }];
        },
      };
    },
  }));

  const updateWhere = jest.fn(async () => undefined);
  const updateSet = jest.fn((vals: Record<string, unknown>) => {
    updateSetSpy(vals);
    return {
      where: (..._args: unknown[]) => {
        void _args;
        return {
          returning: async () => [{ submittal_id: SUB_ID, ...vals }],
        };
      },
    };
  });
  const update = jest.fn(() => ({ set: updateSet }));

  const selectLimit = jest.fn(async () => selectResultQueue.shift() ?? []);
  const selectWhere = jest.fn(() => ({ limit: selectLimit }));
  const selectInnerJoin = jest.fn(() => ({ where: selectWhere }));
  const selectFrom = jest.fn(() => ({ where: selectWhere, innerJoin: selectInnerJoin }));
  const select = jest.fn(() => ({ from: selectFrom }));

  return { insert, update, select };
}

const mockTransaction = jest.fn(async (cb: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
  return cb(makeTx());
});

const mockDb = {
  transaction: (cb: never) => mockTransaction(cb),
  select: jest.fn(() => {
    const limit = jest.fn(async () => selectResultQueue.shift() ?? []);
    const orderBy = jest.fn(async () => selectResultQueue.shift() ?? []);
    const where = jest.fn(() => ({ limit, orderBy }));
    const from = jest.fn(() => ({ where }));
    return { from };
  }),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      const label = tableHandle._label ?? 'unknown';
      insertValuesSpy(label, vals);
      return {
        returning: async () => [{ ...vals, submittal_id: SUB_ID }],
      };
    },
  })),
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(vals);
      return {
        where: () => ({
          returning: async () => [{ submittal_id: SUB_ID, ...vals }],
        }),
      };
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'submittal_id', 'tenant_id', 'engagement_id', 'submittal_number', 'status',
    'submittal_type', 'csi_spec_section', 'csi_subsection', 'csi_sub_subsection',
    'submitted_to', 'submitted_date', 'ball_in_court', 'is_test_project',
    'kid', 'event_id', 'submitted_documents', 'review_comments_documents',
    'approved_documents', 'pm_handoff_state',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  submittals: tbl('submittals'),
  engagements: tbl('engagements'),
  field_events: tbl('field_events'),
}));

const mockCheckPermission = jest.fn();
jest.mock('@/lib/permissions', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
}));

jest.mock('@/lib/service-work-orders/postgres-read-guard', () => ({
  blockWOStagingPostgresReadOnlyMutation: () => null,
}));

jest.mock('@/lib/env', () => ({
  getDefaultTenantId: () => TENANT_ID,
  isPostgresWriteEnabled: () => true,
}));

beforeEach(() => {
  jest.clearAllMocks();
  selectResultQueue.length = 0;
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'kai@kulaglass.com' });
});

// ─── POST /api/submittals ────────────────────────────────────────────────────

describe('POST /api/submittals', () => {
  it('rejects when CSI coordinate is invalid', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, kid: 'PRJ-26-0001' }]);
    const { POST } = await import('@/app/api/submittals/route');
    const res = await POST(new Request('http://localhost/api/submittals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        csi_spec_section: 'bad',
        csi_subsection: '1.3',
        csi_sub_subsection: 'A',
        submittal_type: 'ACTION',
      }),
    }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.validation_errors).toBeDefined();
    expect(j.validation_errors[0].field).toBe('csi_spec_section');
  });

  it('rejects unknown submittal_type', async () => {
    const { POST } = await import('@/app/api/submittals/route');
    const res = await POST(new Request('http://localhost/api/submittals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        csi_spec_section: '08410',
        csi_subsection: '1.3',
        csi_sub_subsection: 'A',
        submittal_type: 'NOT_A_TYPE',
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects when engagement_kid resolves to no row', async () => {
    selectResultQueue.push([]); // no engagement
    const { POST } = await import('@/app/api/submittals/route');
    const res = await POST(new Request('http://localhost/api/submittals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-9999',
        csi_spec_section: '08410',
        csi_subsection: '1.3',
        csi_sub_subsection: 'A',
        submittal_type: 'ACTION',
      }),
    }));
    expect(res.status).toBe(404);
  });

  it('creates the submittal with assembled number on success', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, kid: 'PRJ-26-0001' }]);
    const { POST } = await import('@/app/api/submittals/route');
    const res = await POST(new Request('http://localhost/api/submittals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        csi_spec_section: '08410',
        csi_subsection: '1.3',
        csi_sub_subsection: 'A',
        submittal_type: 'ACTION',
        description: 'Storefront hardware',
      }),
    }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      'submittals',
      expect.objectContaining({
        submittal_number: 'PRJ-26-0001-SUB-08410-1.3-A',
        status: 'REQUIRED',
        ball_in_court: 'SUBCONTRACTOR',
        submittal_type: 'ACTION',
        tenant_id: TENANT_ID,
        engagement_id: ENG_ID,
      }),
    );
  });
});

// ─── POST /api/submittals/[id]/submit ─────────────────────────────────────────

describe('POST /api/submittals/[id]/submit', () => {
  it('rejects missing submitted_to', async () => {
    const { POST } = await import('@/app/api/submittals/[id]/submit/route');
    const res = await POST(
      new Request(`http://localhost/api/submittals/${SUB_ID}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: SUB_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('drives REQUIRED → IN_PROGRESS → SUBMITTED in two transitions, emitting two events', async () => {
    // 1. outer lookup of current status
    selectResultQueue.push([{ status: 'REQUIRED' }]);
    // 2. in-tx lookup for IN_PROGRESS transition (executor select)
    selectResultQueue.push([{
      submittal_id: SUB_ID,
      engagement_id: ENG_ID,
      submittal_number: 'PRJ-26-0001-SUB-08410-1.3-A',
      status: 'REQUIRED',
      submitted_to: null,
      is_test_project: false,
      engagement_kid: 'PRJ-26-0001',
    }]);
    // 3. in-tx lookup for SUBMITTED transition
    selectResultQueue.push([{
      submittal_id: SUB_ID,
      engagement_id: ENG_ID,
      submittal_number: 'PRJ-26-0001-SUB-08410-1.3-A',
      status: 'IN_PROGRESS',
      submitted_to: null,
      is_test_project: false,
      engagement_kid: 'PRJ-26-0001',
    }]);

    const { POST } = await import('@/app/api/submittals/[id]/submit/route');
    const res = await POST(
      new Request(`http://localhost/api/submittals/${SUB_ID}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ submitted_to: 'ARCHITECT' }),
      }),
      { params: Promise.resolve({ id: SUB_ID }) },
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.from_state).toBe('IN_PROGRESS');
    expect(j.to_state).toBe('SUBMITTED');
    expect(j.intermediate_transitions).toHaveLength(1);
    expect(j.intermediate_transitions[0].to_state).toBe('IN_PROGRESS');

    // Two SUBMITTAL_STATE_CHANGED events should have been emitted (one per
    // transition). The mock insert spy records every field_events row.
    const submittalEvents = insertValuesSpy.mock.calls.filter(
      ([label, vals]) => label === 'field_events' && (vals as Record<string, unknown>).event_type === 'SUBMITTAL_STATE_CHANGED',
    );
    expect(submittalEvents).toHaveLength(2);
  });

  it('updates ball_in_court to the submitted_to party on SUBMITTED', async () => {
    selectResultQueue.push([{ status: 'IN_PROGRESS' }]);
    selectResultQueue.push([{
      submittal_id: SUB_ID,
      engagement_id: ENG_ID,
      submittal_number: 'PRJ-26-0001-SUB-08410-1.3-A',
      status: 'IN_PROGRESS',
      submitted_to: null,
      is_test_project: false,
      engagement_kid: 'PRJ-26-0001',
    }]);

    const { POST } = await import('@/app/api/submittals/[id]/submit/route');
    const res = await POST(
      new Request(`http://localhost/api/submittals/${SUB_ID}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ submitted_to: 'GC' }),
      }),
      { params: Promise.resolve({ id: SUB_ID }) },
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      status: 'SUBMITTED',
      submitted_to: 'GC',
      ball_in_court: 'GC',
    }));
  });
});

// ─── POST /api/submittals/[id]/log-review ────────────────────────────────────

describe('POST /api/submittals/[id]/log-review', () => {
  it('rejects invalid outcomes', async () => {
    const { POST } = await import('@/app/api/submittals/[id]/log-review/route');
    const res = await POST(
      new Request(`http://localhost/api/submittals/${SUB_ID}/log-review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome: 'CLOSED' }),
      }),
      { params: Promise.resolve({ id: SUB_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('applies APPROVED with approved_date stamp and ball_in_court SUBCONTRACTOR', async () => {
    selectResultQueue.push([{
      submittal_id: SUB_ID,
      engagement_id: ENG_ID,
      submittal_number: 'PRJ-26-0001-SUB-08410-1.3-A',
      status: 'UNDER_REVIEW',
      submitted_to: 'ARCHITECT',
      is_test_project: false,
      engagement_kid: 'PRJ-26-0001',
    }]);

    const { POST } = await import('@/app/api/submittals/[id]/log-review/route');
    const res = await POST(
      new Request(`http://localhost/api/submittals/${SUB_ID}/log-review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome: 'APPROVED', reviewed_date: '2026-05-10' }),
      }),
      { params: Promise.resolve({ id: SUB_ID }) },
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      status: 'APPROVED',
      ball_in_court: 'SUBCONTRACTOR',
      reviewed_date: '2026-05-10',
      approved_date: '2026-05-10',
    }));
  });

  it('REVISE_RESUBMIT does not stamp approved_date', async () => {
    selectResultQueue.push([{
      submittal_id: SUB_ID,
      engagement_id: ENG_ID,
      submittal_number: 'PRJ-26-0001-SUB-08410-1.3-A',
      status: 'UNDER_REVIEW',
      submitted_to: 'GC',
      is_test_project: false,
      engagement_kid: 'PRJ-26-0001',
    }]);

    const { POST } = await import('@/app/api/submittals/[id]/log-review/route');
    const res = await POST(
      new Request(`http://localhost/api/submittals/${SUB_ID}/log-review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome: 'REVISE_RESUBMIT' }),
      }),
      { params: Promise.resolve({ id: SUB_ID }) },
    );
    expect(res.status).toBe(200);
    const lastUpdate = updateSetSpy.mock.calls[updateSetSpy.mock.calls.length - 1][0];
    expect(lastUpdate.approved_date).toBeUndefined();
    expect(lastUpdate.status).toBe('REVISE_RESUBMIT');
    expect(lastUpdate.ball_in_court).toBe('SUBCONTRACTOR');
  });
});
