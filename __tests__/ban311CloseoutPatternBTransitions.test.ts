/**
 * BAN-311 Pass 3b.2 PR 1 — Closeout Pattern B transition tests.
 *
 * Three entities:
 *   - project_lifecycle (event-sourced via project_lifecycle_states log;
 *     specialized route, not the generic executor)
 *   - punch_list_items (column UPDATE via executor)
 *   - warranties (column UPDATE via executor)
 *
 * Mocks db + helpers same shape as ban309AiaExecutorAndRoutes.test.ts.
 */

const fakeLookupRows: Record<string, Array<Record<string, unknown>>> = {
  engagement: [],
  punch: [],
  warranty: [],
  currentLifecycle: [],
};
let currentLookupKey: keyof typeof fakeLookupRows = 'engagement';

let inTxExistingRow: Record<string, unknown> | null = null;
let txInsertReturning: Array<Record<string, unknown>> = [{ event_id: 'evt-test' }];
let txInsertShouldThrow: Error | null = null;

const updateSetSpy = jest.fn();
const insertValuesSpy = jest.fn();
const txInsertReturningQueue: Record<string, Array<Record<string, unknown>>> = {};

function makeFakeTx() {
  const insert = jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      const label = tableHandle._label ?? 'unknown';
      insertValuesSpy(label, vals);
      return {
        returning: async () => {
          if (txInsertShouldThrow) throw txInsertShouldThrow;
          if (label === 'field_events') return txInsertReturning;
          return txInsertReturningQueue[label] ?? [];
        },
      };
    },
  }));

  const updateWhere = jest.fn(async () => undefined);
  const updateSet = jest.fn((vals: Record<string, unknown>) => {
    updateSetSpy(vals);
    return { where: updateWhere };
  });
  const update = jest.fn(() => ({ set: updateSet }));

  // For the generic executor, in-tx select returns the existing row.
  const selectLimit = jest.fn(async () => (inTxExistingRow ? [inTxExistingRow] : []));
  const selectWhere = jest.fn(() => ({ limit: selectLimit }));
  const selectFrom = jest.fn(() => ({ where: selectWhere }));
  const select = jest.fn(() => ({ from: selectFrom }));

  return { insert, update, select };
}

const mockTransaction = jest.fn(async (cb: (tx: ReturnType<typeof makeFakeTx>) => Promise<unknown>) => {
  return cb(makeFakeTx());
});

// Sequential queue for outside-tx db.select() calls. Each route's lookup
// pulls one entry. Falls back to fakeLookupRows[currentLookupKey] for the
// simpler single-lookup routes (warranty/punch).
const selectResultQueue: Array<Array<Record<string, unknown>>> = [];

const mockDb = {
  transaction: (cb: never) => mockTransaction(cb),
  select: jest.fn(() => {
    const limit = jest.fn(async () => {
      if (selectResultQueue.length > 0) {
        return selectResultQueue.shift()!;
      }
      return fakeLookupRows[currentLookupKey] ?? [];
    });
    const where = jest.fn(() => ({ limit }));
    const innerJoin = jest.fn(() => ({ where }));
    const from = jest.fn(() => ({ where, innerJoin }));
    return { from };
  }),
};

function tbl(label: string) {
  const cols = [
    'punch_item_id', 'warranty_id', 'engagement_id', 'tenant_id',
    'status', 'is_test_project', 'lifecycle_state_id', 'state',
    'entered_at', 'exited_at', 'reopen_reason', 'reopen_by', 'event_id',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  field_events: tbl('field_events'),
  punch_list_items: tbl('punch_list_items'),
  warranties: tbl('warranties'),
  engagements: tbl('engagements'),
  project_lifecycle_states: tbl('project_lifecycle_states'),
}));

const mockCheckPermission: jest.Mock<Promise<{ allowed: boolean; role: string; email: string | null }>, unknown[]> = jest.fn();
jest.mock('@/lib/permissions', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
}));

const mockBlockStagingMutation: jest.Mock<Response | null, unknown[]> = jest.fn(() => null);
jest.mock('@/lib/service-work-orders/postgres-read-guard', () => ({
  blockWOStagingPostgresReadOnlyMutation: (...args: unknown[]) =>
    mockBlockStagingMutation(...args),
}));

const mockIsPostgresWriteEnabled = jest.fn(() => true);
jest.mock('@/lib/env', () => ({
  getDefaultTenantId: () => TENANT_ID,
  isPostgresWriteEnabled: () => mockIsPostgresWriteEnabled(),
}));

import {
  PROJECT_LIFECYCLE_STATES,
  PROJECT_LIFECYCLE_ALLOWED_TRANSITIONS,
  PUNCH_LIST_ITEM_STATES,
  PUNCH_LIST_ITEM_ALLOWED_TRANSITIONS,
  WARRANTY_STATES,
  WARRANTY_ALLOWED_TRANSITIONS,
  CLOSEOUT_PATTERN_B_ENTITIES,
  validateCloseoutPatternBTransition,
  isProjectLifecycleReopen,
} from '@/lib/closeout/state-transitions';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const PUNCH_ID = '00000000-0000-4000-8000-000000000777';
const WARRANTY_ID = '00000000-0000-4000-8000-000000000888';
const LIFECYCLE_ROW_ID = '00000000-0000-4000-8000-000000000aaa';

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(fakeLookupRows) as (keyof typeof fakeLookupRows)[]) {
    fakeLookupRows[k] = [];
  }
  for (const k of Object.keys(txInsertReturningQueue)) delete txInsertReturningQueue[k];
  selectResultQueue.length = 0;
  inTxExistingRow = null;
  txInsertReturning = [{ event_id: 'evt-test' }];
  txInsertShouldThrow = null;
  currentLookupKey = 'engagement';
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'kai@kulaglass.com' });
  mockBlockStagingMutation.mockReturnValue(null);
  mockIsPostgresWriteEnabled.mockReturnValue(true);
});

// ─── State-machine inventory ────────────────────────────────────────────────

describe('BAN-311 PR 1 — Closeout Pattern B state-machine inventory', () => {
  it('project_lifecycle declares the 4 canonical states', () => {
    expect([...PROJECT_LIFECYCLE_STATES]).toEqual([
      'IN_CLOSEOUT', 'SUBSTANTIALLY_COMPLETE', 'FINAL_COMPLETE', 'ARCHIVED',
    ]);
  });
  it('punch_list_item declares the 7 canonical states', () => {
    expect([...PUNCH_LIST_ITEM_STATES]).toEqual([
      'NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED',
      'SIGNED_OFF', 'DISPUTED', 'DEFERRED_TO_WARRANTY',
    ]);
  });
  it('warranty declares the 3 canonical states', () => {
    expect([...WARRANTY_STATES]).toEqual(['ACTIVE', 'PARTIALLY_EXPIRED', 'EXPIRED']);
  });
  it('every state has a transitions entry pointing only to declared states', () => {
    const machines = [
      { states: PROJECT_LIFECYCLE_STATES, transitions: PROJECT_LIFECYCLE_ALLOWED_TRANSITIONS },
      { states: PUNCH_LIST_ITEM_STATES, transitions: PUNCH_LIST_ITEM_ALLOWED_TRANSITIONS },
      { states: WARRANTY_STATES, transitions: WARRANTY_ALLOWED_TRANSITIONS },
    ];
    for (const m of machines) {
      const set = new Set<string>(m.states);
      for (const [from, tos] of Object.entries(m.transitions)) {
        expect(set.has(from)).toBe(true);
        for (const to of tos as readonly string[]) {
          expect(set.has(to)).toBe(true);
          expect(to).not.toBe(from);
        }
      }
    }
  });
  it('PATTERN_B_ENTITIES wires the correct event_type for each entity', () => {
    expect(CLOSEOUT_PATTERN_B_ENTITIES.project_lifecycle.event_type).toBe('PROJECT_STATE_CHANGED');
    expect(CLOSEOUT_PATTERN_B_ENTITIES.punch_list_item.event_type).toBe('PUNCH_LIST_ITEM_STATE_CHANGED');
    expect(CLOSEOUT_PATTERN_B_ENTITIES.warranty.event_type).toBe('WARRANTY_STATE_CHANGED');
  });
  it('terminals declared', () => {
    expect(PUNCH_LIST_ITEM_ALLOWED_TRANSITIONS.SIGNED_OFF).toEqual([]);
    expect(PUNCH_LIST_ITEM_ALLOWED_TRANSITIONS.DEFERRED_TO_WARRANTY).toEqual([]);
    expect(WARRANTY_ALLOWED_TRANSITIONS.EXPIRED).toEqual([]);
  });
});

// ─── Validator outcomes ─────────────────────────────────────────────────────

describe('BAN-311 PR 1 — validateCloseoutPatternBTransition', () => {
  it('rejects UNKNOWN_FROM_STATE', () => {
    expect(validateCloseoutPatternBTransition('warranty', 'BOGUS', 'EXPIRED')).toMatchObject({
      ok: false, reason: 'UNKNOWN_FROM_STATE',
    });
  });
  it('rejects UNKNOWN_TO_STATE', () => {
    expect(validateCloseoutPatternBTransition('warranty', 'ACTIVE', 'BOGUS')).toMatchObject({
      ok: false, reason: 'UNKNOWN_TO_STATE',
    });
  });
  it('rejects NO_OP', () => {
    expect(validateCloseoutPatternBTransition('warranty', 'ACTIVE', 'ACTIVE')).toMatchObject({
      ok: false, reason: 'NO_OP',
    });
  });
  it('rejects TRANSITION_NOT_ALLOWED (EXPIRED → ACTIVE)', () => {
    expect(validateCloseoutPatternBTransition('warranty', 'EXPIRED', 'ACTIVE')).toMatchObject({
      ok: false, reason: 'TRANSITION_NOT_ALLOWED',
    });
  });
  it('accepts ACTIVE → EXPIRED', () => {
    expect(validateCloseoutPatternBTransition('warranty', 'ACTIVE', 'EXPIRED')).toEqual({ ok: true });
  });
  it('accepts NEW → ASSIGNED for punch list', () => {
    expect(validateCloseoutPatternBTransition('punch_list_item', 'NEW', 'ASSIGNED')).toEqual({ ok: true });
  });
  it('rejects SIGNED_OFF → IN_PROGRESS (terminal)', () => {
    expect(validateCloseoutPatternBTransition('punch_list_item', 'SIGNED_OFF', 'IN_PROGRESS')).toMatchObject({
      ok: false, reason: 'TRANSITION_NOT_ALLOWED',
    });
  });
  it('isProjectLifecycleReopen detects reopen edges', () => {
    expect(isProjectLifecycleReopen('FINAL_COMPLETE', 'IN_CLOSEOUT')).toBe(true);
    expect(isProjectLifecycleReopen('ARCHIVED', 'IN_CLOSEOUT')).toBe(true);
    expect(isProjectLifecycleReopen('IN_CLOSEOUT', 'SUBSTANTIALLY_COMPLETE')).toBe(false);
    expect(isProjectLifecycleReopen(null, 'IN_CLOSEOUT')).toBe(false);
  });
});

// ─── Executor (column-update entities) ──────────────────────────────────────

import { executeCloseoutPatternBTransition } from '@/lib/closeout/execute-state-transition';

describe('BAN-311 PR 1 — executeCloseoutPatternBTransition', () => {
  const baseInput = (overrides: Partial<Parameters<typeof executeCloseoutPatternBTransition>[0]> = {}) => ({
    entity: 'warranty' as const,
    table: { _label: 'warranties' } as never,
    pkColumn: { name: 'warranty_id' } as never,
    pkValue: WARRANTY_ID,
    tenantColumn: { name: 'tenant_id' } as never,
    tenantId: TENANT_ID,
    stateColumn: { name: 'status' } as never,
    toState: 'EXPIRED',
    actorEmail: 'kai@kulaglass.com',
    testData: false,
    engagementId: ENG_ID,
    ...overrides,
  });

  it('happy path emits WARRANTY_STATE_CHANGED with closeout_entity metadata', async () => {
    inTxExistingRow = { status: 'ACTIVE' };
    txInsertReturning = [{ event_id: 'evt-warranty' }];
    const result = await executeCloseoutPatternBTransition(baseInput({ toState: 'EXPIRED' }));
    expect(result).toEqual({
      ok: true,
      event_id: 'evt-warranty',
      from_state: 'ACTIVE',
      to_state: 'EXPIRED',
    });
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'EXPIRED' }));
    const inserted = insertValuesSpy.mock.calls.find(c => c[0] === 'field_events')![1];
    expect(inserted).toMatchObject({
      event_type: 'WARRANTY_STATE_CHANGED',
      entity_type: 'project',
      entity_id: ENG_ID,
    });
    expect(inserted.metadata).toMatchObject({
      from_state: 'ACTIVE',
      to_state: 'EXPIRED',
      closeout_entity_kind: 'warranty',
      closeout_entity_id: WARRANTY_ID,
      // aia_entity_kind is set inside the emit helper, not directly on the
      // metadata we pass in — it's appended by emitActivitySpineEvent.
    });
  });

  it('routes the right event_type per entity', async () => {
    inTxExistingRow = { status: 'NEW' };
    await executeCloseoutPatternBTransition(baseInput({
      entity: 'punch_list_item',
      table: { _label: 'punch_list_items' } as never,
      pkColumn: { name: 'punch_item_id' } as never,
      pkValue: PUNCH_ID,
      toState: 'ASSIGNED',
    }));
    const inserted = insertValuesSpy.mock.calls.find(c => c[0] === 'field_events')![1];
    expect(inserted.event_type).toBe('PUNCH_LIST_ITEM_STATE_CHANGED');
    expect(inserted.metadata.closeout_entity_kind).toBe('punch_list_item');
  });

  it('404 when row missing in tenant', async () => {
    inTxExistingRow = null;
    const result = await executeCloseoutPatternBTransition(baseInput());
    expect(result).toMatchObject({ ok: false, status: 404, code: 'NOT_FOUND' });
    expect(updateSetSpy).not.toHaveBeenCalled();
  });

  it('rejects illegal transition with 409 (no write)', async () => {
    inTxExistingRow = { status: 'EXPIRED' };
    const result = await executeCloseoutPatternBTransition(baseInput({ toState: 'ACTIVE' }));
    expect(result).toMatchObject({ ok: false, status: 409, code: 'TRANSITION_NOT_ALLOWED' });
    expect(updateSetSpy).not.toHaveBeenCalled();
  });

  it('propagates emit failure as 500', async () => {
    inTxExistingRow = { status: 'ACTIVE' };
    txInsertShouldThrow = new Error('boom');
    const result = await executeCloseoutPatternBTransition(baseInput({ toState: 'EXPIRED' }));
    expect(result).toMatchObject({ ok: false, status: 500 });
  });

  it('forwards test_data=true', async () => {
    inTxExistingRow = { status: 'ACTIVE' };
    await executeCloseoutPatternBTransition(baseInput({ testData: true, toState: 'EXPIRED' }));
    const inserted = insertValuesSpy.mock.calls.find(c => c[0] === 'field_events')![1];
    expect(inserted.test_data).toBe(true);
  });
});

// ─── Route gate matrix — punch_list_items ───────────────────────────────────

describe('POST /api/closeout/punch-list-items/[id]/transition', () => {
  type RouteModule = {
    POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  };
  let route: RouteModule;

  function makeRequest(body: unknown): Request {
    return new Request('https://example.test/api/closeout/punch-list-items/x/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  }
  function ctx(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/punch-list-items/[id]/transition/route') as RouteModule;
    currentLookupKey = 'punch';
    fakeLookupRows.punch = [
      { punch_item_id: PUNCH_ID, engagement_id: ENG_ID, is_test_project: false },
    ];
    inTxExistingRow = { status: 'NEW' };
  });

  it('403 when caller lacks project:edit', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: false, role: 'none', email: null });
    const res = await route.POST(makeRequest({ to_state: 'ASSIGNED' }), ctx(PUNCH_ID));
    expect(res.status).toBe(403);
  });

  it('503 when Postgres writes disabled', async () => {
    mockIsPostgresWriteEnabled.mockReturnValue(false);
    const res = await route.POST(makeRequest({ to_state: 'ASSIGNED' }), ctx(PUNCH_ID));
    expect(res.status).toBe(503);
  });

  it('400 when to_state missing', async () => {
    const res = await route.POST(makeRequest({}), ctx(PUNCH_ID));
    expect(res.status).toBe(400);
  });

  it('404 when punch row missing', async () => {
    fakeLookupRows.punch = [];
    const res = await route.POST(makeRequest({ to_state: 'ASSIGNED' }), ctx(PUNCH_ID));
    expect(res.status).toBe(404);
  });

  it('409 illegal transition (NEW → SIGNED_OFF)', async () => {
    const res = await route.POST(makeRequest({ to_state: 'SIGNED_OFF' }), ctx(PUNCH_ID));
    expect(res.status).toBe(409);
  });

  it('200 happy path', async () => {
    txInsertReturning = [{ event_id: 'evt-punch' }];
    const res = await route.POST(makeRequest({ to_state: 'ASSIGNED' }), ctx(PUNCH_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      punch_item_id: PUNCH_ID,
      from_state: 'NEW',
      to_state: 'ASSIGNED',
      event_id: 'evt-punch',
    });
  });
});

// ─── Route gate matrix — warranties ─────────────────────────────────────────

describe('POST /api/closeout/warranties/[id]/transition', () => {
  type RouteModule = {
    POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  };
  let route: RouteModule;

  function makeRequest(body: unknown): Request {
    return new Request('https://example.test/api/closeout/warranties/x/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  }
  function ctx(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/warranties/[id]/transition/route') as RouteModule;
    currentLookupKey = 'warranty';
    fakeLookupRows.warranty = [
      { warranty_id: WARRANTY_ID, engagement_id: ENG_ID, is_test_project: true },
    ];
    inTxExistingRow = { status: 'ACTIVE' };
  });

  it('200 happy path emits with test_data=true from engagement', async () => {
    txInsertReturning = [{ event_id: 'evt-warranty-route' }];
    const res = await route.POST(makeRequest({ to_state: 'EXPIRED' }), ctx(WARRANTY_ID));
    expect(res.status).toBe(200);
    const inserted = insertValuesSpy.mock.calls.find(c => c[0] === 'field_events')![1];
    expect(inserted.test_data).toBe(true);
    expect(inserted.event_type).toBe('WARRANTY_STATE_CHANGED');
  });

  it('409 illegal transition (EXPIRED → ACTIVE)', async () => {
    inTxExistingRow = { status: 'EXPIRED' };
    const res = await route.POST(makeRequest({ to_state: 'ACTIVE' }), ctx(WARRANTY_ID));
    expect(res.status).toBe(409);
  });

  it('404 when warranty missing', async () => {
    fakeLookupRows.warranty = [];
    const res = await route.POST(makeRequest({ to_state: 'EXPIRED' }), ctx(WARRANTY_ID));
    expect(res.status).toBe(404);
  });
});

// ─── Route gate matrix — engagement lifecycle ───────────────────────────────

describe('POST /api/closeout/engagements/[id]/lifecycle-transition', () => {
  type RouteModule = {
    POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  };
  let route: RouteModule;

  function makeRequest(body: unknown): Request {
    return new Request('https://example.test/api/closeout/engagements/x/lifecycle-transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  }
  function ctx(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  /**
   * The lifecycle route makes TWO outside-tx selects:
   *   1. engagements lookup
   *   2. project_lifecycle_states current open row
   * Push both rows into the shared queue; the route consumes them in order.
   */
  function stageLookups(engagement: Array<Record<string, unknown>>, currentLifecycle: Array<Record<string, unknown>>) {
    selectResultQueue.push(engagement, currentLifecycle);
  }

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/engagements/[id]/lifecycle-transition/route') as RouteModule;
  });

  it('400 when to_state missing', async () => {
    stageLookups([{ engagement_id: ENG_ID, is_test_project: false }], []);
    const res = await route.POST(makeRequest({}), ctx(ENG_ID));
    expect(res.status).toBe(400);
  });

  it('400 UNKNOWN_TO_STATE for invalid string', async () => {
    stageLookups([{ engagement_id: ENG_ID, is_test_project: false }], []);
    const res = await route.POST(makeRequest({ to_state: 'BOGUS' }), ctx(ENG_ID));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('UNKNOWN_TO_STATE');
  });

  it('404 engagement missing', async () => {
    stageLookups([], []);
    const res = await route.POST(makeRequest({ to_state: 'IN_CLOSEOUT' }), ctx(ENG_ID));
    expect(res.status).toBe(404);
  });

  it('409 INVALID_INITIAL_STATE when no prior row and to_state != IN_CLOSEOUT', async () => {
    stageLookups([{ engagement_id: ENG_ID, is_test_project: false }], []);
    const res = await route.POST(makeRequest({ to_state: 'FINAL_COMPLETE' }), ctx(ENG_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('INVALID_INITIAL_STATE');
  });

  it('initial entry → IN_CLOSEOUT happy path; inserts row + emits PROJECT_STATE_CHANGED', async () => {
    stageLookups([{ engagement_id: ENG_ID, is_test_project: false }], []);
    txInsertReturningQueue.project_lifecycle_states = [{ lifecycle_state_id: LIFECYCLE_ROW_ID }];
    txInsertReturning = [{ event_id: 'evt-lifecycle-1' }];
    const res = await route.POST(makeRequest({ to_state: 'IN_CLOSEOUT' }), ctx(ENG_ID));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.to_state).toBe('IN_CLOSEOUT');
    expect(j.from_state).toBeNull();
    expect(j.lifecycle_state_id).toBe(LIFECYCLE_ROW_ID);

    // No prior row → no UPDATE on project_lifecycle_states
    expect(updateSetSpy).not.toHaveBeenCalled();
    const lcInsert = insertValuesSpy.mock.calls.find(c => c[0] === 'project_lifecycle_states');
    expect(lcInsert).toBeTruthy();
    expect(lcInsert![1]).toMatchObject({ engagement_id: ENG_ID, state: 'IN_CLOSEOUT' });

    const evtInsert = insertValuesSpy.mock.calls.find(c => c[0] === 'field_events')![1];
    expect(evtInsert.event_type).toBe('PROJECT_STATE_CHANGED');
    expect(evtInsert.metadata.from_state).toBe('(none)');
    expect(evtInsert.metadata.to_state).toBe('IN_CLOSEOUT');
    expect(evtInsert.metadata.closeout_entity_kind).toBe('engagement');
  });

  it('400 REOPEN_PAIR_REQUIRED when transitioning back to IN_CLOSEOUT without reopen fields', async () => {
    stageLookups(
      [{ engagement_id: ENG_ID, is_test_project: false }],
      [{ lifecycle_state_id: LIFECYCLE_ROW_ID, state: 'FINAL_COMPLETE' }],
    );
    const res = await route.POST(makeRequest({ to_state: 'IN_CLOSEOUT' }), ctx(ENG_ID));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('REOPEN_PAIR_REQUIRED');
  });

  it('200 reopen happy path: closes prior row, inserts new IN_CLOSEOUT, emits with reopen metadata', async () => {
    stageLookups(
      [{ engagement_id: ENG_ID, is_test_project: false }],
      [{ lifecycle_state_id: LIFECYCLE_ROW_ID, state: 'FINAL_COMPLETE' }],
    );
    txInsertReturningQueue.project_lifecycle_states = [{ lifecycle_state_id: 'new-row' }];
    txInsertReturning = [{ event_id: 'evt-reopen' }];
    const USER = '00000000-0000-4000-8000-0000000000bb';
    const res = await route.POST(
      makeRequest({ to_state: 'IN_CLOSEOUT', reopen_reason: 'warranty callback', reopen_by: USER }),
      ctx(ENG_ID),
    );
    expect(res.status).toBe(200);
    // Prior row's exited_at was stamped
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({ exited_at: expect.any(Date) }));
    const lcInsert = insertValuesSpy.mock.calls.find(c => c[0] === 'project_lifecycle_states')![1];
    expect(lcInsert).toMatchObject({
      engagement_id: ENG_ID,
      state: 'IN_CLOSEOUT',
      reopen_reason: 'warranty callback',
      reopen_by: USER,
    });
    const evt = insertValuesSpy.mock.calls.find(c => c[0] === 'field_events')![1];
    expect(evt.metadata.reopen).toBe(true);
    expect(evt.metadata.reopen_reason).toBe('warranty callback');
    expect(evt.metadata.reopen_by).toBe(USER);
  });

  it('409 illegal transition (IN_CLOSEOUT → ARCHIVED)', async () => {
    stageLookups(
      [{ engagement_id: ENG_ID, is_test_project: false }],
      [{ lifecycle_state_id: LIFECYCLE_ROW_ID, state: 'IN_CLOSEOUT' }],
    );
    const res = await route.POST(makeRequest({ to_state: 'ARCHIVED' }), ctx(ENG_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('honours staging mutation guard (409)', async () => {
    stageLookups([{ engagement_id: ENG_ID, is_test_project: false }], []);
    mockBlockStagingMutation.mockReturnValue(
      new Response(JSON.stringify({ blocked: true }), { status: 409 }),
    );
    const res = await route.POST(makeRequest({ to_state: 'IN_CLOSEOUT' }), ctx(ENG_ID));
    expect(res.status).toBe(409);
  });
});
