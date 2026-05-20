/**
 * BAN-375 Closeout v1.1.1 — DELETE /api/closeout/punch-list-items/[id]/hard
 *
 * Verifies:
 *   - business:admin permission gate (Sean delta 3 — hard delete is
 *     project_admin / business_admin only)
 *   - 404 on missing item
 *   - history row written with action='hard_deleted' BEFORE the SQL DELETE
 *   - the DELETE then fires against the same id + tenant
 */

export {};

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
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

let punchLookupResult: Array<Record<string, unknown>> = [];
const callOrder: string[] = [];
const txInsertSpy = jest.fn();
const txDeleteSpy = jest.fn();

function makeFakeTx() {
  return {
    insert: jest.fn((tableHandle: { _label?: string }) => ({
      values: (vals: Record<string, unknown>) => {
        callOrder.push(`insert:${tableHandle._label ?? '?'}`);
        txInsertSpy(tableHandle._label, vals);
        return { returning: async () => [] };
      },
    })),
    delete: jest.fn((tableHandle: { _label?: string }) => {
      return {
        where: async () => {
          callOrder.push(`delete:${tableHandle._label ?? '?'}`);
          txDeleteSpy(tableHandle._label);
        },
      };
    }),
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
        limit: jest.fn(async () => punchLookupResult),
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
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  punchLookupResult = [];
  callOrder.length = 0;
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'business_admin', email: 'admin@kulaglass.com' });
  mockBlockStagingMutation.mockReturnValue(null);
  mockIsPostgresWriteEnabled.mockReturnValue(true);
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const route = require('@/app/api/closeout/punch-list-items/[id]/hard/route') as {
  DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
};

function ctxFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function deleteReq(body?: unknown): Request {
  return new Request('https://example.test/api/closeout/punch-list-items/x/hard', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

describe('DELETE hard route — permission gate', () => {
  it('returns 403 when checkPermission denies business:admin', async () => {
    mockCheckPermission.mockResolvedValueOnce({ allowed: false, role: 'pm', email: 'pm@kulaglass.com' });
    const res = await route.DELETE(deleteReq(), ctxFor(PUNCH_ID));
    expect(res.status).toBe(403);
  });

  it('calls checkPermission with the business:admin permission', async () => {
    punchLookupResult = [{ punch_item_id: PUNCH_ID, status: 'NEW' }];
    await route.DELETE(deleteReq(), ctxFor(PUNCH_ID));
    expect(mockCheckPermission).toHaveBeenCalled();
    const args = mockCheckPermission.mock.calls[0];
    expect(args[1]).toBe('business:admin');
  });
});

describe('DELETE hard route — not found / not in tenant', () => {
  it('returns 404 when the item does not exist in tenant', async () => {
    punchLookupResult = [];
    const res = await route.DELETE(deleteReq(), ctxFor(PUNCH_ID));
    expect(res.status).toBe(404);
    expect(txInsertSpy).not.toHaveBeenCalled();
    expect(txDeleteSpy).not.toHaveBeenCalled();
  });
});

describe('DELETE hard route — history row + delete order', () => {
  it('writes history row to punch_list_item_history BEFORE deleting the parent', async () => {
    punchLookupResult = [{ punch_item_id: PUNCH_ID, status: 'IN_PROGRESS' }];
    const res = await route.DELETE(deleteReq({ reason: 'multi-trade pollution cleanup' }), ctxFor(PUNCH_ID));
    expect(res.status).toBe(200);
    expect(callOrder).toEqual([
      'insert:punch_list_item_history',
      'delete:punch_list_items',
    ]);
  });

  it('history row carries action=hard_deleted + previous_status + reason note', async () => {
    // Note format: `id=<uuid>; reason=<text>` so the forensic record carries
    // the original id even after ON DELETE SET NULL nulls out punch_item_id.
    punchLookupResult = [{ punch_item_id: PUNCH_ID, status: 'IN_PROGRESS' }];
    await route.DELETE(deleteReq({ reason: 'GC clarified scope' }), ctxFor(PUNCH_ID));
    expect(txInsertSpy).toHaveBeenCalledWith(
      'punch_list_item_history',
      expect.objectContaining({
        punch_item_id: PUNCH_ID,
        action: 'hard_deleted',
        previous_status: 'IN_PROGRESS',
        new_status: null,
        note: `id=${PUNCH_ID}; reason=GC clarified scope`,
      }),
    );
  });

  it('response shape includes previous_status + deleted:true', async () => {
    punchLookupResult = [{ punch_item_id: PUNCH_ID, status: 'COMPLETED' }];
    const res = await route.DELETE(deleteReq(), ctxFor(PUNCH_ID));
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.deleted).toBe(true);
    expect(j.previous_status).toBe('COMPLETED');
    expect(j.punch_item_id).toBe(PUNCH_ID);
  });
});
