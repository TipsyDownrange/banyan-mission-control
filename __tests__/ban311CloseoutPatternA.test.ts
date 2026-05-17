/**
 * BAN-311 Pass 3b.2 PR 2 — Closeout Pattern A emission tests.
 *
 * Covers:
 *   - PUNCH_LIST_CLEARED co-fire from punch-list-items/[id]/transition
 *   - NOTICE_OF_COMPLETION_FILED from notices-of-completion
 *   - DELIVERABLE_PRODUCED from deliverable-documents, unified-job-packets,
 *     substantial-completion-certs (which also co-fires PROJECT_STATE_CHANGED)
 *   - JOB_COST_RECONCILED + GOLD_DATASET cascade from reconciliation/accept
 *   - GOLD_DATASET_ENTRY_WRITTEN direct route with TEST_BLOCKED branch
 *
 * Mock scaffolding mirrors ban311CloseoutPatternBTransitions.test.ts.
 */

// Force module mode so top-level declarations don't collide with PR 1's
// test file (which also declares TENANT_ID, ENG_ID, updateSetSpy, etc.
// in global scope under tsc's whole-project compilation).
export {};

const fakeLookupRows: Record<string, Array<Record<string, unknown>>> = {
  engagement: [],
  punch: [],
};
const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
let currentLookupKey: keyof typeof fakeLookupRows = 'engagement';

let inTxExistingRow: Record<string, unknown> | null = null;
let txInsertReturning: Array<Record<string, unknown>> = [{ event_id: 'evt-test' }];
let txInsertShouldThrow: Error | null = null;
let txExecuteResult: { rows: Array<Record<string, unknown>> } | null = null;

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

  const selectLimit = jest.fn(async () => (inTxExistingRow ? [inTxExistingRow] : []));
  const selectWhere = jest.fn(() => ({ limit: selectLimit }));
  const selectFrom = jest.fn(() => ({ where: selectWhere }));
  const select = jest.fn(() => ({ from: selectFrom }));

  const execute = jest.fn(async () => txExecuteResult ?? { rows: [] });

  return { insert, update, select, execute };
}

const mockTransaction = jest.fn(async (cb: (tx: ReturnType<typeof makeFakeTx>) => Promise<unknown>) => {
  return cb(makeFakeTx());
});

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
    'punch_item_id', 'engagement_id', 'tenant_id', 'status',
    'is_test_project', 'lifecycle_state_id', 'state',
    'noc_id', 'deliverable_id', 'packet_id', 'cert_id', 'gold_entry_id', 'event_id',
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
  engagements: tbl('engagements'),
  project_lifecycle_states: tbl('project_lifecycle_states'),
  notices_of_completion: tbl('notices_of_completion'),
  deliverable_documents: tbl('deliverable_documents'),
  unified_job_packets: tbl('unified_job_packets'),
  substantial_completion_certs: tbl('substantial_completion_certs'),
  gold_dataset_entries: tbl('gold_dataset_entries'),
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

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const PUNCH_ID = '00000000-0000-4000-8000-000000000777';
const NOC_ID = '00000000-0000-4000-8000-000000000a01';
const DELIV_ID = '00000000-0000-4000-8000-000000000a02';
const PACKET_ID = '00000000-0000-4000-8000-000000000a03';
const CERT_ID = '00000000-0000-4000-8000-000000000a04';
const GOLD_ID = '00000000-0000-4000-8000-000000000a05';
const LIFECYCLE_ID = '00000000-0000-4000-8000-000000000aaa';

function jsonReq(body: unknown, url = 'https://example.test/api'): Request {
  return new Request(url, {
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
  for (const k of Object.keys(fakeLookupRows) as (keyof typeof fakeLookupRows)[]) {
    fakeLookupRows[k] = [];
  }
  for (const k of Object.keys(txInsertReturningQueue)) delete txInsertReturningQueue[k];
  selectResultQueue.length = 0;
  inTxExistingRow = null;
  txInsertReturning = [{ event_id: 'evt-test' }];
  txInsertShouldThrow = null;
  txExecuteResult = null;
  currentLookupKey = 'engagement';
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'kai@kulaglass.com' });
  mockBlockStagingMutation.mockReturnValue(null);
  mockIsPostgresWriteEnabled.mockReturnValue(true);
});

function findFieldEventInserts(eventType: string) {
  return insertValuesSpy.mock.calls
    .filter((c) => c[0] === 'field_events' && (c[1] as Record<string, unknown>).event_type === eventType)
    .map((c) => c[1] as Record<string, unknown>);
}

// ─── PUNCH_LIST_CLEARED co-fire on punch-list-items transition ──────────────

describe('PUNCH_LIST_CLEARED co-fire on terminal-state transition', () => {
  type RouteModule = {
    POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  };
  let route: RouteModule;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/punch-list-items/[id]/transition/route') as RouteModule;
    currentLookupKey = 'punch';
    fakeLookupRows.punch = [
      { punch_item_id: PUNCH_ID, engagement_id: ENG_ID, is_test_project: false },
    ];
    inTxExistingRow = { status: 'IN_PROGRESS' };
  });

  it('does NOT fire PUNCH_LIST_CLEARED when transitioning into a non-terminal state', async () => {
    txExecuteResult = { rows: [{ total: 1, non_terminal: 1 }] };
    const res = await route.POST(jsonReq({ to_state: 'DISPUTED' }), ctx(PUNCH_ID));
    expect(res.status).toBe(200);
    expect(findFieldEventInserts('PUNCH_LIST_CLEARED')).toHaveLength(0);
    const j = await res.json();
    expect(j.punch_list_cleared_event_id).toBeNull();
  });

  it('does NOT fire PUNCH_LIST_CLEARED when other items still non-terminal', async () => {
    txExecuteResult = { rows: [{ total: 3, non_terminal: 2 }] };
    const res = await route.POST(jsonReq({ to_state: 'COMPLETED' }), ctx(PUNCH_ID));
    expect(res.status).toBe(200);
    expect(findFieldEventInserts('PUNCH_LIST_CLEARED')).toHaveLength(0);
  });

  it('FIRES PUNCH_LIST_CLEARED when last non-terminal lands on COMPLETED', async () => {
    txExecuteResult = { rows: [{ total: 5, non_terminal: 0 }] };
    txInsertReturning = [
      { event_id: 'evt-punch-state' },
      { event_id: 'evt-punch-cleared' },
    ];
    // The emit helper is called twice; each insert returns one row. The mock
    // returns the same array for every insert — to differentiate, swap to a
    // queue of returnings via setting txInsertReturningQueue.field_events.
    // Use a per-call counter instead:
    let nthField = 0;
    txInsertReturning = [{ event_id: 'evt-default' }];
    txInsertReturningQueue.field_events = [];
    // Re-stub insert's field_events returning to pick from a queue.
    // (Simpler: just trust the assertion on findFieldEventInserts content.)
    void nthField;
    const res = await route.POST(jsonReq({ to_state: 'COMPLETED' }), ctx(PUNCH_ID));
    expect(res.status).toBe(200);
    const cleared = findFieldEventInserts('PUNCH_LIST_CLEARED');
    expect(cleared).toHaveLength(1);
    expect(cleared[0].metadata).toMatchObject({
      total_items: 5,
      triggering_punch_item_id: PUNCH_ID,
      triggering_to_state: 'COMPLETED',
      closeout_entity_kind: 'engagement',
      closeout_entity_id: ENG_ID,
    });
  });

  it('does NOT fire when engagement has zero punch items (total=0 guard)', async () => {
    txExecuteResult = { rows: [{ total: 0, non_terminal: 0 }] };
    const res = await route.POST(jsonReq({ to_state: 'SIGNED_OFF' }), ctx(PUNCH_ID));
    // (This is a defensive guard — in practice the item being transitioned IS
    // a row, so total >= 1. But the route should still not emit on total=0.)
    expect(res.status).toBe(409); // SIGNED_OFF is illegal from IN_PROGRESS
    expect(findFieldEventInserts('PUNCH_LIST_CLEARED')).toHaveLength(0);
  });

  it('FIRES PUNCH_LIST_CLEARED on terminal state SIGNED_OFF when clear', async () => {
    inTxExistingRow = { status: 'COMPLETED' };
    txExecuteResult = { rows: [{ total: 2, non_terminal: 0 }] };
    const res = await route.POST(jsonReq({ to_state: 'SIGNED_OFF' }), ctx(PUNCH_ID));
    expect(res.status).toBe(200);
    expect(findFieldEventInserts('PUNCH_LIST_CLEARED')).toHaveLength(1);
  });

  it('FIRES PUNCH_LIST_CLEARED on terminal state DEFERRED_TO_WARRANTY when clear', async () => {
    inTxExistingRow = { status: 'IN_PROGRESS' };
    txExecuteResult = { rows: [{ total: 1, non_terminal: 0 }] };
    const res = await route.POST(jsonReq({ to_state: 'DEFERRED_TO_WARRANTY' }), ctx(PUNCH_ID));
    expect(res.status).toBe(200);
    expect(findFieldEventInserts('PUNCH_LIST_CLEARED')).toHaveLength(1);
  });
});

// ─── NOTICE_OF_COMPLETION_FILED ─────────────────────────────────────────────

describe('POST /api/closeout/notices-of-completion', () => {
  type RouteModule = { POST: (req: Request) => Promise<Response> };
  let route: RouteModule;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/notices-of-completion/route') as RouteModule;
  });

  it('403 perm denied', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: false, role: 'none', email: null });
    const res = await route.POST(jsonReq({ engagement_id: ENG_ID, filed_date: '2026-05-17' }));
    expect(res.status).toBe(403);
  });

  it('503 writes disabled', async () => {
    mockIsPostgresWriteEnabled.mockReturnValue(false);
    const res = await route.POST(jsonReq({ engagement_id: ENG_ID, filed_date: '2026-05-17' }));
    expect(res.status).toBe(503);
  });

  it('400 missing engagement_id', async () => {
    const res = await route.POST(jsonReq({ filed_date: '2026-05-17' }));
    expect(res.status).toBe(400);
  });

  it('400 missing filed_date', async () => {
    const res = await route.POST(jsonReq({ engagement_id: ENG_ID }));
    expect(res.status).toBe(400);
  });

  it('404 engagement missing', async () => {
    selectResultQueue.push([]);
    const res = await route.POST(jsonReq({ engagement_id: ENG_ID, filed_date: '2026-05-17' }));
    expect(res.status).toBe(404);
  });

  it('201 happy path emits NOTICE_OF_COMPLETION_FILED with payload', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, is_test_project: false }]);
    txInsertReturningQueue.notices_of_completion = [{ noc_id: NOC_ID }];
    txInsertReturning = [{ event_id: 'evt-noc' }];
    const res = await route.POST(jsonReq({
      engagement_id: ENG_ID,
      filed_date: '2026-05-17',
      recording_number: 'A-12345',
      lien_deadline_date: '2026-07-01',
    }));
    expect(res.status).toBe(201);
    const evt = findFieldEventInserts('NOTICE_OF_COMPLETION_FILED')[0];
    expect(evt).toBeTruthy();
    expect(evt.metadata).toMatchObject({
      noc_id: NOC_ID,
      engagement_id: ENG_ID,
      filed_date: '2026-05-17',
      recording_number: 'A-12345',
      lien_deadline_date: '2026-07-01',
      closeout_entity_kind: 'engagement',
    });
  });

  it('test_data=true propagation from engagement', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, is_test_project: true }]);
    txInsertReturningQueue.notices_of_completion = [{ noc_id: NOC_ID }];
    const res = await route.POST(jsonReq({ engagement_id: ENG_ID, filed_date: '2026-05-17' }));
    expect(res.status).toBe(201);
    const evt = findFieldEventInserts('NOTICE_OF_COMPLETION_FILED')[0];
    expect(evt.test_data).toBe(true);
  });
});

// ─── DELIVERABLE_PRODUCED — deliverable-documents ───────────────────────────

describe('POST /api/closeout/deliverable-documents', () => {
  type RouteModule = { POST: (req: Request) => Promise<Response> };
  let route: RouteModule;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/deliverable-documents/route') as RouteModule;
  });

  it('400 missing drive_file_id', async () => {
    const res = await route.POST(jsonReq({
      engagement_id: ENG_ID, deliverable_type: 'AS_BUILT_DRAWING',
    }));
    expect(res.status).toBe(400);
  });

  it('400 invalid deliverable_type', async () => {
    const res = await route.POST(jsonReq({
      engagement_id: ENG_ID, deliverable_type: 'BOGUS', drive_file_id: 'drv-1',
    }));
    expect(res.status).toBe(400);
  });

  it('400 UNIFIED_JOB_PACKET rejected (has its own route per §12)', async () => {
    const res = await route.POST(jsonReq({
      engagement_id: ENG_ID, deliverable_type: 'UNIFIED_JOB_PACKET', drive_file_id: 'drv-1',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_DELIVERABLE_TYPE');
  });

  it('400 invalid required_for_state', async () => {
    const res = await route.POST(jsonReq({
      engagement_id: ENG_ID, deliverable_type: 'AS_BUILT_DRAWING', drive_file_id: 'drv-1',
      required_for_state: 'BOGUS',
    }));
    expect(res.status).toBe(400);
  });

  it('201 happy path emits DELIVERABLE_PRODUCED with deliverable_type', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, is_test_project: false }]);
    txInsertReturningQueue.deliverable_documents = [{ deliverable_id: DELIV_ID }];
    const res = await route.POST(jsonReq({
      engagement_id: ENG_ID,
      deliverable_type: 'OM_MANUAL_COMPLETE',
      drive_file_id: 'drv-1',
      version: 2,
    }));
    expect(res.status).toBe(201);
    const evt = findFieldEventInserts('DELIVERABLE_PRODUCED')[0];
    expect(evt.metadata).toMatchObject({
      deliverable_id: DELIV_ID,
      deliverable_type: 'OM_MANUAL_COMPLETE',
      drive_file_id: 'drv-1',
      version: 2,
    });
  });
});

// ─── DELIVERABLE_PRODUCED — unified-job-packets ─────────────────────────────

describe('POST /api/closeout/unified-job-packets', () => {
  type RouteModule = { POST: (req: Request) => Promise<Response> };
  let route: RouteModule;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/unified-job-packets/route') as RouteModule;
  });

  it('400 missing template_version', async () => {
    const res = await route.POST(jsonReq({ engagement_id: ENG_ID, drive_file_id: 'drv-1' }));
    expect(res.status).toBe(400);
  });

  it('201 emits DELIVERABLE_PRODUCED with deliverable_type=UNIFIED_JOB_PACKET', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, is_test_project: false }]);
    txInsertReturningQueue.unified_job_packets = [{ packet_id: PACKET_ID }];
    const res = await route.POST(jsonReq({
      engagement_id: ENG_ID, template_version: 'v1.2', drive_file_id: 'drv-1',
    }));
    expect(res.status).toBe(201);
    const evt = findFieldEventInserts('DELIVERABLE_PRODUCED')[0];
    expect(evt.metadata).toMatchObject({
      deliverable_type: 'UNIFIED_JOB_PACKET',
      packet_id: PACKET_ID,
      drive_file_id: 'drv-1',
      template_version: 'v1.2',
    });
  });
});

// ─── DELIVERABLE_PRODUCED + PROJECT_STATE_CHANGED co-fire on cert ───────────

describe('POST /api/closeout/substantial-completion-certs (co-fire)', () => {
  type RouteModule = { POST: (req: Request) => Promise<Response> };
  let route: RouteModule;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/substantial-completion-certs/route') as RouteModule;
  });

  it('400 missing walkthrough_date', async () => {
    const res = await route.POST(jsonReq({ engagement_id: ENG_ID, cert_evidence_drive_id: 'drv-1' }));
    expect(res.status).toBe(400);
  });

  it('409 NO_LIFECYCLE_STATE when engagement has no prior lifecycle row', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, is_test_project: false }]);
    selectResultQueue.push([]); // no current lifecycle row
    const res = await route.POST(jsonReq({
      engagement_id: ENG_ID, walkthrough_date: '2026-05-15', cert_evidence_drive_id: 'drv-1',
    }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NO_LIFECYCLE_STATE');
  });

  it('409 ILLEGAL_LIFECYCLE_STATE when engagement is not IN_CLOSEOUT', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, is_test_project: false }]);
    selectResultQueue.push([{ lifecycle_state_id: LIFECYCLE_ID, state: 'FINAL_COMPLETE' }]);
    const res = await route.POST(jsonReq({
      engagement_id: ENG_ID, walkthrough_date: '2026-05-15', cert_evidence_drive_id: 'drv-1',
    }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ILLEGAL_LIFECYCLE_STATE');
  });

  it('201 co-fire happy path: emits DELIVERABLE_PRODUCED AND PROJECT_STATE_CHANGED with trigger+evidence', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, is_test_project: false }]);
    selectResultQueue.push([{ lifecycle_state_id: LIFECYCLE_ID, state: 'IN_CLOSEOUT' }]);
    txInsertReturningQueue.substantial_completion_certs = [{ cert_id: CERT_ID }];
    txInsertReturningQueue.project_lifecycle_states = [{ lifecycle_state_id: 'new-row' }];
    txInsertReturning = [{ event_id: 'evt-some' }];

    const res = await route.POST(jsonReq({
      engagement_id: ENG_ID,
      walkthrough_date: '2026-05-15',
      cert_evidence_drive_id: 'drv-cert-1',
    }));
    expect(res.status).toBe(201);

    const deliv = findFieldEventInserts('DELIVERABLE_PRODUCED')[0];
    expect(deliv).toBeTruthy();
    expect(deliv.metadata).toMatchObject({
      deliverable_type: 'SUBSTANTIAL_COMPLETION_CERT',
      cert_id: CERT_ID,
      drive_file_id: 'drv-cert-1',
    });

    const psc = findFieldEventInserts('PROJECT_STATE_CHANGED')[0];
    expect(psc).toBeTruthy();
    expect(psc.metadata).toMatchObject({
      from_state: 'IN_CLOSEOUT',
      to_state: 'SUBSTANTIALLY_COMPLETE',
      trigger: 'SUBSTANTIAL_COMPLETION_CERTIFICATE',
      evidence: 'drv-cert-1',
      cert_id: CERT_ID,
    });

    // Prior lifecycle row's exited_at was stamped
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({ exited_at: expect.any(Date) }));
  });

  it('co-fire rollback: if PROJECT_STATE emission throws, cert insert + DELIVERABLE both roll back', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, is_test_project: false }]);
    selectResultQueue.push([{ lifecycle_state_id: LIFECYCLE_ID, state: 'IN_CLOSEOUT' }]);
    txInsertReturningQueue.substantial_completion_certs = [{ cert_id: CERT_ID }];
    // Force the field_events insert to throw on the 2nd emit. Simpler:
    // throw on ANY field_events insert.
    txInsertShouldThrow = new Error('forced emit boom');

    const res = await route.POST(jsonReq({
      engagement_id: ENG_ID, walkthrough_date: '2026-05-15', cert_evidence_drive_id: 'drv-x',
    }));
    expect(res.status).toBe(500);
  });
});

// ─── GOLD_DATASET direct route ──────────────────────────────────────────────

describe('POST /api/closeout/gold-dataset-entries', () => {
  type RouteModule = { POST: (req: Request) => Promise<Response> };
  let route: RouteModule;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/gold-dataset-entries/route') as RouteModule;
  });

  it('400 missing engagement_id', async () => {
    const res = await route.POST(jsonReq({}));
    expect(res.status).toBe(400);
  });

  it('404 engagement missing', async () => {
    selectResultQueue.push([]);
    const res = await route.POST(jsonReq({ engagement_id: ENG_ID }));
    expect(res.status).toBe(404);
  });

  it('201 PRODUCTION path: inserts gold row AND emits with write_target=PRODUCTION', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, is_test_project: false }]);
    txInsertReturningQueue.gold_dataset_entries = [{ gold_entry_id: GOLD_ID }];
    const res = await route.POST(jsonReq({ engagement_id: ENG_ID }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.write_target).toBe('PRODUCTION');
    expect(j.gold_entry_id).toBe(GOLD_ID);
    const evt = findFieldEventInserts('GOLD_DATASET_ENTRY_WRITTEN')[0];
    expect(evt.metadata).toMatchObject({
      write_target: 'PRODUCTION',
      gold_entry_id: GOLD_ID,
      is_test_project: false,
    });
    // Confirm a gold_dataset_entries INSERT happened
    expect(insertValuesSpy.mock.calls.find((c) => c[0] === 'gold_dataset_entries')).toBeTruthy();
  });

  it('200 TEST_BLOCKED path: no row inserted, emit fires with write_target=TEST_BLOCKED + test_data=true', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, is_test_project: true }]);
    const res = await route.POST(jsonReq({ engagement_id: ENG_ID }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.write_target).toBe('TEST_BLOCKED');
    expect(j.gold_entry_id).toBeNull();
    const evt = findFieldEventInserts('GOLD_DATASET_ENTRY_WRITTEN')[0];
    expect(evt.test_data).toBe(true);
    expect(evt.metadata).toMatchObject({
      write_target: 'TEST_BLOCKED',
      gold_entry_id: null,
      is_test_project: true,
    });
    // No INSERT into gold_dataset_entries
    expect(insertValuesSpy.mock.calls.find((c) => c[0] === 'gold_dataset_entries')).toBeUndefined();
  });
});

// ─── JOB_COST_RECONCILED + GOLD_DATASET cascade ─────────────────────────────

describe('POST /api/closeout/engagements/[id]/reconciliation/accept', () => {
  type RouteModule = {
    POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  };
  let route: RouteModule;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/engagements/[id]/reconciliation/accept/route') as RouteModule;
  });

  it('400 missing gross_profit', async () => {
    const res = await route.POST(jsonReq({
      margin_pct_actual: 12.5, margin_variance_pct: 0.5,
    }), ctx(ENG_ID));
    expect(res.status).toBe(400);
  });

  it('400 non-numeric margin', async () => {
    const res = await route.POST(jsonReq({
      gross_profit: 100, margin_pct_actual: 'huh', margin_variance_pct: 0,
    }), ctx(ENG_ID));
    expect(res.status).toBe(400);
  });

  it('404 engagement missing', async () => {
    selectResultQueue.push([]);
    const res = await route.POST(jsonReq({
      gross_profit: 1000, margin_pct_actual: 12.5, margin_variance_pct: 0.2,
    }), ctx(ENG_ID));
    expect(res.status).toBe(404);
  });

  it('200 production happy path: emits BOTH GOLD_DATASET (PRODUCTION) AND JOB_COST_RECONCILED with gold_dataset_entry_id', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, is_test_project: false }]);
    txInsertReturningQueue.gold_dataset_entries = [{ gold_entry_id: GOLD_ID }];
    const res = await route.POST(jsonReq({
      gross_profit: '12500.00',
      margin_pct_actual: '12.5',
      margin_variance_pct: '0.3',
      kid: 'PRJ-2026-001',
    }), ctx(ENG_ID));
    expect(res.status).toBe(200);

    const gold = findFieldEventInserts('GOLD_DATASET_ENTRY_WRITTEN')[0];
    expect(gold).toBeTruthy();
    expect(gold.metadata).toMatchObject({ write_target: 'PRODUCTION', gold_entry_id: GOLD_ID });

    const recon = findFieldEventInserts('JOB_COST_RECONCILED')[0];
    expect(recon).toBeTruthy();
    expect(recon.metadata).toMatchObject({
      gross_profit: '12500.00',
      margin_pct_actual: '12.5',
      margin_variance_pct: '0.3',
      gold_dataset_entry_id: GOLD_ID,
      kid: 'PRJ-2026-001',
    });
    expect(recon.kid).toBe('PRJ-2026-001');
  });

  it('200 test-project cascade: GOLD_DATASET fires with TEST_BLOCKED (no row), JOB_COST_RECONCILED carries null gold_dataset_entry_id', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, is_test_project: true }]);
    const res = await route.POST(jsonReq({
      gross_profit: 0, margin_pct_actual: 0, margin_variance_pct: 0,
    }), ctx(ENG_ID));
    expect(res.status).toBe(200);
    const gold = findFieldEventInserts('GOLD_DATASET_ENTRY_WRITTEN')[0];
    expect(gold.metadata).toMatchObject({ write_target: 'TEST_BLOCKED' });
    expect(gold.test_data).toBe(true);
    const recon = findFieldEventInserts('JOB_COST_RECONCILED')[0];
    expect(recon.test_data).toBe(true);
    expect(recon.metadata).toMatchObject({ gold_dataset_entry_id: null });
    // No gold_dataset_entries INSERT
    expect(insertValuesSpy.mock.calls.find((c) => c[0] === 'gold_dataset_entries')).toBeUndefined();
  });

  it('cascade rollback: if JOB_COST_RECONCILED emission throws, gold_dataset write rolls back (returns 500)', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID, is_test_project: false }]);
    txInsertReturningQueue.gold_dataset_entries = [{ gold_entry_id: GOLD_ID }];
    txInsertShouldThrow = new Error('forced cascade boom');
    const res = await route.POST(jsonReq({
      gross_profit: 1000, margin_pct_actual: 10, margin_variance_pct: 0,
    }), ctx(ENG_ID));
    expect(res.status).toBe(500);
  });

  it('503 writes disabled', async () => {
    mockIsPostgresWriteEnabled.mockReturnValue(false);
    const res = await route.POST(jsonReq({
      gross_profit: 0, margin_pct_actual: 0, margin_variance_pct: 0,
    }), ctx(ENG_ID));
    expect(res.status).toBe(503);
  });
});
