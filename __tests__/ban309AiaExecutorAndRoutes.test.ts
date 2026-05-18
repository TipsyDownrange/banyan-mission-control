/**
 * BAN-309 Pass 3a.2 — integration tests for the Pattern B transition
 * executor + the 4 route handlers (pay-applications, sov-versions,
 * tm-authorizations, lien-waivers).
 *
 * The DB layer is mocked so the executor's transactional contract can be
 * inspected without requiring a real Postgres. The mocks model:
 *   - db.transaction(cb): invokes cb with a fake tx and returns whatever
 *     cb returns. If cb throws, the test's expectation surfaces the throw.
 *   - tx.insert(...).values(...).returning(): resolves with the event_id row.
 *   - tx.update(...).set(...).where(...): resolves to a write count stub.
 *   - db.select(...).from(...).innerJoin(...).where(...).limit(...): resolves
 *     to the pre-fetched lookup row used by each route to derive engagement_id
 *     and the engagements.is_test_project flag.
 */

const fakeLookupRows: Record<string, Array<Record<string, unknown>>> = {
  payApp: [],
  sov: [],
  tmAuth: [],
  lienWaiver: [],
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

function makeDbSelectChain(lookupKey: keyof typeof fakeLookupRows) {
  const limit = jest.fn(async () => fakeLookupRows[lookupKey]);
  const where = jest.fn(() => ({ limit }));
  const innerJoin = jest.fn(() => ({ where }));
  const from = jest.fn(() => ({ innerJoin }));
  return { from };
}

const mockTransaction = jest.fn(async (cb: (tx: ReturnType<typeof makeFakeTx>) => Promise<unknown>) => {
  return cb(makeFakeTx());
});

let currentLookupKey: keyof typeof fakeLookupRows = 'payApp';

const mockDb = {
  transaction: (cb: never) => mockTransaction(cb),
  select: jest.fn(() => makeDbSelectChain(currentLookupKey)),
};

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  field_events: { _mock: 'field_events' },
  pay_applications: {
    pay_app_id: { name: 'pay_app_id' },
    tenant_id: { name: 'tenant_id' },
    engagement_id: { name: 'engagement_id' },
    state: { name: 'state' },
  },
  sov_versions: {
    sov_version_id: { name: 'sov_version_id' },
    tenant_id: { name: 'tenant_id' },
    engagement_id: { name: 'engagement_id' },
    state: { name: 'state' },
  },
  tm_authorizations: {
    tm_auth_id: { name: 'tm_auth_id' },
    tenant_id: { name: 'tenant_id' },
    engagement_id: { name: 'engagement_id' },
    status: { name: 'status' },
  },
  lien_waivers: {
    waiver_id: { name: 'waiver_id' },
    tenant_id: { name: 'tenant_id' },
    engagement_id: { name: 'engagement_id' },
    state: { name: 'state' },
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
  getDefaultTenantId: () => '00000000-0000-4000-8000-000000000001',
  isPostgresWriteEnabled: () => mockIsPostgresWriteEnabled(),
}));

import { executePatternBTransition } from '@/lib/aia/execute-state-transition';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENGAGEMENT_ID = '00000000-0000-4000-8000-000000000099';
const PAY_APP_ID = '00000000-0000-4000-8000-000000000111';
const SOV_VERSION_ID = '00000000-0000-4000-8000-000000000222';
const TM_AUTH_ID = '00000000-0000-4000-8000-000000000333';
const WAIVER_ID = '00000000-0000-4000-8000-000000000444';

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(fakeLookupRows) as (keyof typeof fakeLookupRows)[]) {
    fakeLookupRows[k] = [];
  }
  inTxExistingRow = null;
  txInsertReturning = [{ event_id: 'evt-test' }];
  txInsertShouldThrow = null;
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'kai@kulaglass.com' });
  mockBlockStagingMutation.mockReturnValue(null);
  mockIsPostgresWriteEnabled.mockReturnValue(true);
});

describe('BAN-309 Pass 3a.2 — executePatternBTransition', () => {
  const makeInput = (overrides: Partial<Parameters<typeof executePatternBTransition>[0]> = {}) => ({
    entity: 'pay_application' as const,
    table: { _mock: 'pay_applications' } as never,
    pkColumn: { name: 'pay_app_id' } as never,
    pkValue: PAY_APP_ID,
    tenantColumn: { name: 'tenant_id' } as never,
    tenantId: TENANT_ID,
    stateColumn: { name: 'state' } as never,
    toState: 'READY_FOR_NOTARIZATION',
    actorEmail: 'kai@kulaglass.com',
    testData: false,
    engagementId: ENGAGEMENT_ID,
    ...overrides,
  });

  it('returns 404 when the row is not in the tenant', async () => {
    inTxExistingRow = null;
    const result = await executePatternBTransition(makeInput());
    expect(result).toMatchObject({ ok: false, status: 404, code: 'NOT_FOUND' });
    expect(updateSetSpy).not.toHaveBeenCalled();
    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

  it('rejects an illegal transition with 409 before any write', async () => {
    inTxExistingRow = { state: 'PAID_FULL' };
    const result = await executePatternBTransition(
      makeInput({ toState: 'GC_APPROVED' }),
    );
    expect(result).toMatchObject({ ok: false, status: 409, code: 'TRANSITION_NOT_ALLOWED' });
    expect(updateSetSpy).not.toHaveBeenCalled();
    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

  it('rejects an unknown to_state with 400', async () => {
    inTxExistingRow = { state: 'PENDING_DRAFT' };
    const result = await executePatternBTransition(
      makeInput({ toState: 'NOT_A_STATE' }),
    );
    expect(result).toMatchObject({ ok: false, status: 400, code: 'UNKNOWN_TO_STATE' });
  });

  it('happy path — updates state column and emits field_events row in same tx', async () => {
    inTxExistingRow = { state: 'PENDING_DRAFT' };
    txInsertReturning = [{ event_id: 'evt-happy' }];

    const result = await executePatternBTransition(
      makeInput({ toState: 'READY_FOR_NOTARIZATION', reason: 'estimator ready' }),
    );

    expect(result).toEqual({
      ok: true,
      event_id: 'evt-happy',
      from_state: 'PENDING_DRAFT',
      to_state: 'READY_FOR_NOTARIZATION',
    });

    expect(updateSetSpy).toHaveBeenCalledTimes(1);
    expect(updateSetSpy.mock.calls[0][0]).toMatchObject({
      state: 'READY_FOR_NOTARIZATION',
    });

    expect(insertValuesSpy).toHaveBeenCalledTimes(1);
    const insertedValues = insertValuesSpy.mock.calls[0][0];
    expect(insertedValues).toMatchObject({
      event_type: 'PAY_APP_STATE_CHANGED',
      entity_type: 'project',
      entity_id: ENGAGEMENT_ID,
      test_data: false,
    });
    expect(insertedValues.metadata).toMatchObject({
      from_state: 'PENDING_DRAFT',
      to_state: 'READY_FOR_NOTARIZATION',
      entity_kind: 'pay_application',
      entity_id: PAY_APP_ID,
      actor: 'kai@kulaglass.com',
      reason: 'estimator ready',
    });
  });

  it('propagates an emit failure as 500 + INSERT_FAILED', async () => {
    inTxExistingRow = { state: 'PENDING_DRAFT' };
    txInsertShouldThrow = new Error('pg unique violation');
    const result = await executePatternBTransition(
      makeInput({ toState: 'READY_FOR_NOTARIZATION' }),
    );
    expect(result).toMatchObject({ ok: false, status: 500, code: 'INSERT_FAILED' });
  });

  it('emits with test_data=true when the parent engagement is a test project', async () => {
    inTxExistingRow = { state: 'PENDING_DRAFT' };
    await executePatternBTransition(
      makeInput({ testData: true, toState: 'READY_FOR_NOTARIZATION' }),
    );
    expect(insertValuesSpy.mock.calls[0][0].test_data).toBe(true);
  });

  it('routes the right event_type for each Pattern B entity', async () => {
    inTxExistingRow = { state: 'NONE' };
    await executePatternBTransition(
      makeInput({ entity: 'sov_version', toState: 'DRAFT_AUTOGENERATED' }),
    );
    expect(insertValuesSpy.mock.calls[0][0].event_type).toBe('SOV_STATE_CHANGED');

    insertValuesSpy.mockClear();
    inTxExistingRow = { status: 'ACTIVE' };
    await executePatternBTransition(
      makeInput({
        entity: 'tm_authorization',
        stateColumn: { name: 'status' } as never,
        toState: 'CLOSED',
      }),
    );
    expect(insertValuesSpy.mock.calls[0][0].event_type).toBe('TM_AUTHORIZATION_STATE_CHANGED');

    insertValuesSpy.mockClear();
    inTxExistingRow = { state: 'PENDING' };
    await executePatternBTransition(
      makeInput({ entity: 'lien_waiver', toState: 'NOTARIZED' }),
    );
    expect(insertValuesSpy.mock.calls[0][0].event_type).toBe('LIEN_WAIVER_STATE_CHANGED');
  });
});

describe('BAN-309 Pass 3a.2 — AIA transition route handlers (gates)', () => {
  type RouteModule = {
    POST: (
      req: Request,
      ctx: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  };

  function makeRequest(body: unknown): Request {
    return new Request('https://example.test/api/aia/test/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  }

  function ctx(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  const ROUTE_CASES = [
    {
      label: 'pay-applications',
      lookupKey: 'payApp' as const,
      modulePath: '@/app/api/aia/pay-applications/[id]/transition/route',
      pkId: PAY_APP_ID,
      pkField: 'pay_app_id',
      validFromState: 'PENDING_DRAFT',
      validToState: 'READY_FOR_NOTARIZATION',
    },
    {
      label: 'sov-versions',
      lookupKey: 'sov' as const,
      modulePath: '@/app/api/aia/sov-versions/[id]/transition/route',
      pkId: SOV_VERSION_ID,
      pkField: 'sov_version_id',
      validFromState: 'NONE',
      validToState: 'DRAFT_AUTOGENERATED',
    },
    {
      label: 'tm-authorizations',
      lookupKey: 'tmAuth' as const,
      modulePath: '@/app/api/aia/tm-authorizations/[id]/transition/route',
      pkId: TM_AUTH_ID,
      pkField: 'tm_auth_id',
      validFromState: 'ACTIVE',
      validToState: 'CLOSED',
    },
    {
      label: 'lien-waivers',
      lookupKey: 'lienWaiver' as const,
      modulePath: '@/app/api/aia/lien-waivers/[id]/transition/route',
      pkId: WAIVER_ID,
      pkField: 'waiver_id',
      validFromState: 'PENDING',
      validToState: 'NOTARIZED',
    },
  ];

  for (const c of ROUTE_CASES) {
    describe(`POST /api/aia/${c.label}/[id]/transition`, () => {
      let route: RouteModule;

      beforeEach(() => {
        currentLookupKey = c.lookupKey;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        route = require(c.modulePath) as RouteModule;
        fakeLookupRows[c.lookupKey] = [
          {
            [c.pkField]: c.pkId,
            engagement_id: ENGAGEMENT_ID,
            is_test_project: false,
          },
        ];
        // Set the in-tx row state to match the valid from_state for this entity
        inTxExistingRow =
          c.label === 'tm-authorizations'
            ? { status: c.validFromState }
            : { state: c.validFromState };
      });

      it('returns 403 when caller lacks project:edit', async () => {
        mockCheckPermission.mockResolvedValue({ allowed: false, role: 'none', email: null });
        const res = await route.POST(makeRequest({ to_state: c.validToState }), ctx(c.pkId));
        expect(res.status).toBe(403);
      });

      it('returns 503 when Postgres writes are disabled', async () => {
        mockIsPostgresWriteEnabled.mockReturnValue(false);
        const res = await route.POST(makeRequest({ to_state: c.validToState }), ctx(c.pkId));
        expect(res.status).toBe(503);
        const json = await res.json();
        expect(json.code).toBe('POSTGRES_WRITE_DISABLED');
      });

      it('honours the staging Postgres-read-only smoke guard', async () => {
        mockBlockStagingMutation.mockReturnValue(
          new Response(JSON.stringify({ blocked: true }), { status: 409 }),
        );
        const res = await route.POST(makeRequest({ to_state: c.validToState }), ctx(c.pkId));
        expect(res.status).toBe(409);
      });

      it('returns 400 when to_state is missing from the body', async () => {
        const res = await route.POST(makeRequest({}), ctx(c.pkId));
        expect(res.status).toBe(400);
      });

      it('returns 404 when the entity row is missing in the tenant', async () => {
        fakeLookupRows[c.lookupKey] = [];
        const res = await route.POST(makeRequest({ to_state: c.validToState }), ctx(c.pkId));
        expect(res.status).toBe(404);
      });

      it('happy path returns 200 with event_id, from_state, to_state', async () => {
        txInsertReturning = [{ event_id: `evt-${c.label}` }];
        const res = await route.POST(makeRequest({ to_state: c.validToState }), ctx(c.pkId));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toMatchObject({
          ok: true,
          from_state: c.validFromState,
          to_state: c.validToState,
          event_id: `evt-${c.label}`,
        });
      });
    });
  }
});
