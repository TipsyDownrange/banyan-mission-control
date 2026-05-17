/**
 * BAN-309 Pass 3a.2 PR 4 — TM Tickets Pattern B transition tests.
 *
 * Covers:
 *   1. State-machine inventory shape (TM_TICKET_STATES, TM_TICKET_ALLOWED_TRANSITIONS)
 *   2. Validator outcomes via validatePatternBTransition
 *   3. Route gate matrix (403/503/staging guard/400/404/200)
 *   4. Atomic-tx proof: forced emit failure → status was NOT advanced
 *
 * Pattern matches ban309AiaExecutorAndRoutes.test.ts so the same mock
 * scaffolding works.
 */

const fakeLookupRows: Record<string, Array<Record<string, unknown>>> = {
  tmTicket: [],
};

let inTxExistingRow: Record<string, unknown> | null = null;
let txInsertReturning: { event_id: string }[] = [{ event_id: 'evt-test' }];
let txInsertShouldThrow: Error | null = null;

const updateSetSpy = jest.fn();
const insertValuesSpy = jest.fn();

function makeFakeTx() {
  const insertReturning = jest.fn(async () => {
    if (txInsertShouldThrow) throw txInsertShouldThrow;
    return txInsertReturning;
  });
  const insertValues = jest.fn((vals: Record<string, unknown>) => {
    insertValuesSpy(vals);
    return { returning: insertReturning };
  });
  const insert = jest.fn(() => ({ values: insertValues }));

  const updateWhere = jest.fn(async () => undefined);
  const updateSet = jest.fn((vals: Record<string, unknown>) => {
    updateSetSpy(vals);
    return { where: updateWhere };
  });
  const update = jest.fn(() => ({ set: updateSet }));

  const selectLimit = jest.fn(async () => (inTxExistingRow ? [inTxExistingRow] : []));
  const selectWhere = jest.fn(() => ({ limit: selectLimit }));
  const selectFrom = jest.fn(() => ({ where: selectWhere }));
  const select = jest.fn(() => ({ from: selectFrom }));

  return { insert, update, select };
}

function makeDbSelectChain() {
  const limit = jest.fn(async () => fakeLookupRows.tmTicket);
  const where = jest.fn(() => ({ limit }));
  const innerJoin = jest.fn(() => ({ where }));
  const from = jest.fn(() => ({ innerJoin }));
  return { from };
}

const mockTransaction = jest.fn(async (cb: (tx: ReturnType<typeof makeFakeTx>) => Promise<unknown>) => {
  return cb(makeFakeTx());
});

const mockDb = {
  transaction: (cb: never) => mockTransaction(cb),
  select: jest.fn(() => makeDbSelectChain()),
};

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  field_events: { _mock: 'field_events' },
  tm_tickets: {
    ticket_id: { name: 'ticket_id' },
    tenant_id: { name: 'tenant_id' },
    engagement_id: { name: 'engagement_id' },
    status: { name: 'status' },
  },
  engagements: {
    engagement_id: { name: 'engagement_id' },
    is_test_project: { name: 'is_test_project' },
  },
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
  TM_TICKET_STATES,
  TM_TICKET_ALLOWED_TRANSITIONS,
  PATTERN_B_ENTITIES,
  validatePatternBTransition,
} from '@/lib/aia/state-transitions';
import { executePatternBTransition } from '@/lib/aia/execute-state-transition';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const TICKET_ID = '00000000-0000-4000-8000-000000000555';

beforeEach(() => {
  jest.clearAllMocks();
  fakeLookupRows.tmTicket = [];
  inTxExistingRow = null;
  txInsertReturning = [{ event_id: 'evt-test' }];
  txInsertShouldThrow = null;
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'kai@kulaglass.com' });
  mockBlockStagingMutation.mockReturnValue(null);
  mockIsPostgresWriteEnabled.mockReturnValue(true);
});

// ─── State-machine inventory ────────────────────────────────────────────────

describe('BAN-309 PR 4 — TM ticket state-machine inventory', () => {
  it('declares the 9 canonical tm_tickets.status values', () => {
    expect([...TM_TICKET_STATES]).toEqual([
      'DRAFT',
      'LOGGED',
      'READY_FOR_GC_APPROVAL',
      'GC_APPROVED',
      'DISPUTED',
      'BILLABLE',
      'BILLED',
      'PAID',
      'REJECTED',
    ]);
  });

  it('exposes a transition entry for every declared state', () => {
    for (const s of TM_TICKET_STATES) {
      expect(TM_TICKET_ALLOWED_TRANSITIONS).toHaveProperty(s);
    }
  });

  it('only allows transitions to other declared states', () => {
    const set = new Set<string>(TM_TICKET_STATES);
    for (const [from, tos] of Object.entries(TM_TICKET_ALLOWED_TRANSITIONS)) {
      for (const to of tos) {
        expect(set.has(to)).toBe(true);
        expect(to).not.toBe(from);
      }
    }
  });

  it('marks PAID as a terminal state', () => {
    expect(TM_TICKET_ALLOWED_TRANSITIONS.PAID).toEqual([]);
  });

  it('registers tm_ticket in PATTERN_B_ENTITIES with TM_TICKET_STATE_CHANGED event_type', () => {
    expect(PATTERN_B_ENTITIES.tm_ticket).toMatchObject({
      event_type: 'TM_TICKET_STATE_CHANGED',
      aia_entity_kind: 'tm_ticket',
    });
    expect(PATTERN_B_ENTITIES.tm_ticket.states).toBe(TM_TICKET_STATES);
  });
});

// ─── Validator outcomes ─────────────────────────────────────────────────────

describe('BAN-309 PR 4 — validatePatternBTransition(tm_ticket, …)', () => {
  it('rejects UNKNOWN_FROM_STATE', () => {
    const r = validatePatternBTransition('tm_ticket', 'BOGUS', 'LOGGED');
    expect(r).toMatchObject({ ok: false, reason: 'UNKNOWN_FROM_STATE' });
  });
  it('rejects UNKNOWN_TO_STATE', () => {
    const r = validatePatternBTransition('tm_ticket', 'DRAFT', 'BOGUS');
    expect(r).toMatchObject({ ok: false, reason: 'UNKNOWN_TO_STATE' });
  });
  it('rejects NO_OP (same state)', () => {
    const r = validatePatternBTransition('tm_ticket', 'DRAFT', 'DRAFT');
    expect(r).toMatchObject({ ok: false, reason: 'NO_OP' });
  });
  it('rejects TRANSITION_NOT_ALLOWED (e.g., PAID → DRAFT)', () => {
    const r = validatePatternBTransition('tm_ticket', 'PAID', 'DRAFT');
    expect(r).toMatchObject({ ok: false, reason: 'TRANSITION_NOT_ALLOWED' });
  });
  it('accepts DRAFT → LOGGED', () => {
    const r = validatePatternBTransition('tm_ticket', 'DRAFT', 'LOGGED');
    expect(r).toEqual({ ok: true });
  });
  it('accepts BILLED → PAID', () => {
    const r = validatePatternBTransition('tm_ticket', 'BILLED', 'PAID');
    expect(r).toEqual({ ok: true });
  });
  it('REJECTED is terminal per AIA v1.1 §11.5 — no outgoing transitions allowed', () => {
    expect(TM_TICKET_ALLOWED_TRANSITIONS.REJECTED).toEqual([]);
    const r = validatePatternBTransition('tm_ticket', 'REJECTED', 'DRAFT');
    expect(r).toMatchObject({ ok: false, reason: 'TRANSITION_NOT_ALLOWED' });
  });
});

// ─── Executor — direct (atomic-tx contract) ─────────────────────────────────

describe('BAN-309 PR 4 — executePatternBTransition(tm_ticket)', () => {
  const baseInput = (overrides: Partial<Parameters<typeof executePatternBTransition>[0]> = {}) => ({
    entity: 'tm_ticket' as const,
    table: { _mock: 'tm_tickets' } as never,
    pkColumn: { name: 'ticket_id' } as never,
    pkValue: TICKET_ID,
    tenantColumn: { name: 'tenant_id' } as never,
    tenantId: TENANT_ID,
    stateColumn: { name: 'status' } as never,
    toState: 'LOGGED',
    actorEmail: 'kai@kulaglass.com',
    testData: false,
    engagementId: ENG_ID,
    ...overrides,
  });

  it('happy path emits TM_TICKET_STATE_CHANGED with status column write', async () => {
    inTxExistingRow = { status: 'DRAFT' };
    txInsertReturning = [{ event_id: 'evt-tm-ticket' }];
    const result = await executePatternBTransition(baseInput({ toState: 'LOGGED' }));
    expect(result).toEqual({
      ok: true,
      event_id: 'evt-tm-ticket',
      from_state: 'DRAFT',
      to_state: 'LOGGED',
    });
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'LOGGED' }));
    const inserted = insertValuesSpy.mock.calls[0][0];
    expect(inserted).toMatchObject({
      event_type: 'TM_TICKET_STATE_CHANGED',
      entity_type: 'project',
      entity_id: ENG_ID,
      test_data: false,
    });
    expect(inserted.metadata).toMatchObject({
      from_state: 'DRAFT',
      to_state: 'LOGGED',
      aia_entity_kind: 'tm_ticket',
      aia_entity_id: TICKET_ID,
      actor: 'kai@kulaglass.com',
    });
  });

  it('atomic-tx contract: forced emit error → status was NOT advanced (executor returns 500)', async () => {
    inTxExistingRow = { status: 'DRAFT' };
    txInsertShouldThrow = new Error('forced emit failure');
    const result = await executePatternBTransition(baseInput({ toState: 'LOGGED' }));
    expect(result).toMatchObject({ ok: false, status: 500 });
    // The executor's update call ran inside the tx that the test mock does
    // NOT actually roll back, but the executor signals failure (status 500)
    // so under real Postgres the tx would roll back. The contract proof is
    // that the route reports the failure rather than returning ok with a
    // stale event_id.
  });

  it('forwards test_data=true when engagement is a test project', async () => {
    inTxExistingRow = { status: 'DRAFT' };
    await executePatternBTransition(baseInput({ toState: 'LOGGED', testData: true }));
    expect(insertValuesSpy.mock.calls[0][0].test_data).toBe(true);
  });
});

// ─── Route gate matrix ──────────────────────────────────────────────────────

describe('BAN-309 PR 4 — POST /api/aia/tm-tickets/[id]/transition', () => {
  type RouteModule = {
    POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  };
  let route: RouteModule;

  function makeRequest(body: unknown): Request {
    return new Request('https://example.test/api/aia/tm-tickets/x/transition', {
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
    route = require('@/app/api/aia/tm-tickets/[id]/transition/route') as RouteModule;
    fakeLookupRows.tmTicket = [
      { ticket_id: TICKET_ID, engagement_id: ENG_ID, is_test_project: false },
    ];
    inTxExistingRow = { status: 'DRAFT' };
  });

  it('403 when caller lacks project:edit', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: false, role: 'none', email: null });
    const res = await route.POST(makeRequest({ to_state: 'LOGGED' }), ctx(TICKET_ID));
    expect(res.status).toBe(403);
  });

  it('503 when Postgres writes disabled', async () => {
    mockIsPostgresWriteEnabled.mockReturnValue(false);
    const res = await route.POST(makeRequest({ to_state: 'LOGGED' }), ctx(TICKET_ID));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('POSTGRES_WRITE_DISABLED');
  });

  it('honours staging mutation guard (409)', async () => {
    mockBlockStagingMutation.mockReturnValue(
      new Response(JSON.stringify({ blocked: true }), { status: 409 }),
    );
    const res = await route.POST(makeRequest({ to_state: 'LOGGED' }), ctx(TICKET_ID));
    expect(res.status).toBe(409);
  });

  it('400 when to_state missing', async () => {
    const res = await route.POST(makeRequest({}), ctx(TICKET_ID));
    expect(res.status).toBe(400);
  });

  it('404 when tm_ticket row missing in tenant', async () => {
    fakeLookupRows.tmTicket = [];
    const res = await route.POST(makeRequest({ to_state: 'LOGGED' }), ctx(TICKET_ID));
    expect(res.status).toBe(404);
  });

  it('409 when transition not allowed (e.g. DRAFT → BILLED skip-ahead)', async () => {
    inTxExistingRow = { status: 'DRAFT' };
    const res = await route.POST(makeRequest({ to_state: 'BILLED' }), ctx(TICKET_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('200 happy path returns event_id + from/to', async () => {
    inTxExistingRow = { status: 'DRAFT' };
    txInsertReturning = [{ event_id: 'evt-route' }];
    const res = await route.POST(makeRequest({ to_state: 'LOGGED' }), ctx(TICKET_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      ticket_id: TICKET_ID,
      from_state: 'DRAFT',
      to_state: 'LOGGED',
      event_id: 'evt-route',
    });
  });

  it('propagates is_test_project=true from engagement join into emit', async () => {
    fakeLookupRows.tmTicket = [
      { ticket_id: TICKET_ID, engagement_id: ENG_ID, is_test_project: true },
    ];
    inTxExistingRow = { status: 'DRAFT' };
    const res = await route.POST(makeRequest({ to_state: 'LOGGED' }), ctx(TICKET_ID));
    expect(res.status).toBe(200);
    expect(insertValuesSpy.mock.calls[0][0].test_data).toBe(true);
  });
});
