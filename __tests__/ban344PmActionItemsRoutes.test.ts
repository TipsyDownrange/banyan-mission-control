/**
 * BAN-344 PM-V1.0-E — Route-level tests for the action items API surface.
 *
 * Mocks @/db + permissions + env to exercise:
 *   - POST   /api/action-items           (manual + source-derived create)
 *   - GET    /api/action-items/by-kid/[kid]
 *   - GET    /api/action-items/by-assignee/[user_id]
 *   - GET    /api/action-items/[id]
 *   - PATCH  /api/action-items/[id]
 *   - POST   /api/action-items/[id]/complete
 *   - POST   /api/action-items/[id]/defer
 *   - POST   /api/action-items/[id]/cancel
 *   - POST   /api/action-items/[id]/assign
 *   - dispatchSourceEvent (subscriber pattern, integration)
 *
 * Pattern mirrors ban343PmMeetingsRoutes.test.ts.
 */

const AI_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const AI_ENG_ID = '00000000-0000-4000-8000-000000000099';
const AI_ITEM_ID = '00000000-0000-4000-8000-000000000333';
const AI_ACTOR_USER_ID = '00000000-0000-4000-8000-000000000666';
const AI_ASSIGNEE_ID = '00000000-0000-4000-8000-000000000777';
const AI_SOURCE_RFI_ID = '00000000-0000-4000-8000-000000000444';

const aiSelectResultQueue: Array<Array<Record<string, unknown>>> = [];

const aiInsertValuesSpy = jest.fn();
const aiUpdateSetSpy = jest.fn();
const aiUpdateReturningQueue: Array<Array<Record<string, unknown>>> = [];

function aiMakeTx() {
  const insert = jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown> | Record<string, unknown>[]) => {
      const label = tableHandle._label ?? 'unknown';
      aiInsertValuesSpy(label, vals);
      return {
        returning: async () => {
          if (label === 'field_events') return [{ event_id: 'evt-' + Math.random().toString(36).slice(2, 8) }];
          if (label === 'action_items') {
            return [{ action_item_id: AI_ITEM_ID, ...(vals as Record<string, unknown>) }];
          }
          return [vals];
        },
      };
    },
  }));

  const updateSet = jest.fn((vals: Record<string, unknown>) => {
    aiUpdateSetSpy(vals);
    return {
      where: () => ({
        returning: async () => {
          const queued = aiUpdateReturningQueue.shift();
          if (queued) return queued;
          return [{ action_item_id: AI_ITEM_ID, ...vals }];
        },
      }),
    };
  });
  const update = jest.fn(() => ({ set: updateSet }));

  const txSelectChain = () => {
    const limit = jest.fn(async () => aiSelectResultQueue.shift() ?? []);
    const orderBy = jest.fn(async () => aiSelectResultQueue.shift() ?? []);
    const groupBy = jest.fn(async () => aiSelectResultQueue.shift() ?? []);
    // Drizzle queries are thenable — make `.where(...)` await-able directly
    // so the subscriber's `await tx.select().from().where(...)` resolves.
    const where = jest.fn(() => {
      const chain = { limit, orderBy, groupBy } as Record<string, unknown>;
      (chain as { then?: (resolve: (rows: unknown[]) => void) => void }).then = (resolve) => {
        resolve(aiSelectResultQueue.shift() ?? []);
      };
      return chain;
    });
    const innerJoin = jest.fn(() => ({ where }));
    const leftJoin = jest.fn(() => ({ where }));
    const from = jest.fn(() => ({ where, innerJoin, leftJoin }));
    return { from };
  };
  const select = jest.fn(() => txSelectChain());

  return { insert, update, select };
}

const aiMockTransaction = jest.fn(async (cb: (tx: ReturnType<typeof aiMakeTx>) => Promise<unknown>) => {
  return cb(aiMakeTx());
});

function aiMakeSelectChain() {
  const limit = jest.fn(async () => aiSelectResultQueue.shift() ?? []);
  const orderBy = jest.fn(async () => aiSelectResultQueue.shift() ?? []);
  const groupBy = jest.fn(async () => aiSelectResultQueue.shift() ?? []);
  // Bare `.where(...)` (no limit/orderBy) — make it thenable by returning
  // a promise-like object that resolves to the next queue entry.
  const where = jest.fn(() => {
    const chain = { limit, orderBy, groupBy } as Record<string, unknown>;
    (chain as { then?: (resolve: (rows: unknown[]) => void) => void }).then = (resolve) => {
      resolve(aiSelectResultQueue.shift() ?? []);
    };
    return chain;
  });
  const innerJoin = jest.fn(() => ({ where, leftJoin, innerJoin }));
  const leftJoin = jest.fn(() => ({ where, innerJoin, leftJoin }));
  const from = jest.fn(() => ({ where, leftJoin, innerJoin }));
  return { from };
}

const aiMockDb = {
  transaction: (cb: never) => aiMockTransaction(cb),
  select: jest.fn(() => aiMakeSelectChain()),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      const label = tableHandle._label ?? 'unknown';
      aiInsertValuesSpy(label, vals);
      return {
        returning: async () => [{ action_item_id: AI_ITEM_ID, ...vals }],
      };
    },
  })),
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      aiUpdateSetSpy(vals);
      return { where: () => ({ returning: async () => [{ action_item_id: AI_ITEM_ID, ...vals }] }) };
    },
  })),
};

function aiTbl(label: string) {
  const cols = [
    'action_item_id', 'tenant_id', 'engagement_id', 'source_event_type',
    'source_entity_type', 'source_entity_id', 'title', 'description',
    'action_required', 'assigned_to', 'due_date', 'priority', 'status',
    'auto_closed_reason', 'created_at', 'created_by', 'completed_at',
    'completed_by', 'notes',
    'kid', 'is_test_project', 'email', 'user_id',
    'event_id', 'engagement_kid',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: aiMockDb,
  action_items: aiTbl('action_items'),
  engagements: aiTbl('engagements'),
  users: aiTbl('users'),
  field_events: aiTbl('field_events'),
}));

const aiMockCheckPermission = jest.fn();
jest.mock('@/lib/permissions', () => ({
  checkPermission: (...args: unknown[]) => aiMockCheckPermission(...args),
}));

jest.mock('@/lib/service-work-orders/postgres-read-guard', () => ({
  blockWOStagingPostgresReadOnlyMutation: () => null,
}));

jest.mock('@/lib/env', () => ({
  getDefaultTenantId: () => AI_TENANT_ID,
  isPostgresWriteEnabled: () => true,
}));

beforeEach(() => {
  jest.clearAllMocks();
  aiSelectResultQueue.length = 0;
  aiMockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'pm@kulaglass.com' });
});

// ═══ POST /api/action-items ════════════════════════════════════════════════

describe('POST /api/action-items (manual create)', () => {
  it('rejects when title is missing', async () => {
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]); // user resolve
    const { POST } = await import('@/app/api/action-items/route');
    const res = await POST(new Request('http://localhost/api/action-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source_entity_type: 'MANUAL' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects unknown source_entity_type', async () => {
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/action-items/route');
    const res = await POST(new Request('http://localhost/api/action-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'X', source_entity_type: 'BOGUS' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects unknown priority', async () => {
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/action-items/route');
    const res = await POST(new Request('http://localhost/api/action-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'X', priority: 'CRITICAL' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects malformed due_date', async () => {
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/action-items/route');
    const res = await POST(new Request('http://localhost/api/action-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'X', due_date: 'tomorrow' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects assigned_to that is not a uuid', async () => {
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/action-items/route');
    const res = await POST(new Request('http://localhost/api/action-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'X', assigned_to: 'joey' }),
    }));
    expect(res.status).toBe(400);
  });

  it('creates a MANUAL action item without engagement and emits ACTION_ITEM_CREATED', async () => {
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]); // resolveUserIdByEmail
    const { POST } = await import('@/app/api/action-items/route');
    const res = await POST(new Request('http://localhost/api/action-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Email architect about ASI-3',
        priority: 'HIGH',
      }),
    }));
    expect(res.status).toBe(201);
    const labels = aiInsertValuesSpy.mock.calls.map((c) => c[0]);
    expect(labels).toContain('action_items');
    expect(labels).toContain('field_events');
    const ev = aiInsertValuesSpy.mock.calls.find((c) => c[0] === 'field_events');
    expect(ev?.[1]).toMatchObject({ event_type: 'ACTION_ITEM_CREATED', entity_type: 'internal' });
    const meta = (ev?.[1] as { metadata: Record<string, unknown> }).metadata;
    expect(meta.entity_kind).toBe('action_item');
    expect(meta.auto_created).toBe(false);
  });

  it('creates a project-scoped action item when engagement_kid resolves', async () => {
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]); // resolveUserIdByEmail
    aiSelectResultQueue.push([{ engagement_id: AI_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false }]);
    const { POST } = await import('@/app/api/action-items/route');
    const res = await POST(new Request('http://localhost/api/action-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_kid: 'PRJ-26-0001',
        title: 'Send pay app #7 reminder',
        priority: 'MEDIUM',
      }),
    }));
    expect(res.status).toBe(201);
    const ev = aiInsertValuesSpy.mock.calls.find((c) => c[0] === 'field_events');
    expect(ev?.[1]).toMatchObject({
      event_type: 'ACTION_ITEM_CREATED',
      entity_type: 'project',
      entity_id: AI_ENG_ID,
      kid: 'PRJ-26-0001',
    });
  });

  it('returns 404 when engagement_kid does not resolve', async () => {
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]);
    aiSelectResultQueue.push([]); // engagement lookup empty
    const { POST } = await import('@/app/api/action-items/route');
    const res = await POST(new Request('http://localhost/api/action-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engagement_kid: 'PRJ-99-9999', title: 'X' }),
    }));
    expect(res.status).toBe(404);
  });

  it('rejects unauthorized roles', async () => {
    aiMockCheckPermission.mockResolvedValueOnce({ allowed: true, role: 'crew', email: 'crew@kulaglass.com' });
    const { POST } = await import('@/app/api/action-items/route');
    const res = await POST(new Request('http://localhost/api/action-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'X' }),
    }));
    expect(res.status).toBe(403);
  });

  it('accepts a derived source_entity_id when source_entity_type is not MANUAL', async () => {
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]);
    const { POST } = await import('@/app/api/action-items/route');
    const res = await POST(new Request('http://localhost/api/action-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Track RFI response',
        source_entity_type: 'RFI',
        source_entity_id: AI_SOURCE_RFI_ID,
        source_event_type: 'RFI_STATE_CHANGED',
      }),
    }));
    expect(res.status).toBe(201);
    const insertCall = aiInsertValuesSpy.mock.calls.find((c) => c[0] === 'action_items');
    expect((insertCall?.[1] as Record<string, unknown>).source_entity_type).toBe('RFI');
    expect((insertCall?.[1] as Record<string, unknown>).source_entity_id).toBe(AI_SOURCE_RFI_ID);
  });
});

// ═══ GET /api/action-items/[id] ═════════════════════════════════════════════

describe('GET /api/action-items/[id]', () => {
  it('returns 404 when not found', async () => {
    aiMockCheckPermission.mockResolvedValueOnce({ allowed: true, role: 'pm', email: 'pm@kulaglass.com' });
    aiSelectResultQueue.push([]); // getActionItemForTenant
    const { GET } = await import('@/app/api/action-items/[id]/route');
    const res = await GET(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}`),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns the action item when found', async () => {
    aiMockCheckPermission.mockResolvedValueOnce({ allowed: true, role: 'pm', email: 'pm@kulaglass.com' });
    aiSelectResultQueue.push([{
      action_item_id: AI_ITEM_ID,
      tenant_id: AI_TENANT_ID,
      engagement_id: AI_ENG_ID,
      title: 'X',
      status: 'OPEN',
      priority: 'HIGH',
      kid: 'PRJ-26-0001',
    }]);
    const { GET } = await import('@/app/api/action-items/[id]/route');
    const res = await GET(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}`),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.action_item.action_item_id).toBe(AI_ITEM_ID);
  });
});

// ═══ PATCH /api/action-items/[id] ═══════════════════════════════════════════

describe('PATCH /api/action-items/[id]', () => {
  it('rejects when no allowed field supplied', async () => {
    aiSelectResultQueue.push([{ action_item_id: AI_ITEM_ID, status: 'OPEN', engagement_id: null }]);
    const { PATCH } = await import('@/app/api/action-items/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }), // status not in PATCH set
      }),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('rejects empty title', async () => {
    aiSelectResultQueue.push([{ action_item_id: AI_ITEM_ID, status: 'OPEN' }]);
    const { PATCH } = await import('@/app/api/action-items/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '   ' }),
      }),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('applies title + priority patch and emits ACTION_ITEM_STATE_CHANGED', async () => {
    aiSelectResultQueue.push([{
      action_item_id: AI_ITEM_ID, status: 'OPEN', engagement_id: AI_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false,
    }]);
    const { PATCH } = await import('@/app/api/action-items/[id]/route');
    const res = await PATCH(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'New title', priority: 'URGENT' }),
      }),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(200);
    expect(aiUpdateSetSpy.mock.calls[0][0]).toMatchObject({ title: 'New title', priority: 'URGENT' });
    const ev = aiInsertValuesSpy.mock.calls.find((c) => c[0] === 'field_events');
    expect(ev?.[1]).toMatchObject({ event_type: 'ACTION_ITEM_STATE_CHANGED' });
  });
});

// ═══ POST /api/action-items/[id]/complete ═══════════════════════════════════

describe('POST /api/action-items/[id]/complete', () => {
  it('transitions OPEN → COMPLETED and emits ACTION_ITEM_STATE_CHANGED', async () => {
    // Route-level existing fetch
    aiSelectResultQueue.push([{
      action_item_id: AI_ITEM_ID, status: 'OPEN', engagement_id: AI_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false, assigned_to: null,
    }]);
    // resolveUserIdByEmail (looks up users.user_id)
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]);
    // executeActionItemTransition's internal getActionItemForTenant
    aiSelectResultQueue.push([{
      action_item_id: AI_ITEM_ID, status: 'OPEN', engagement_id: AI_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false, assigned_to: null,
    }]);
    const { POST } = await import('@/app/api/action-items/[id]/complete/route');
    const res = await POST(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}/complete`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      }),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(200);
    expect(aiUpdateSetSpy.mock.calls[0][0]).toMatchObject({ status: 'COMPLETED' });
    expect(aiUpdateSetSpy.mock.calls[0][0]).toHaveProperty('completed_at');
    const ev = aiInsertValuesSpy.mock.calls.find((c) => c[0] === 'field_events');
    expect(ev?.[1]).toMatchObject({ event_type: 'ACTION_ITEM_STATE_CHANGED' });
    const meta = (ev?.[1] as { metadata: Record<string, unknown> }).metadata;
    expect(meta.from_state).toBe('OPEN');
    expect(meta.to_state).toBe('COMPLETED');
  });

  it('rejects completing a terminal row', async () => {
    aiSelectResultQueue.push([{
      action_item_id: AI_ITEM_ID, status: 'COMPLETED', engagement_id: AI_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false,
    }]);
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]);
    aiSelectResultQueue.push([{
      action_item_id: AI_ITEM_ID, status: 'COMPLETED', engagement_id: AI_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false,
    }]);
    const { POST } = await import('@/app/api/action-items/[id]/complete/route');
    const res = await POST(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}/complete`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      }),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('field_super may only complete items assigned to themselves', async () => {
    aiMockCheckPermission.mockResolvedValueOnce({ allowed: true, role: 'field_super', email: 'super@kulaglass.com' });
    aiSelectResultQueue.push([{
      action_item_id: AI_ITEM_ID, status: 'IN_PROGRESS', engagement_id: AI_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false,
      assigned_to: AI_ASSIGNEE_ID,
    }]);
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]); // resolveUserIdByEmail (different user)
    // Route returns 403 before executeActionItemTransition, so no third push needed.
    const { POST } = await import('@/app/api/action-items/[id]/complete/route');
    const res = await POST(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}/complete`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      }),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(403);
  });
});

// ═══ POST /api/action-items/[id]/defer ══════════════════════════════════════

describe('POST /api/action-items/[id]/defer', () => {
  it('requires a reason', async () => {
    const { POST } = await import('@/app/api/action-items/[id]/defer/route');
    const res = await POST(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}/defer`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      }),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('rejects malformed due_date', async () => {
    const { POST } = await import('@/app/api/action-items/[id]/defer/route');
    const res = await POST(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}/defer`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Waiting on GC', due_date: 'someday' }),
      }),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('transitions OPEN → DEFERRED with new due_date', async () => {
    // resolveUserIdByEmail runs first in /defer
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]);
    // executeActionItemTransition's internal getActionItemForTenant
    aiSelectResultQueue.push([{
      action_item_id: AI_ITEM_ID, status: 'OPEN', engagement_id: AI_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false,
    }]);
    const { POST } = await import('@/app/api/action-items/[id]/defer/route');
    const res = await POST(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}/defer`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Waiting on GC sign-off', due_date: '2026-06-01' }),
      }),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(200);
    expect(aiUpdateSetSpy.mock.calls[0][0]).toMatchObject({ status: 'DEFERRED', due_date: '2026-06-01' });
  });
});

// ═══ POST /api/action-items/[id]/cancel ═════════════════════════════════════

describe('POST /api/action-items/[id]/cancel', () => {
  it('requires a reason', async () => {
    const { POST } = await import('@/app/api/action-items/[id]/cancel/route');
    const res = await POST(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}/cancel`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      }),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('transitions OPEN → CANCELLED and stamps auto_closed_reason', async () => {
    // resolveUserIdByEmail runs first in /cancel
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]);
    aiSelectResultQueue.push([{
      action_item_id: AI_ITEM_ID, status: 'OPEN', engagement_id: AI_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false,
    }]);
    const { POST } = await import('@/app/api/action-items/[id]/cancel/route');
    const res = await POST(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}/cancel`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Duplicate of AI-2' }),
      }),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(200);
    expect(aiUpdateSetSpy.mock.calls[0][0]).toMatchObject({
      status: 'CANCELLED',
      auto_closed_reason: 'Duplicate of AI-2',
    });
  });
});

// ═══ POST /api/action-items/[id]/assign ═════════════════════════════════════

describe('POST /api/action-items/[id]/assign', () => {
  it('rejects when assigned_to is not a uuid', async () => {
    const { POST } = await import('@/app/api/action-items/[id]/assign/route');
    const res = await POST(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assigned_to: 'joey' }),
      }),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('OPEN row transitions to IN_PROGRESS on first assignment', async () => {
    // Route-level existing fetch
    aiSelectResultQueue.push([{
      action_item_id: AI_ITEM_ID, status: 'OPEN', engagement_id: AI_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false,
    }]);
    // resolveUserIdByEmail
    aiSelectResultQueue.push([{ user_id: AI_ACTOR_USER_ID }]);
    // executeTransition's own getActionItemForTenant
    aiSelectResultQueue.push([{
      action_item_id: AI_ITEM_ID, status: 'OPEN', engagement_id: AI_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false,
    }]);
    const { POST } = await import('@/app/api/action-items/[id]/assign/route');
    const res = await POST(
      new Request(`http://localhost/api/action-items/${AI_ITEM_ID}/assign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assigned_to: AI_ASSIGNEE_ID }),
      }),
      { params: Promise.resolve({ id: AI_ITEM_ID }) },
    );
    expect(res.status).toBe(200);
    expect(aiUpdateSetSpy.mock.calls[0][0]).toMatchObject({
      status: 'IN_PROGRESS',
      assigned_to: AI_ASSIGNEE_ID,
    });
  });
});

// ═══ GET /api/action-items/by-kid/[kid] ═════════════════════════════════════

describe('GET /api/action-items/by-kid/[kid]', () => {
  it('returns empty payload with kIDFound=false when engagement missing', async () => {
    aiMockCheckPermission.mockResolvedValueOnce({ allowed: true, email: 'pm@kulaglass.com' });
    aiSelectResultQueue.push([]); // engagement lookup
    const { GET } = await import('@/app/api/action-items/by-kid/[kid]/route');
    const res = await GET(
      new Request('http://localhost/api/action-items/by-kid/PRJ-99'),
      { params: Promise.resolve({ kid: 'PRJ-99' }) },
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.kIDFound).toBe(false);
    expect(j.items).toEqual([]);
    expect(j.summary.total).toBe(0);
  });

  it('returns enriched items + summary when engagement resolves', async () => {
    aiMockCheckPermission.mockResolvedValueOnce({ allowed: true, email: 'pm@kulaglass.com' });
    aiSelectResultQueue.push([{ engagement_id: AI_ENG_ID, kid: 'PRJ-26-0001', is_test_project: false }]);
    aiSelectResultQueue.push([
      { action_item_id: 'a1', status: 'OPEN', priority: 'URGENT', source_entity_type: 'RFI', due_date: '2025-01-01' },
      { action_item_id: 'a2', status: 'IN_PROGRESS', priority: 'HIGH', source_entity_type: 'SUBMITTAL', due_date: null },
      { action_item_id: 'a3', status: 'COMPLETED', priority: 'LOW', source_entity_type: 'MANUAL', due_date: null },
    ]);
    const { GET } = await import('@/app/api/action-items/by-kid/[kid]/route');
    const res = await GET(
      new Request('http://localhost/api/action-items/by-kid/PRJ-26-0001'),
      { params: Promise.resolve({ kid: 'PRJ-26-0001' }) },
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.kIDFound).toBe(true);
    expect(j.items).toHaveLength(3);
    expect(j.summary.total).toBe(3);
    expect(j.summary.open_count).toBe(2);
    expect(j.summary.overdue_count).toBe(1);
    expect(j.summary.by_status.OPEN).toBe(1);
    expect(j.summary.by_status.COMPLETED).toBe(1);
  });
});

// ═══ GET /api/action-items/by-assignee/[user_id] ════════════════════════════

describe('GET /api/action-items/by-assignee/[user_id]', () => {
  it('rejects non-uuid user_id', async () => {
    const { GET } = await import('@/app/api/action-items/by-assignee/[user_id]/route');
    const res = await GET(
      new Request('http://localhost/api/action-items/by-assignee/joey'),
      { params: Promise.resolve({ user_id: 'joey' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns rows and computes project_count', async () => {
    aiSelectResultQueue.push([
      { action_item_id: 'a1', kid: 'PRJ-26-0001' },
      { action_item_id: 'a2', kid: 'PRJ-26-0001' },
      { action_item_id: 'a3', kid: 'PRJ-26-0002' },
      { action_item_id: 'a4', kid: null },
    ]);
    const { GET } = await import('@/app/api/action-items/by-assignee/[user_id]/route');
    const res = await GET(
      new Request(`http://localhost/api/action-items/by-assignee/${AI_ASSIGNEE_ID}`),
      { params: Promise.resolve({ user_id: AI_ASSIGNEE_ID }) },
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.total).toBe(4);
    expect(j.project_count).toBe(2);
  });
});

// ═══ Subscriber integration: dispatchSourceEvent ═════════════════════════════

describe('BAN-344 subscriber — dispatchSourceEvent integration', () => {
  beforeEach(() => {
    aiSelectResultQueue.length = 0;
    aiUpdateReturningQueue.length = 0;
    aiInsertValuesSpy.mockClear();
    aiUpdateSetSpy.mockClear();
  });

  it('creates an action_item and emits ACTION_ITEM_CREATED when a rule matches', async () => {
    const { dispatchSourceEvent } = await import('@/lib/pm/action-items/spine-subscriber');
    const result = await dispatchSourceEvent({
      eventType: 'RFI_STATE_CHANGED',
      entityKind: 'rfi',
      entityId: AI_SOURCE_RFI_ID,
      tenantId: AI_TENANT_ID,
      engagementId: AI_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'SUBMITTED', to_state: 'ANSWERED', rfi_number: 'R-005' },
      actorEmail: 'pm@kulaglass.com',
    });
    expect(result.skipped).toBe(false);
    expect(result.createdActionItemIds).toHaveLength(1);
    expect(result.createdEventIds).toHaveLength(1);
    const insertCall = aiInsertValuesSpy.mock.calls.find((c) => c[0] === 'action_items');
    expect((insertCall?.[1] as Record<string, unknown>).source_entity_type).toBe('RFI');
    expect((insertCall?.[1] as Record<string, unknown>).action_required).toBe('REVIEW');
    const evCall = aiInsertValuesSpy.mock.calls.find((c) => c[0] === 'field_events');
    expect((evCall?.[1] as { event_type: string }).event_type).toBe('ACTION_ITEM_CREATED');
  });

  it('auto-closes existing open rows when source resolves', async () => {
    // Subscriber stale-lookup returns two open action items tied to the RFI.
    aiSelectResultQueue.push([
      { action_item_id: 'a1' },
      { action_item_id: 'a2' },
    ]);
    // The follow-up UPDATE ... RETURNING should yield both ids.
    aiUpdateReturningQueue.push([
      { action_item_id: 'a1' },
      { action_item_id: 'a2' },
    ]);
    const { dispatchSourceEvent } = await import('@/lib/pm/action-items/spine-subscriber');
    const result = await dispatchSourceEvent({
      eventType: 'RFI_STATE_CHANGED',
      entityKind: 'rfi',
      entityId: AI_SOURCE_RFI_ID,
      tenantId: AI_TENANT_ID,
      engagementId: AI_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'ANSWERED', to_state: 'RESOLVED' },
      actorEmail: 'pm@kulaglass.com',
    });
    expect(result.skipped).toBe(false);
    expect(result.autoClosedActionItemIds).toHaveLength(2);
    expect(aiUpdateSetSpy.mock.calls[0][0]).toMatchObject({
      status: 'AUTO_CLOSED',
    });
    expect((aiUpdateSetSpy.mock.calls[0][0] as { auto_closed_reason: string }).auto_closed_reason).toContain('RESOLVED');
    const closedEmits = aiInsertValuesSpy.mock.calls.filter(
      (c) => c[0] === 'field_events' && (c[1] as { event_type: string }).event_type === 'ACTION_ITEM_CLOSED_AUTO',
    );
    expect(closedEmits).toHaveLength(2);
  });

  it('skips with no-rule-match when event type is unknown', async () => {
    const { dispatchSourceEvent } = await import('@/lib/pm/action-items/spine-subscriber');
    const result = await dispatchSourceEvent({
      eventType: 'TOTALLY_UNKNOWN_EVENT',
      entityKind: 'unknown',
      entityId: AI_SOURCE_RFI_ID,
      tenantId: AI_TENANT_ID,
      engagementId: AI_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: {},
      actorEmail: 'pm@kulaglass.com',
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no-rule-match');
    expect(aiInsertValuesSpy).not.toHaveBeenCalled();
  });

  it('never propagates errors back to the caller (silent skip on db failure)', async () => {
    // Simulate db failure by making the transaction itself throw.
    aiMockTransaction.mockImplementationOnce(() => { throw new Error('boom'); });
    const { dispatchSourceEvent } = await import('@/lib/pm/action-items/spine-subscriber');
    // RESOLVED triggers the auto-close path which goes through the tx.
    const result = await dispatchSourceEvent({
      eventType: 'RFI_STATE_CHANGED',
      entityKind: 'rfi',
      entityId: AI_SOURCE_RFI_ID,
      tenantId: AI_TENANT_ID,
      engagementId: AI_ENG_ID,
      kid: 'PRJ-26-0001',
      isTestProject: false,
      metadata: { from_state: 'ANSWERED', to_state: 'RESOLVED' },
      actorEmail: 'pm@kulaglass.com',
    });
    // Function must not throw — skipped: true with the captured reason.
    expect(result.skipped).toBe(true);
  });
});
