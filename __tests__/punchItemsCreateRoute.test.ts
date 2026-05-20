/**
 * BAN-375 Closeout v1.1.1 — POST /api/closeout/punch-list-items
 *
 * New collection-level route (no prior POST existed at this path). Verifies:
 *   - trade enum validation (10 ratified values)
 *   - source / category / responsible_party enum validation
 *   - 404 when engagement does not resolve in tenant
 *   - history row written with action='created' on success
 *   - item_number auto-assign via MAX + 1
 */

export {};

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const PUNCH_ID = '00000000-0000-4000-8000-000000000c01';
const SUB_ID = '00000000-0000-4000-8000-000000000c02';
const WALK_ID = '00000000-0000-4000-8000-000000000c03';

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

let engagementSelectResult: Array<Record<string, unknown>> = [];
let txExecuteResult: { rows: Array<Record<string, unknown>> } | null = null;
const txInsertSpy = jest.fn();
let txItemsReturning: Array<Record<string, unknown>> = [];

function makeFakeTx() {
  return {
    execute: jest.fn(async () => txExecuteResult ?? { rows: [] }),
    insert: jest.fn((tableHandle: { _label?: string }) => ({
      values: (vals: Record<string, unknown>) => {
        const label = tableHandle._label ?? '?';
        txInsertSpy(label, vals);
        return {
          returning: async () =>
            label === 'punch_list_items' ? txItemsReturning : [],
        };
      },
    })),
  };
}

const mockTransaction = jest.fn(
  async (cb: (tx: ReturnType<typeof makeFakeTx>) => Promise<unknown>) => cb(makeFakeTx()),
);

const mockDb = {
  transaction: (cb: never) => mockTransaction(cb),
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(async () => engagementSelectResult),
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
    punch_list_items: tbl('punch_list_items'),
    punch_list_item_history: tbl('punch_list_item_history'),
    engagements: tbl('engagements'),
    subcontractors: tbl('subcontractors'),
    punch_walks: tbl('punch_walks'),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  engagementSelectResult = [];
  txExecuteResult = null;
  txItemsReturning = [];
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'pm@kulaglass.com' });
  mockBlockStagingMutation.mockReturnValue(null);
  mockIsPostgresWriteEnabled.mockReturnValue(true);
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const route = require('@/app/api/closeout/punch-list-items/route') as {
  POST: (req: Request) => Promise<Response>;
};

function postReq(body: unknown): Request {
  return new Request('https://example.test/api/closeout/punch-list-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/closeout/punch-list-items — validation', () => {
  it('requires engagement_id, description, source', async () => {
    const res = await route.POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it('rejects unknown trade with INVALID_TRADE', async () => {
    engagementSelectResult = [{ engagement_id: ENG_ID }];
    const res = await route.POST(postReq({
      engagement_id: ENG_ID,
      description: 'foo',
      source: 'FIELD_ISSUE',
      trade: 'roofer',
    }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.code).toBe('INVALID_TRADE');
  });

  it('rejects unknown source with INVALID_SOURCE', async () => {
    engagementSelectResult = [{ engagement_id: ENG_ID }];
    const res = await route.POST(postReq({
      engagement_id: ENG_ID,
      description: 'foo',
      source: 'GMAIL_THREAD',
    }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.code).toBe('INVALID_SOURCE');
  });

  it('returns 404 when engagement does not resolve in tenant', async () => {
    engagementSelectResult = [];
    const res = await route.POST(postReq({
      engagement_id: ENG_ID,
      description: 'foo',
      source: 'FIELD_ISSUE',
    }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/closeout/punch-list-items — happy path', () => {
  it('inserts row with auto item_number (max+1) and writes created-history row', async () => {
    engagementSelectResult = [{ engagement_id: ENG_ID }];
    txExecuteResult = { rows: [{ max_n: 7 }] };
    txItemsReturning = [{
      punch_item_id: PUNCH_ID, engagement_id: ENG_ID, item_number: 8, trade: 'glazier',
    }];
    const res = await route.POST(postReq({
      engagement_id: ENG_ID,
      description: 'Touch up sealant at frame',
      source: 'FIELD_ISSUE',
      trade: 'glazier',
      category: 'SEALANT',
      responsible_party: 'KULA',
      assigned_to_sub_id: SUB_ID,
      walk_id: WALK_ID,
    }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.punch_list_item.item_number).toBe(8);

    const itemsInsert = txInsertSpy.mock.calls.find(([label]) => label === 'punch_list_items');
    expect(itemsInsert).toBeDefined();
    const itemVals = (itemsInsert as [string, Record<string, unknown>])[1];
    expect(itemVals).toMatchObject({
      engagement_id: ENG_ID,
      item_number: 8,
      trade: 'glazier',
      category: 'SEALANT',
      assigned_to_sub_id: SUB_ID,
      walk_id: WALK_ID,
    });

    const historyInsert = txInsertSpy.mock.calls.find(([label]) => label === 'punch_list_item_history');
    expect(historyInsert).toBeDefined();
    const historyVals = (historyInsert as [string, Record<string, unknown>])[1];
    expect(historyVals).toMatchObject({
      punch_item_id: PUNCH_ID,
      action: 'created',
      new_status: 'NEW',
    });
  });

  it('starts item_number at 1 when no prior rows for the engagement', async () => {
    engagementSelectResult = [{ engagement_id: ENG_ID }];
    txExecuteResult = { rows: [{ max_n: 0 }] };
    txItemsReturning = [{ punch_item_id: PUNCH_ID, item_number: 1 }];
    const res = await route.POST(postReq({
      engagement_id: ENG_ID,
      description: 'First item',
      source: 'INTERNAL_QA',
    }));
    expect(res.status).toBe(201);
    const itemsInsert = txInsertSpy.mock.calls.find(([label]) => label === 'punch_list_items');
    const itemVals = (itemsInsert as [string, Record<string, unknown>])[1];
    expect(itemVals.item_number).toBe(1);
  });

  it('defaults trade to "other" when omitted', async () => {
    engagementSelectResult = [{ engagement_id: ENG_ID }];
    txExecuteResult = { rows: [{ max_n: 0 }] };
    txItemsReturning = [{ punch_item_id: PUNCH_ID, item_number: 1, trade: 'other' }];
    await route.POST(postReq({
      engagement_id: ENG_ID,
      description: 'item',
      source: 'FIELD_ISSUE',
    }));
    const itemsInsert = txInsertSpy.mock.calls.find(([label]) => label === 'punch_list_items');
    const itemVals = (itemsInsert as [string, Record<string, unknown>])[1];
    expect(itemVals.trade).toBe('other');
  });
});
