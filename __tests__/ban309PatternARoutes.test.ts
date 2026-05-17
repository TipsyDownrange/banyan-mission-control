/**
 * BAN-309 Pass 3a.2 PR 2 — integration tests for the 6 Pattern A emission
 * routes + 1 TPA Pattern B flip on engagements.
 *
 * DB layer is mocked: db.select returns staged lookup rows;
 * db.transaction runs the callback against a fake tx that records every
 * tx.insert / tx.update / emit. txEmitShouldThrow lets a test force an
 * ActivitySpineEmitError so we can assert the route returns 500 and would
 * roll back the entity write under real Postgres.
 */

import { ActivitySpineEmitError } from '@/lib/activity-spine/emit';

const lookupRowsByLabel: Record<string, Array<Record<string, unknown>>> = {};

const updateSetSpy = jest.fn<unknown, [Record<string, unknown>]>();
const insertValuesSpy = jest.fn<unknown, [string, Record<string, unknown>]>();
const emitSpy = jest.fn<unknown, [Record<string, unknown>]>();

let txEmitShouldThrow: ActivitySpineEmitError | null = null;
let txInsertReturning: Record<string, Array<Record<string, unknown>>> = {};

function makeFakeTx() {
  const insertReturning = jest.fn(async () => []);

  const insert = jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      const tableLabel = tableHandle._label ?? 'unknown';
      insertValuesSpy(tableLabel, vals);
      return {
        returning: () => {
          const rows = txInsertReturning[tableLabel] ?? [];
          return Promise.resolve(rows);
        },
      };
    },
  }));

  const update = jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(vals);
      return { where: () => Promise.resolve() };
    },
  }));
  void insertReturning;

  return { insert, update };
}

let lookupKeyForNextSelect: string | null = null;

const mockTransaction = jest.fn(async (cb: (tx: ReturnType<typeof makeFakeTx>) => Promise<unknown>) => {
  return cb(makeFakeTx());
});

jest.mock('@/db', () => {
  const tbl = (label: string) => ({
    _label: label,
    // Provide column placeholders accessed by route code.
    pay_app_id: { name: 'pay_app_id' },
    engagement_id: { name: 'engagement_id' },
    notarization_required: { name: 'notarization_required' },
    tenant_id: { name: 'tenant_id' },
    holding_id: { name: 'holding_id' },
    released_at: { name: 'released_at' },
    amount_held: { name: 'amount_held' },
    tm_auth_id: { name: 'tm_auth_id' },
    status: { name: 'status' },
    converted_to_co_ref: { name: 'converted_to_co_ref' },
    sov_line_id: { name: 'sov_line_id' },
    sov_version_id: { name: 'sov_version_id' },
    description: { name: 'description' },
    cost_code: { name: 'cost_code' },
    scheduled_value: { name: 'scheduled_value' },
    retainage_pct: { name: 'retainage_pct' },
    state: { name: 'state' },
    is_test_project: { name: 'is_test_project' },
    test_project_created_by: { name: 'test_project_created_by' },
    validation_id: { name: 'validation_id' },
    validated_at: { name: 'validated_at' },
    reset_id: { name: 'reset_id' },
    reset_at: { name: 'reset_at' },
    session_id: { name: 'session_id' },
    completed_at: { name: 'completed_at' },
  });

  const select = jest.fn(() => {
    const limit = jest.fn(async () => {
      const key = lookupKeyForNextSelect ?? 'default';
      lookupKeyForNextSelect = null;
      return lookupRowsByLabel[key] ?? [];
    });
    const where = jest.fn(() => ({ limit }));
    const innerJoin = jest.fn(() => ({ where, innerJoin: () => ({ where }) }));
    const from = jest.fn(() => ({ where, innerJoin }));
    return { from };
  });

  return {
    __esModule: true,
    db: {
      transaction: (cb: never) => mockTransaction(cb),
      select,
    },
    field_events: tbl('field_events'),
    pay_applications: tbl('pay_applications'),
    notarization_sessions: tbl('notarization_sessions'),
    retainage_holdings: tbl('retainage_holdings'),
    tm_authorizations: tbl('tm_authorizations'),
    schedule_of_values: tbl('schedule_of_values'),
    sov_versions: tbl('sov_versions'),
    handoff_validations: tbl('handoff_validations'),
    test_project_resets: tbl('test_project_resets'),
    engagements: tbl('engagements'),
  };
});

// Replace the canonical emit helper with a spy that captures payload and can
// be forced to throw.
jest.mock('@/lib/activity-spine/emit', () => {
  const actual = jest.requireActual('@/lib/activity-spine/emit');
  return {
    ...actual,
    emitActivitySpineEvent: jest.fn(async (_tx: unknown, input: Record<string, unknown>) => {
      emitSpy(input);
      if (txEmitShouldThrow) throw txEmitShouldThrow;
      return { event_id: `evt-${(input.event_type as string).toLowerCase()}` };
    }),
  };
});

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

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-0000000000aa';
const PAY_APP_ID = '00000000-0000-4000-8000-0000000000bb';
const HOLDING_ID = '00000000-0000-4000-8000-0000000000cc';
const TM_AUTH_ID = '00000000-0000-4000-8000-0000000000dd';
const SOV_LINE_ID = '00000000-0000-4000-8000-0000000000ee';
const SOV_VERSION_ID = '00000000-0000-4000-8000-0000000000ff';
const USER_ID = '00000000-0000-4000-8000-000000000123';

function jsonRequest(body: unknown): Request {
  return new Request('https://example.test/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(lookupRowsByLabel)) delete lookupRowsByLabel[k];
  txEmitShouldThrow = null;
  txInsertReturning = {};
  lookupKeyForNextSelect = null;
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'kai@kulaglass.com' });
  mockBlockStagingMutation.mockReturnValue(null);
  mockIsPostgresWriteEnabled.mockReturnValue(true);
});

// ─── Shared gate suite (run once against one route as a representative) ─────

describe('BAN-309 PR 2 — shared API gate', () => {
  let route: { POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> };
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/aia/pay-applications/[id]/notarize/route');
    lookupKeyForNextSelect = 'payApp';
    lookupRowsByLabel.payApp = [
      { pay_app_id: PAY_APP_ID, engagement_id: ENG_ID, notarization_required: true, is_test_project: false },
    ];
    txInsertReturning.notarization_sessions = [
      { session_id: 'ns-1', completed_at: new Date('2026-05-17T00:00:00Z') },
    ];
  });

  it('403 when caller lacks project:edit', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: false, role: 'none', email: null });
    const res = await route.POST(jsonRequest({}), ctx(PAY_APP_ID));
    expect(res.status).toBe(403);
  });

  it('staging guard short-circuits before any DB call', async () => {
    mockBlockStagingMutation.mockReturnValue(
      new Response(JSON.stringify({ blocked: true }), { status: 409 }),
    );
    const res = await route.POST(jsonRequest({}), ctx(PAY_APP_ID));
    expect(res.status).toBe(409);
    expect(insertValuesSpy).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('503 when isPostgresWriteEnabled() is false', async () => {
    mockIsPostgresWriteEnabled.mockReturnValue(false);
    const res = await route.POST(jsonRequest({}), ctx(PAY_APP_ID));
    expect(res.status).toBe(503);
    const j = await res.json();
    expect(j.code).toBe('POSTGRES_WRITE_DISABLED');
  });
});

// ─── Pay app notarize ───────────────────────────────────────────────────────

describe('POST /api/aia/pay-applications/[id]/notarize — PAY_APP_NOTARIZED', () => {
  let route: { POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> };
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/aia/pay-applications/[id]/notarize/route');
    lookupKeyForNextSelect = 'payApp';
    txInsertReturning.notarization_sessions = [
      { session_id: 'ns-1', completed_at: new Date('2026-05-17T00:00:00Z') },
    ];
  });

  it('404 when pay app not in tenant', async () => {
    lookupRowsByLabel.payApp = [];
    const res = await route.POST(jsonRequest({}), ctx(PAY_APP_ID));
    expect(res.status).toBe(404);
  });

  it('409 when notarization is not required', async () => {
    lookupRowsByLabel.payApp = [{ pay_app_id: PAY_APP_ID, engagement_id: ENG_ID, notarization_required: false, is_test_project: false }];
    const res = await route.POST(jsonRequest({}), ctx(PAY_APP_ID));
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.code).toBe('NOTARIZATION_NOT_REQUIRED');
  });

  it('happy path: creates notarization_sessions row + emits PAY_APP_NOTARIZED', async () => {
    lookupRowsByLabel.payApp = [{ pay_app_id: PAY_APP_ID, engagement_id: ENG_ID, notarization_required: true, is_test_project: false }];
    const res = await route.POST(jsonRequest({ notary_name: 'Notary Bob' }), ctx(PAY_APP_ID));
    expect(res.status).toBe(200);
    expect(insertValuesSpy).toHaveBeenCalledWith('notarization_sessions', expect.objectContaining({
      target_kind: 'PAY_APP',
      state: 'COMPLETED',
      pay_app_id: PAY_APP_ID,
      notary_name: 'Notary Bob',
    }));
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy.mock.calls[0][0]).toMatchObject({
      event_type: 'PAY_APP_NOTARIZED',
      entity_type: 'project',
      entity_id: ENG_ID,
      aia_entity_kind: 'pay_application',
      aia_entity_id: PAY_APP_ID,
      test_data: false,
    });
    expect((emitSpy.mock.calls[0][0] as { metadata: Record<string, unknown> }).metadata).toMatchObject({
      notarization_session_id: 'ns-1',
      notary_name: 'Notary Bob',
    });
  });

  it('test_data flag propagates from parent engagement', async () => {
    lookupRowsByLabel.payApp = [{ pay_app_id: PAY_APP_ID, engagement_id: ENG_ID, notarization_required: true, is_test_project: true }];
    await route.POST(jsonRequest({}), ctx(PAY_APP_ID));
    expect((emitSpy.mock.calls[0][0] as { test_data: boolean }).test_data).toBe(true);
  });

  it('rolls back (500) when emit throws', async () => {
    lookupRowsByLabel.payApp = [{ pay_app_id: PAY_APP_ID, engagement_id: ENG_ID, notarization_required: true, is_test_project: false }];
    txEmitShouldThrow = new ActivitySpineEmitError('INSERT_FAILED', 'forced failure');
    const res = await route.POST(jsonRequest({}), ctx(PAY_APP_ID));
    expect(res.status).toBe(500);
    const j = await res.json();
    expect(j.code).toBe('INSERT_FAILED');
  });
});

// ─── Retainage release ──────────────────────────────────────────────────────

describe('POST /api/aia/retainage-holdings/[id]/release — RETAINAGE_RELEASED', () => {
  let route: { POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> };
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/aia/retainage-holdings/[id]/release/route');
  });

  function stageHolding(extra: Record<string, unknown> = {}) {
    lookupKeyForNextSelect = 'holding';
    lookupRowsByLabel.holding = [{
      holding_id: HOLDING_ID,
      engagement_id: ENG_ID,
      pay_app_id: PAY_APP_ID,
      amount_held: '1000.00',
      released_at: null,
      is_test_project: false,
      ...extra,
    }];
  }

  it('404 when holding not found', async () => {
    lookupRowsByLabel.holding = [];
    lookupKeyForNextSelect = 'holding';
    const res = await route.POST(jsonRequest({}), ctx(HOLDING_ID));
    expect(res.status).toBe(404);
  });

  it('409 when already released', async () => {
    stageHolding({ released_at: new Date() });
    const res = await route.POST(jsonRequest({}), ctx(HOLDING_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ALREADY_RELEASED');
  });

  it('happy path: stamps released_at + emits RETAINAGE_RELEASED', async () => {
    stageHolding();
    const res = await route.POST(jsonRequest({}), ctx(HOLDING_ID));
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      released_at: expect.any(Date),
      released_pay_app_id: null,
    }));
    expect(emitSpy.mock.calls[0][0]).toMatchObject({
      event_type: 'RETAINAGE_RELEASED',
      aia_entity_kind: 'retainage_holding',
      aia_entity_id: HOLDING_ID,
    });
    expect((emitSpy.mock.calls[0][0] as { metadata: Record<string, unknown> }).metadata).toMatchObject({
      retainage_holding_id: HOLDING_ID,
      amount_held: '1000.00',
      parent_pay_app_id: PAY_APP_ID,
    });
  });

  it('rolls back (500) when emit throws', async () => {
    stageHolding();
    txEmitShouldThrow = new ActivitySpineEmitError('INSERT_FAILED', 'boom');
    const res = await route.POST(jsonRequest({}), ctx(HOLDING_ID));
    expect(res.status).toBe(500);
  });
});

// ─── TM authorization convert-to-CO ─────────────────────────────────────────

describe('POST /api/aia/tm-authorizations/[id]/convert-to-co — TM_AUTHORIZATION_CONVERTED_TO_CO', () => {
  let route: { POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> };
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/aia/tm-authorizations/[id]/convert-to-co/route');
  });

  function stageAuth(extra: Record<string, unknown> = {}) {
    lookupKeyForNextSelect = 'auth';
    lookupRowsByLabel.auth = [{
      tm_auth_id: TM_AUTH_ID,
      engagement_id: ENG_ID,
      status: 'ACTIVE',
      converted_to_co_ref: null,
      is_test_project: false,
      ...extra,
    }];
  }

  it('400 when converted_to_co_ref missing', async () => {
    stageAuth();
    const res = await route.POST(jsonRequest({}), ctx(TM_AUTH_ID));
    expect(res.status).toBe(400);
  });

  it('404 when auth not found', async () => {
    lookupRowsByLabel.auth = [];
    lookupKeyForNextSelect = 'auth';
    const res = await route.POST(jsonRequest({ converted_to_co_ref: 'CO-2026-001' }), ctx(TM_AUTH_ID));
    expect(res.status).toBe(404);
  });

  it('409 when already converted', async () => {
    stageAuth({ status: 'CONVERTED_TO_CO' });
    const res = await route.POST(jsonRequest({ converted_to_co_ref: 'CO-2026-001' }), ctx(TM_AUTH_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ALREADY_CONVERTED');
  });

  it('409 when CLOSED (must be reopened via transition route)', async () => {
    stageAuth({ status: 'CLOSED' });
    const res = await route.POST(jsonRequest({ converted_to_co_ref: 'CO-2026-001' }), ctx(TM_AUTH_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('STATUS_NOT_CONVERTIBLE');
  });

  it('happy path: stamps converted_to_co_ref + status=CONVERTED_TO_CO + emits', async () => {
    stageAuth();
    const res = await route.POST(jsonRequest({ converted_to_co_ref: 'CO-2026-001' }), ctx(TM_AUTH_ID));
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      status: 'CONVERTED_TO_CO',
      converted_to_co_ref: 'CO-2026-001',
    }));
    expect(emitSpy.mock.calls[0][0]).toMatchObject({
      event_type: 'TM_AUTHORIZATION_CONVERTED_TO_CO',
      aia_entity_kind: 'tm_authorization',
      aia_entity_id: TM_AUTH_ID,
    });
    expect((emitSpy.mock.calls[0][0] as { metadata: Record<string, unknown> }).metadata).toMatchObject({
      converted_to_co_ref: 'CO-2026-001',
      previous_status: 'ACTIVE',
    });
  });

  it('allows convert from DISPUTED', async () => {
    stageAuth({ status: 'DISPUTED' });
    const res = await route.POST(jsonRequest({ converted_to_co_ref: 'CO-2026-001' }), ctx(TM_AUTH_ID));
    expect(res.status).toBe(200);
  });
});

// ─── SOV line PATCH (post-lock conditional emit) ────────────────────────────

describe('PATCH /api/aia/schedule-of-values/[id] — SOV_MODIFIED (conditional)', () => {
  let route: { PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> };
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/aia/schedule-of-values/[id]/route');
  });

  function patchRequest(body: unknown): Request {
    return new Request('https://example.test/api/aia/schedule-of-values/x', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function stageLine(parentState: string, extra: Record<string, unknown> = {}) {
    lookupKeyForNextSelect = 'sovLine';
    lookupRowsByLabel.sovLine = [{
      sov_line_id: SOV_LINE_ID,
      sov_version_id: SOV_VERSION_ID,
      engagement_id: ENG_ID,
      parent_state: parentState,
      is_test_project: false,
      description: 'Existing description',
      cost_code: 'CC-100',
      scheduled_value: '5000.00',
      retainage_pct: '5.00',
      ...extra,
    }];
  }

  it('400 when zero patchable fields provided', async () => {
    stageLine('LOCKED');
    const res = await route.PATCH(patchRequest({ line_number: 99 }), ctx(SOV_LINE_ID));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('NO_FIELD_PROVIDED');
  });

  it('400 when multiple patchable fields provided', async () => {
    stageLine('LOCKED');
    const res = await route.PATCH(patchRequest({ description: 'New', cost_code: 'CC-200' }), ctx(SOV_LINE_ID));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('MULTIPLE_FIELDS_PROVIDED');
  });

  it('404 when line not found', async () => {
    lookupRowsByLabel.sovLine = [];
    lookupKeyForNextSelect = 'sovLine';
    const res = await route.PATCH(patchRequest({ description: 'New' }), ctx(SOV_LINE_ID));
    expect(res.status).toBe(404);
  });

  it('409 when parent state is RETIRED', async () => {
    stageLine('RETIRED');
    const res = await route.PATCH(patchRequest({ description: 'New' }), ctx(SOV_LINE_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('PARENT_FROZEN');
  });

  it('pre-lock parent state (DRAFT_AUTOGENERATED) → UPDATE only, no emit', async () => {
    stageLine('DRAFT_AUTOGENERATED');
    const res = await route.PATCH(patchRequest({ scheduled_value: '7500' }), ctx(SOV_LINE_ID));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.emitted).toBe(false);
    expect(j.event_id).toBeNull();
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({ scheduled_value: '7500' }));
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('pre-lock parent state (APPROVED_INTERNAL) → UPDATE only, no emit', async () => {
    stageLine('APPROVED_INTERNAL');
    const res = await route.PATCH(patchRequest({ description: 'Tweak' }), ctx(SOV_LINE_ID));
    expect(res.status).toBe(200);
    expect((await res.json()).emitted).toBe(false);
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('post-lock parent state (LOCKED) → UPDATE + emit SOV_MODIFIED', async () => {
    stageLine('LOCKED');
    const res = await route.PATCH(patchRequest({ scheduled_value: '6000' }), ctx(SOV_LINE_ID));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.emitted).toBe(true);
    expect(j.event_id).toBeTruthy();
    expect(emitSpy.mock.calls[0][0]).toMatchObject({
      event_type: 'SOV_MODIFIED',
      aia_entity_kind: 'schedule_of_values',
      aia_entity_id: SOV_LINE_ID,
    });
    expect((emitSpy.mock.calls[0][0] as { metadata: Record<string, unknown> }).metadata).toMatchObject({
      sov_line_id: SOV_LINE_ID,
      parent_sov_version_id: SOV_VERSION_ID,
      parent_state: 'LOCKED',
      modified_column: 'scheduled_value',
      before_value: '5000.00',
      after_value: '6000',
    });
  });

  it('post-lock parent state (IN_RECONCILIATION) → UPDATE + emit', async () => {
    stageLine('IN_RECONCILIATION');
    const res = await route.PATCH(patchRequest({ description: 'Reconciled' }), ctx(SOV_LINE_ID));
    expect(res.status).toBe(200);
    expect((await res.json()).emitted).toBe(true);
    expect(emitSpy).toHaveBeenCalledTimes(1);
  });

  it('no-op (before=after) → 200 unchanged, no UPDATE, no emit', async () => {
    stageLine('LOCKED');
    const res = await route.PATCH(patchRequest({ description: 'Existing description' }), ctx(SOV_LINE_ID));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.unchanged).toBe(true);
    expect(updateSetSpy).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });
});

// ─── Handoff validations (conditional emit on success mode) ────────────────

describe('POST /api/aia/handoff-validations — HANDOFF_PROCESSED (conditional)', () => {
  let route: { POST: (req: Request) => Promise<Response> };
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/aia/handoff-validations/route');
    txInsertReturning.handoff_validations = [
      { validation_id: 'hv-1', validated_at: new Date('2026-05-17T00:00:00Z') },
    ];
  });

  function stageEngagement(isTest = false) {
    lookupKeyForNextSelect = 'engagement';
    lookupRowsByLabel.engagement = [{ engagement_id: ENG_ID, is_test_project: isTest }];
  }

  it('400 when engagement_id missing', async () => {
    const res = await route.POST(jsonRequest({ mode: 'ACCEPT' }));
    expect(res.status).toBe(400);
  });

  it('400 when mode is not in CHECK enum', async () => {
    stageEngagement();
    const res = await route.POST(jsonRequest({ engagement_id: ENG_ID, mode: 'INVALID' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_MODE');
  });

  it('404 when engagement not found', async () => {
    lookupRowsByLabel.engagement = [];
    lookupKeyForNextSelect = 'engagement';
    const res = await route.POST(jsonRequest({ engagement_id: ENG_ID, mode: 'ACCEPT' }));
    expect(res.status).toBe(404);
  });

  it('REJECT_NEEDS_FIX: row inserted, NO emit', async () => {
    stageEngagement();
    const res = await route.POST(jsonRequest({ engagement_id: ENG_ID, mode: 'REJECT_NEEDS_FIX' }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.emitted).toBe(false);
    expect(j.event_id).toBeNull();
    expect(insertValuesSpy).toHaveBeenCalledWith('handoff_validations', expect.objectContaining({ mode: 'REJECT_NEEDS_FIX' }));
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('ACCEPT: row inserted + HANDOFF_PROCESSED emitted', async () => {
    stageEngagement();
    const res = await route.POST(jsonRequest({ engagement_id: ENG_ID, mode: 'ACCEPT' }));
    expect(res.status).toBe(200);
    expect((await res.json()).emitted).toBe(true);
    expect(emitSpy.mock.calls[0][0]).toMatchObject({
      event_type: 'HANDOFF_PROCESSED',
      aia_entity_kind: 'handoff_validation',
      aia_entity_id: 'hv-1',
    });
    expect((emitSpy.mock.calls[0][0] as { metadata: Record<string, unknown> }).metadata).toMatchObject({
      handoff_validation_id: 'hv-1',
      mode: 'ACCEPT',
    });
  });

  it('ACCEPT_WITH_EXCEPTIONS: row inserted + emit', async () => {
    stageEngagement();
    const res = await route.POST(jsonRequest({ engagement_id: ENG_ID, mode: 'ACCEPT_WITH_EXCEPTIONS', exceptions: ['a'] }));
    expect(res.status).toBe(200);
    expect((await res.json()).emitted).toBe(true);
    expect(insertValuesSpy).toHaveBeenCalledWith('handoff_validations', expect.objectContaining({
      mode: 'ACCEPT_WITH_EXCEPTIONS',
      exceptions: ['a'],
    }));
  });
});

// ─── Test project resets ────────────────────────────────────────────────────

describe('POST /api/aia/test-project-resets — TEST_PROJECT_RESET', () => {
  let route: { POST: (req: Request) => Promise<Response> };
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/aia/test-project-resets/route');
    txInsertReturning.test_project_resets = [
      { reset_id: 'tpr-1', reset_at: new Date('2026-05-17T00:00:00Z') },
    ];
  });

  it('400 when engagement_id missing', async () => {
    const res = await route.POST(jsonRequest({ reset_by: USER_ID }));
    expect(res.status).toBe(400);
  });

  it('400 when reset_by missing', async () => {
    const res = await route.POST(jsonRequest({ engagement_id: ENG_ID }));
    expect(res.status).toBe(400);
  });

  it('409 when engagement is not a test project', async () => {
    lookupKeyForNextSelect = 'engagement';
    lookupRowsByLabel.engagement = [{ engagement_id: ENG_ID, is_test_project: false }];
    const res = await route.POST(jsonRequest({ engagement_id: ENG_ID, reset_by: USER_ID }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NOT_A_TEST_PROJECT');
  });

  it('happy path: inserts row + emits with test_data=true always', async () => {
    lookupKeyForNextSelect = 'engagement';
    lookupRowsByLabel.engagement = [{ engagement_id: ENG_ID, is_test_project: true }];
    const res = await route.POST(jsonRequest({
      engagement_id: ENG_ID,
      reset_by: USER_ID,
      reason: 'manual smoke',
      child_records_deleted: { pay_applications: 3 },
    }));
    expect(res.status).toBe(200);
    expect(insertValuesSpy).toHaveBeenCalledWith('test_project_resets', expect.objectContaining({
      engagement_id: ENG_ID,
      reset_by: USER_ID,
      reason: 'manual smoke',
    }));
    expect(emitSpy.mock.calls[0][0]).toMatchObject({
      event_type: 'TEST_PROJECT_RESET',
      test_data: true,
      aia_entity_kind: 'test_project_reset',
      aia_entity_id: 'tpr-1',
    });
  });
});

// ─── Engagements TPA flip ───────────────────────────────────────────────────

describe('PATCH /api/engagements/[id]/test-project-state — TEST_PROJECT_STATE_CHANGED', () => {
  let route: { PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> };
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/engagements/[id]/test-project-state/route');
  });

  function patchRequest(body: unknown): Request {
    return new Request('https://example.test/api/engagements/x/test-project-state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function stageEngagement(current: boolean, createdBy: string | null = null) {
    lookupKeyForNextSelect = 'engagement';
    lookupRowsByLabel.engagement = [{
      engagement_id: ENG_ID,
      is_test_project: current,
      test_project_created_by: createdBy,
    }];
  }

  it('400 when is_test_project missing or non-boolean', async () => {
    stageEngagement(false);
    const res = await route.PATCH(patchRequest({ foo: 'bar' }), ctx(ENG_ID));
    expect(res.status).toBe(400);
  });

  it('404 when engagement not found', async () => {
    lookupRowsByLabel.engagement = [];
    lookupKeyForNextSelect = 'engagement';
    const res = await route.PATCH(patchRequest({ is_test_project: true }), ctx(ENG_ID));
    expect(res.status).toBe(404);
  });

  it('idempotent: same value → 200 unchanged, no emit', async () => {
    stageEngagement(true, USER_ID);
    const res = await route.PATCH(patchRequest({ is_test_project: true }), ctx(ENG_ID));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.unchanged).toBe(true);
    expect(updateSetSpy).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('flip false → true requires test_project_created_by when missing', async () => {
    stageEngagement(false);
    const res = await route.PATCH(patchRequest({ is_test_project: true }), ctx(ENG_ID));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('TEST_PROJECT_CREATED_BY_REQUIRED');
  });

  it('flip false → true with test_project_created_by: emits with production→test_project', async () => {
    stageEngagement(false);
    const res = await route.PATCH(patchRequest({
      is_test_project: true,
      test_project_created_by: USER_ID,
    }), ctx(ENG_ID));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.from_state).toBe('production');
    expect(j.to_state).toBe('test_project');
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      is_test_project: true,
      test_project_created_by: USER_ID,
    }));
    expect(emitSpy.mock.calls[0][0]).toMatchObject({
      event_type: 'TEST_PROJECT_STATE_CHANGED',
      aia_entity_kind: 'engagement',
      aia_entity_id: ENG_ID,
      test_data: true,
    });
    expect((emitSpy.mock.calls[0][0] as { metadata: Record<string, unknown> }).metadata).toMatchObject({
      from_state: 'production',
      to_state: 'test_project',
    });
  });

  it('flip true → false: clears test_project_created_by, emits with test_project→production', async () => {
    stageEngagement(true, USER_ID);
    const res = await route.PATCH(patchRequest({ is_test_project: false }), ctx(ENG_ID));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.from_state).toBe('test_project');
    expect(j.to_state).toBe('production');
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      is_test_project: false,
      test_project_created_by: null,
    }));
    expect((emitSpy.mock.calls[0][0] as { test_data: boolean }).test_data).toBe(false);
  });

  it('rolls back (500) when emit throws', async () => {
    stageEngagement(false);
    txEmitShouldThrow = new ActivitySpineEmitError('INSERT_FAILED', 'forced');
    const res = await route.PATCH(patchRequest({
      is_test_project: true,
      test_project_created_by: USER_ID,
    }), ctx(ENG_ID));
    expect(res.status).toBe(500);
  });
});
