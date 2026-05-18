/**
 * BAN-341 PM-V1.0-B — Route-level tests for the RFIs API surface.
 *
 * Mocks @/db + permissions + env to exercise:
 *   - POST /api/rfis (creation, validation, auto-numbering)
 *   - POST /api/rfis/[id]/submit (DRAFT → SUBMITTED, ball_in_court update)
 *   - POST /api/rfis/[id]/log-response (SUBMITTED → ANSWERED, response capture)
 *   - POST /api/rfis/[id]/resolve (ANSWERED → RESOLVED with optional CO link)
 *   - POST /api/rfis/[id]/void (any → VOID)
 *
 * Pattern mirrors ban340PmSubmittalsRoutes.test.ts.
 */

export {};

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const RFI_ID = '00000000-0000-4000-8000-000000000444';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const executeResultQueue: Array<{ rows?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>> = [];

const updateSetSpy = jest.fn((_vals: Record<string, unknown>) => undefined);
const insertValuesSpy = jest.fn((_label: string, _vals: Record<string, unknown>) => undefined);

function makeTx() {
  const insert = jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      const label = tableHandle._label ?? 'unknown';
      insertValuesSpy(label, vals);
      return {
        returning: async () => {
          if (label === 'field_events') return [{ event_id: `evt-${insertValuesSpy.mock.calls.length}` }];
          return [{ ...vals, rfi_id: RFI_ID }];
        },
      };
    },
  }));

  const updateSet = jest.fn((vals: Record<string, unknown>) => {
    updateSetSpy(vals);
    return {
      where: () => ({
        returning: async () => [{ rfi_id: RFI_ID, ...vals }],
      }),
    };
  });
  const update = jest.fn(() => ({ set: updateSet }));

  const selectLimit = jest.fn(async () => selectResultQueue.shift() ?? []);
  const selectOrderBy = jest.fn(async () => selectResultQueue.shift() ?? []);
  const selectWhere = jest.fn(() => ({ limit: selectLimit, orderBy: selectOrderBy }));
  const selectInnerJoin = jest.fn(() => ({ where: selectWhere }));
  const selectFrom = jest.fn(() => ({ where: selectWhere, innerJoin: selectInnerJoin }));
  const select = jest.fn(() => ({ from: selectFrom }));

  const execute = jest.fn(async () => executeResultQueue.shift() ?? { rows: [{ next_seq: 1 }] });

  return { insert, update, select, execute };
}

const mockTransaction = jest.fn(async (cb: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
  return cb(makeTx());
});

const mockDb = {
  transaction: (cb: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => mockTransaction(cb),
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
        returning: async () => [{ ...vals, rfi_id: RFI_ID }],
      };
    },
  })),
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(vals);
      return {
        where: () => ({
          returning: async () => [{ rfi_id: RFI_ID, ...vals }],
        }),
      };
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'rfi_id', 'tenant_id', 'engagement_id', 'rfi_number', 'status',
    'subject', 'question', 'submitted_to', 'submitted_date',
    'required_response_by_date', 'ball_in_court', 'response_received_date',
    'response_text', 'response_documents', 'generates_change_order',
    'linked_change_order_id', 'is_test_project', 'kid', 'event_id',
    'pm_handoff_state',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  rfis: tbl('rfis'),
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
  executeResultQueue.length = 0;
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'kai@kulaglass.com' });
});

// ─── POST /api/rfis ──────────────────────────────────────────────────────────

describe('POST /api/rfis', () => {
  it('rejects when subject is missing', async () => {
    const { POST } = await import('@/app/api/rfis/route');
    const res = await POST(new Request('http://localhost/api/rfis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        question: 'huh?',
        submitted_to: 'GC',
      }),
    }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toMatch(/subject/i);
  });

  it('rejects when question is missing', async () => {
    const { POST } = await import('@/app/api/rfis/route');
    const res = await POST(new Request('http://localhost/api/rfis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        subject: 'A subject',
        submitted_to: 'GC',
      }),
    }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toMatch(/question/i);
  });

  it('rejects unknown submitted_to', async () => {
    const { POST } = await import('@/app/api/rfis/route');
    const res = await POST(new Request('http://localhost/api/rfis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        subject: 'A subject',
        question: 'huh?',
        submitted_to: 'NOT_A_PARTY',
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects subject longer than 120 chars', async () => {
    const { POST } = await import('@/app/api/rfis/route');
    const res = await POST(new Request('http://localhost/api/rfis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        subject: 'x'.repeat(121),
        question: 'huh?',
        submitted_to: 'GC',
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects when engagement_kid resolves to no row', async () => {
    selectResultQueue.push([]); // no engagement
    const { POST } = await import('@/app/api/rfis/route');
    const res = await POST(new Request('http://localhost/api/rfis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-9999',
        subject: 'Subject',
        question: 'Question',
        submitted_to: 'GC',
      }),
    }));
    expect(res.status).toBe(404);
  });

  it('creates the RFI with assembled number on success', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, kid: 'PRJ-26-0001' }]);
    executeResultQueue.push({ rows: [{ next_seq: 1 }] });
    const { POST } = await import('@/app/api/rfis/route');
    const res = await POST(new Request('http://localhost/api/rfis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        subject: 'Conflict between A3.2 and S2.1',
        question: 'Which is governing?',
        submitted_to: 'ARCHITECT',
        reason_for_rfi: 'DRAWING_CONFLICT',
      }),
    }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      'rfis',
      expect.objectContaining({
        rfi_number: 'PRJ-26-0001-RFI-001',
        status: 'DRAFT',
        ball_in_court: 'SUBCONTRACTOR',
        subject: 'Conflict between A3.2 and S2.1',
        question: 'Which is governing?',
        reason_for_rfi: 'DRAWING_CONFLICT',
        tenant_id: TENANT_ID,
        engagement_id: ENG_ID,
      }),
    );
  });

  it('increments the per-project sequence when MAX returns a prior value', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, kid: 'PRJ-26-0001' }]);
    executeResultQueue.push({ rows: [{ next_seq: 13 }] });
    const { POST } = await import('@/app/api/rfis/route');
    const res = await POST(new Request('http://localhost/api/rfis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        subject: 'Another',
        question: 'Question 13?',
        submitted_to: 'GC',
      }),
    }));
    expect(res.status).toBe(201);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      'rfis',
      expect.objectContaining({ rfi_number: 'PRJ-26-0001-RFI-013' }),
    );
  });
});

// ─── POST /api/rfis/[id]/submit ──────────────────────────────────────────────

describe('POST /api/rfis/[id]/submit', () => {
  it('rejects when no prior submitted_to and none provided', async () => {
    selectResultQueue.push([{ submitted_to: null, status: 'DRAFT' }]);
    const { POST } = await import('@/app/api/rfis/[id]/submit/route');
    const res = await POST(
      new Request(`http://localhost/api/rfis/${RFI_ID}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: RFI_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('drives DRAFT → SUBMITTED with submitted_to provided, ball_in_court updates to submitted_to', async () => {
    // 1. outer lookup of existing submitted_to / status
    selectResultQueue.push([{ submitted_to: null, status: 'DRAFT' }]);
    // 2. in-tx lookup for the transition
    selectResultQueue.push([{
      rfi_id: RFI_ID,
      engagement_id: ENG_ID,
      rfi_number: 'PRJ-26-0001-RFI-001',
      status: 'DRAFT',
      submitted_to: null,
      generates_change_order: false,
      linked_change_order_id: null,
      is_test_project: false,
      engagement_kid: 'PRJ-26-0001',
    }]);

    const { POST } = await import('@/app/api/rfis/[id]/submit/route');
    const res = await POST(
      new Request(`http://localhost/api/rfis/${RFI_ID}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ submitted_to: 'ARCHITECT' }),
      }),
      { params: Promise.resolve({ id: RFI_ID }) },
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.from_state).toBe('DRAFT');
    expect(j.to_state).toBe('SUBMITTED');

    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      status: 'SUBMITTED',
      submitted_to: 'ARCHITECT',
      ball_in_court: 'ARCHITECT',
    }));

    // Exactly one RFI_STATE_CHANGED emit
    const events = insertValuesSpy.mock.calls.filter(
      ([label, vals]) => label === 'field_events' && (vals as Record<string, unknown>).event_type === 'RFI_STATE_CHANGED',
    );
    expect(events).toHaveLength(1);
  });

  it('re-submits an ANSWERED RFI for follow-up, reusing prior submitted_to', async () => {
    selectResultQueue.push([{ submitted_to: 'GC', status: 'ANSWERED' }]);
    selectResultQueue.push([{
      rfi_id: RFI_ID,
      engagement_id: ENG_ID,
      rfi_number: 'PRJ-26-0001-RFI-005',
      status: 'ANSWERED',
      submitted_to: 'GC',
      generates_change_order: false,
      linked_change_order_id: null,
      is_test_project: false,
      engagement_kid: 'PRJ-26-0001',
    }]);

    const { POST } = await import('@/app/api/rfis/[id]/submit/route');
    const res = await POST(
      new Request(`http://localhost/api/rfis/${RFI_ID}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: RFI_ID }) },
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.from_state).toBe('ANSWERED');
    expect(j.to_state).toBe('SUBMITTED');
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      submitted_to: 'GC',
      ball_in_court: 'GC',
    }));
  });
});

// ─── POST /api/rfis/[id]/log-response ────────────────────────────────────────

describe('POST /api/rfis/[id]/log-response', () => {
  it('rejects missing response_text', async () => {
    const { POST } = await import('@/app/api/rfis/[id]/log-response/route');
    const res = await POST(
      new Request(`http://localhost/api/rfis/${RFI_ID}/log-response`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: RFI_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('transitions SUBMITTED → ANSWERED and stamps response fields, ball returns to SUBCONTRACTOR', async () => {
    selectResultQueue.push([{
      rfi_id: RFI_ID,
      engagement_id: ENG_ID,
      rfi_number: 'PRJ-26-0001-RFI-001',
      status: 'SUBMITTED',
      submitted_to: 'ARCHITECT',
      generates_change_order: false,
      linked_change_order_id: null,
      is_test_project: false,
      engagement_kid: 'PRJ-26-0001',
    }]);

    const { POST } = await import('@/app/api/rfis/[id]/log-response/route');
    const res = await POST(
      new Request(`http://localhost/api/rfis/${RFI_ID}/log-response`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          response_text: 'Per A3.2, the storefront opening width is 6\'-0".',
          response_received_date: '2026-05-12',
        }),
      }),
      { params: Promise.resolve({ id: RFI_ID }) },
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ANSWERED',
      ball_in_court: 'SUBCONTRACTOR',
      response_text: 'Per A3.2, the storefront opening width is 6\'-0".',
      response_received_date: '2026-05-12',
    }));
  });
});

// ─── POST /api/rfis/[id]/resolve ─────────────────────────────────────────────

describe('POST /api/rfis/[id]/resolve', () => {
  it('transitions ANSWERED → RESOLVED, ball goes to null, no CO emit when flag is false', async () => {
    selectResultQueue.push([{
      rfi_id: RFI_ID,
      engagement_id: ENG_ID,
      rfi_number: 'PRJ-26-0001-RFI-001',
      status: 'ANSWERED',
      submitted_to: 'ARCHITECT',
      generates_change_order: false,
      linked_change_order_id: null,
      is_test_project: false,
      engagement_kid: 'PRJ-26-0001',
    }]);

    const { POST } = await import('@/app/api/rfis/[id]/resolve/route');
    const res = await POST(
      new Request(`http://localhost/api/rfis/${RFI_ID}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: RFI_ID }) },
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.to_state).toBe('RESOLVED');
    expect(j.co_event_id).toBeNull();
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      status: 'RESOLVED',
      ball_in_court: null,
    }));

    const coEvents = insertValuesSpy.mock.calls.filter(
      ([label, vals]) => label === 'field_events' && (vals as Record<string, unknown>).event_type === 'RFI_GENERATED_CO',
    );
    expect(coEvents).toHaveLength(0);
  });

  it('emits an RFI_GENERATED_CO event when generates_change_order is set true', async () => {
    selectResultQueue.push([{
      rfi_id: RFI_ID,
      engagement_id: ENG_ID,
      rfi_number: 'PRJ-26-0001-RFI-001',
      status: 'ANSWERED',
      submitted_to: 'ARCHITECT',
      generates_change_order: false,
      linked_change_order_id: null,
      is_test_project: false,
      engagement_kid: 'PRJ-26-0001',
    }]);

    const { POST } = await import('@/app/api/rfis/[id]/resolve/route');
    const res = await POST(
      new Request(`http://localhost/api/rfis/${RFI_ID}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          generates_change_order: true,
          linked_change_order_id: 'co-uuid-here',
        }),
      }),
      { params: Promise.resolve({ id: RFI_ID }) },
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.co_event_id).toBeTruthy();

    const stateEvents = insertValuesSpy.mock.calls.filter(
      ([label, vals]) => label === 'field_events' && (vals as Record<string, unknown>).event_type === 'RFI_STATE_CHANGED',
    );
    expect(stateEvents).toHaveLength(1);

    const coEvents = insertValuesSpy.mock.calls.filter(
      ([label, vals]) => label === 'field_events' && (vals as Record<string, unknown>).event_type === 'RFI_GENERATED_CO',
    );
    expect(coEvents).toHaveLength(1);
    const coEventMetadata = (coEvents[0][1] as { metadata: Record<string, unknown> }).metadata;
    expect(coEventMetadata.linked_change_order_id).toBe('co-uuid-here');
  });
});

// ─── POST /api/rfis/[id]/void ────────────────────────────────────────────────

describe('POST /api/rfis/[id]/void', () => {
  it('voids a SUBMITTED RFI', async () => {
    selectResultQueue.push([{
      rfi_id: RFI_ID,
      engagement_id: ENG_ID,
      rfi_number: 'PRJ-26-0001-RFI-001',
      status: 'SUBMITTED',
      submitted_to: 'GC',
      generates_change_order: false,
      linked_change_order_id: null,
      is_test_project: false,
      engagement_kid: 'PRJ-26-0001',
    }]);

    const { POST } = await import('@/app/api/rfis/[id]/void/route');
    const res = await POST(
      new Request(`http://localhost/api/rfis/${RFI_ID}/void`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Duplicate of RFI 003' }),
      }),
      { params: Promise.resolve({ id: RFI_ID }) },
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      status: 'VOID',
      ball_in_court: null,
    }));
  });
});
