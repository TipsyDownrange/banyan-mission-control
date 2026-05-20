/**
 * BAN-375 Closeout v1.1.1 — transition route WAIVED behavior.
 *
 * Verifies the extended transition route:
 *   - 400 WAIVED_REASON_REQUIRED when to_state=WAIVED without waived_reason
 *   - tx writes waived_reason to punch_list_items in the after-update hook
 *   - tx writes a punch_list_item_history row with action='waived'
 *   - state-transitions validator now accepts NEW → WAIVED
 *   - state-transitions validator rejects SIGNED_OFF → WAIVED (terminal start)
 */

export {};

import {
  validateCloseoutPatternBTransition,
  PUNCH_LIST_ITEM_STATES,
} from '@/lib/closeout/state-transitions';

describe('state-transitions validator with WAIVED', () => {
  it('PUNCH_LIST_ITEM_STATES now includes WAIVED', () => {
    expect(PUNCH_LIST_ITEM_STATES).toContain('WAIVED');
    expect(PUNCH_LIST_ITEM_STATES).toHaveLength(8);
  });

  it.each([
    ['NEW', 'WAIVED'],
    ['ASSIGNED', 'WAIVED'],
    ['IN_PROGRESS', 'WAIVED'],
    ['COMPLETED', 'WAIVED'],
    ['DISPUTED', 'WAIVED'],
  ])('allows non-terminal %s → WAIVED', (from, to) => {
    const result = validateCloseoutPatternBTransition('punch_list_item', from, to);
    expect(result.ok).toBe(true);
  });

  it('rejects SIGNED_OFF → WAIVED (terminal start has no outbound transitions)', () => {
    const result = validateCloseoutPatternBTransition('punch_list_item', 'SIGNED_OFF', 'WAIVED');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('TRANSITION_NOT_ALLOWED');
    }
  });

  it('rejects WAIVED → anything (WAIVED is terminal)', () => {
    const result = validateCloseoutPatternBTransition('punch_list_item', 'WAIVED', 'NEW');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('TRANSITION_NOT_ALLOWED');
    }
  });
});

// ─── Route-level WAIVED behavior ────────────────────────────────────────────

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const PUNCH_ID = '00000000-0000-4000-8000-000000000777';

const mockCheckPermission: jest.Mock<
  Promise<{ allowed: boolean; role: string; email: string | null }>,
  unknown[]
> = jest.fn();
jest.mock('@/lib/permissions', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
}));

const mockBlockStagingMutation: jest.Mock<Response | null, unknown[]> = jest.fn(() => null);
jest.mock('@/lib/service-work-orders/postgres-read-guard', () => ({
  blockWOStagingPostgresReadOnlyMutation: (...args: unknown[]) => mockBlockStagingMutation(...args),
}));

const mockIsPostgresWriteEnabled = jest.fn(() => true);
jest.mock('@/lib/env', () => ({
  getDefaultTenantId: () => TENANT_ID,
  isPostgresWriteEnabled: () => mockIsPostgresWriteEnabled(),
}));

const txInsertSpy = jest.fn();
const txUpdateSpy = jest.fn();
let inTxExistingRow: Record<string, unknown> | null = null;
let txExecuteResult: { rows: Array<Record<string, unknown>> } | null = null;
let lookupRows: Array<Record<string, unknown>> = [];

function makeFakeTx() {
  return {
    insert: jest.fn((tableHandle: { _label?: string }) => ({
      values: (vals: Record<string, unknown>) => {
        txInsertSpy(tableHandle._label, vals);
        return { returning: async () => [{ event_id: 'evt-test' }] };
      },
    })),
    update: jest.fn((tableHandle: { _label?: string }) => ({
      set: (vals: Record<string, unknown>) => {
        txUpdateSpy(tableHandle._label, vals);
        return { where: async () => undefined };
      },
    })),
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => (inTxExistingRow ? [inTxExistingRow] : [])),
        })),
      })),
    })),
    execute: jest.fn(async () => txExecuteResult ?? { rows: [] }),
  };
}

const mockTransaction = jest.fn(
  async (cb: (tx: ReturnType<typeof makeFakeTx>) => Promise<unknown>) => cb(makeFakeTx()),
);

const mockDb = {
  transaction: (cb: never) => mockTransaction(cb),
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      innerJoin: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => lookupRows),
        })),
      })),
      where: jest.fn(() => ({
        limit: jest.fn(async () => lookupRows),
      })),
    })),
  })),
};

jest.mock('@/db', () => {
  const tbl = (label: string) => new Proxy(
    { _label: label },
    { get: (target, prop) => (prop === '_label' ? label : { name: prop, table: target }) },
  );
  return {
    __esModule: true,
    db: mockDb,
    field_events: tbl('field_events'),
    punch_list_items: tbl('punch_list_items'),
    punch_list_item_history: tbl('punch_list_item_history'),
    engagements: tbl('engagements'),
  };
});

jest.mock('@/lib/pm/action-items/spine-subscriber', () => ({
  dispatchSourceEvent: jest.fn(async () => undefined),
  resolveEngagementContext: jest.fn(async () => ({ kid: 'PRJ-26-0001' })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  inTxExistingRow = null;
  txExecuteResult = null;
  lookupRows = [];
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'pm@kulaglass.com' });
  mockBlockStagingMutation.mockReturnValue(null);
  mockIsPostgresWriteEnabled.mockReturnValue(true);
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const route = require('@/app/api/closeout/punch-list-items/[id]/transition/route') as {
  POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
};

function ctxFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postReq(body: unknown): Request {
  return new Request('https://example.test/api/closeout/punch-list-items/x/transition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('transition route — WAIVED requires waived_reason', () => {
  it('returns 400 WAIVED_REASON_REQUIRED when to_state=WAIVED and no waived_reason', async () => {
    const res = await route.POST(postReq({ to_state: 'WAIVED' }), ctxFor(PUNCH_ID));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.code).toBe('WAIVED_REASON_REQUIRED');
  });

  it('writes waived_reason update + history row when WAIVED with reason', async () => {
    lookupRows = [{ punch_item_id: PUNCH_ID, engagement_id: ENG_ID, is_test_project: false }];
    inTxExistingRow = { status: 'IN_PROGRESS' };
    txExecuteResult = { rows: [{ total: 5, non_terminal: 1 }] };

    const res = await route.POST(
      postReq({ to_state: 'WAIVED', waived_reason: 'GC clarified scope; remove' }),
      ctxFor(PUNCH_ID),
    );
    expect(res.status).toBe(200);

    // The generic executor sets status; our after-hook sets waived_reason.
    const waivedReasonUpdate = txUpdateSpy.mock.calls.find(([label, vals]) =>
      label === 'punch_list_items' && (vals as Record<string, unknown>).waived_reason !== undefined,
    );
    expect(waivedReasonUpdate).toBeDefined();
    expect((waivedReasonUpdate as [string, Record<string, unknown>])[1].waived_reason)
      .toBe('GC clarified scope; remove');

    // History row landed with action='waived' + the captured reason.
    const historyInsert = txInsertSpy.mock.calls.find(
      ([label, vals]) =>
        label === 'punch_list_item_history' && (vals as Record<string, unknown>).action === 'waived',
    );
    expect(historyInsert).toBeDefined();
    expect((historyInsert as [string, Record<string, unknown>])[1]).toMatchObject({
      punch_item_id: PUNCH_ID,
      action: 'waived',
      previous_status: 'IN_PROGRESS',
      new_status: 'WAIVED',
      note: 'GC clarified scope; remove',
    });
  });

  it('writes a history row for non-WAIVED transitions too (action=completed)', async () => {
    lookupRows = [{ punch_item_id: PUNCH_ID, engagement_id: ENG_ID, is_test_project: false }];
    inTxExistingRow = { status: 'IN_PROGRESS' };
    txExecuteResult = { rows: [{ total: 5, non_terminal: 1 }] };

    const res = await route.POST(postReq({ to_state: 'COMPLETED' }), ctxFor(PUNCH_ID));
    expect(res.status).toBe(200);

    const historyInsert = txInsertSpy.mock.calls.find(
      ([label, vals]) =>
        label === 'punch_list_item_history' && (vals as Record<string, unknown>).action === 'completed',
    );
    expect(historyInsert).toBeDefined();
    expect((historyInsert as [string, Record<string, unknown>])[1]).toMatchObject({
      action: 'completed',
      previous_status: 'IN_PROGRESS',
      new_status: 'COMPLETED',
    });
  });
});
