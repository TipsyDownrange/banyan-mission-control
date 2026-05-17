/**
 * BAN-311 Pass 3b.2 PR 3 — Closeout CRUD support tables tests.
 *
 * Covers all 7 route files added in PR 3:
 *   - GET /api/closeout/engagements/[id]/lifecycle-states (list)
 *   - GET /api/closeout/lifecycle-states/[id]
 *   - POST /api/closeout/warranty-claims
 *   - GET /api/closeout/warranties/[id]/claims (list)
 *   - GET + PATCH /api/closeout/warranty-claims/[id]
 *   - GET /api/closeout/projects/[kID]/search-indexes (list)
 *   - GET /api/closeout/search-indexes/[id]
 *
 * No Activity Spine emissions in PR 3 — purely CRUD against existing tables.
 */

// Force module mode so top-level declarations don't collide with PR 1/PR 2
// test files (TS treats files without import/export at top as scripts).
export {};

const fakeLookupRows: Record<string, Array<Record<string, unknown>>> = {
  engagement: [],
  warranty: [],
};
const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
let currentLookupKey: keyof typeof fakeLookupRows = 'engagement';

const updateSetSpy = jest.fn();
const insertValuesSpy = jest.fn();
const insertReturningByLabel: Record<string, Array<Record<string, unknown>>> = {};

const mockDb = {
  select: jest.fn(() => {
    const orderBy = jest.fn(() => ({ limit: terminalLimit, offset: terminalOffset }));
    const limit1 = jest.fn(async () => {
      if (selectResultQueue.length > 0) return selectResultQueue.shift()!;
      return fakeLookupRows[currentLookupKey] ?? [];
    });
    const terminalLimit = jest.fn(() => ({ offset: terminalOffset }));
    const terminalOffset = jest.fn(async () => {
      if (selectResultQueue.length > 0) return selectResultQueue.shift()!;
      return fakeLookupRows[currentLookupKey] ?? [];
    });
    const where = jest.fn(() => ({
      orderBy,
      limit: (n: number) => (n === 1 ? limit1() : { offset: terminalOffset }),
    }));
    const innerJoin = jest.fn(() => ({ where }));
    const from = jest.fn(() => ({ where, innerJoin }));
    return { from };
  }),
  insert: jest.fn((tableHandle: { _label?: string }) => ({
    values: (vals: Record<string, unknown>) => {
      const label = tableHandle._label ?? 'unknown';
      insertValuesSpy(label, vals);
      return {
        returning: async () => insertReturningByLabel[label] ?? [],
      };
    },
  })),
  update: jest.fn((tableHandle: { _label?: string }) => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(tableHandle._label ?? 'unknown', vals);
      return { where: () => Promise.resolve() };
    },
  })),
};

function tbl(label: string) {
  const cols = [
    'engagement_id', 'tenant_id', 'kid',
    'lifecycle_state_id', 'state', 'entered_at',
    'warranty_id', 'claim_id', 'inbound_date',
    'search_index_id',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  project_lifecycle_states: tbl('project_lifecycle_states'),
  warranty_claims: tbl('warranty_claims'),
  warranties: tbl('warranties'),
  engagements: tbl('engagements'),
  project_search_indexes: tbl('project_search_indexes'),
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
const ENG_KID = 'PRJ-2026-CLOSEOUT-1';
const LIFECYCLE_ID = '00000000-0000-4000-8000-000000000aaa';
const WARRANTY_ID = '00000000-0000-4000-8000-000000000bbb';
const CLAIM_ID = '00000000-0000-4000-8000-000000000ccc';
const SEARCH_INDEX_ID = '00000000-0000-4000-8000-000000000ddd';

function jsonReq(body: unknown, method = 'POST', url = 'https://example.test/api'): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function getReq(url: string): Request {
  return new Request(url, { method: 'GET' });
}

function ctx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(fakeLookupRows) as (keyof typeof fakeLookupRows)[]) {
    fakeLookupRows[k] = [];
  }
  for (const k of Object.keys(insertReturningByLabel)) delete insertReturningByLabel[k];
  selectResultQueue.length = 0;
  currentLookupKey = 'engagement';
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'kai@kulaglass.com' });
  mockBlockStagingMutation.mockReturnValue(null);
  mockIsPostgresWriteEnabled.mockReturnValue(true);
});

// ─── lifecycle-states ───────────────────────────────────────────────────────

describe('GET /api/closeout/engagements/[id]/lifecycle-states', () => {
  type RouteModule = { GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> };
  let route: RouteModule;
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/engagements/[id]/lifecycle-states/route') as RouteModule;
  });

  it('403 when permission denied', async () => {
    mockCheckPermission.mockResolvedValueOnce({ allowed: false, role: 'none', email: null });
    const res = await route.GET(getReq(`https://x/api/closeout/engagements/${ENG_ID}/lifecycle-states`), ctx({ id: ENG_ID }));
    expect(res.status).toBe(403);
  });

  it('200 returns items + pagination', async () => {
    selectResultQueue.push([
      { lifecycle_state_id: LIFECYCLE_ID, state: 'IN_CLOSEOUT' },
      { lifecycle_state_id: 'l2', state: 'SUBSTANTIALLY_COMPLETE' },
    ]);
    const res = await route.GET(getReq(`https://x/api/closeout/engagements/${ENG_ID}/lifecycle-states?limit=10`), ctx({ id: ENG_ID }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.items).toHaveLength(2);
    expect(j.limit).toBe(10);
  });
});

describe('GET /api/closeout/lifecycle-states/[id]', () => {
  type RouteModule = { GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> };
  let route: RouteModule;
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/lifecycle-states/[id]/route') as RouteModule;
  });

  it('404 when not found', async () => {
    selectResultQueue.push([]);
    const res = await route.GET(getReq(`https://x/api/closeout/lifecycle-states/${LIFECYCLE_ID}`), ctx({ id: LIFECYCLE_ID }));
    expect(res.status).toBe(404);
  });

  it('200 happy path', async () => {
    selectResultQueue.push([{ lifecycle_state_id: LIFECYCLE_ID, state: 'IN_CLOSEOUT' }]);
    const res = await route.GET(getReq(`https://x/api/closeout/lifecycle-states/${LIFECYCLE_ID}`), ctx({ id: LIFECYCLE_ID }));
    expect(res.status).toBe(200);
    expect((await res.json()).lifecycle_state_id).toBe(LIFECYCLE_ID);
  });
});

// ─── warranty-claims POST + list + GET + PATCH ──────────────────────────────

describe('POST /api/closeout/warranty-claims', () => {
  type RouteModule = { POST: (req: Request) => Promise<Response> };
  let route: RouteModule;
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/warranty-claims/route') as RouteModule;
  });

  it('503 when writes disabled', async () => {
    mockIsPostgresWriteEnabled.mockReturnValue(false);
    const res = await route.POST(jsonReq({ warranty_id: WARRANTY_ID }));
    expect(res.status).toBe(503);
  });

  it('400 missing warranty_id', async () => {
    const res = await route.POST(jsonReq({}));
    expect(res.status).toBe(400);
  });

  it('400 invalid inbound_source', async () => {
    const res = await route.POST(jsonReq({
      warranty_id: WARRANTY_ID, inbound_source: 'BOGUS',
      inbound_date: '2026-05-01', issue_description: 'leak',
    }));
    expect(res.status).toBe(400);
  });

  it('400 invalid service_wo_id (missing SRV- prefix)', async () => {
    const res = await route.POST(jsonReq({
      warranty_id: WARRANTY_ID, inbound_source: 'EMAIL',
      inbound_date: '2026-05-01', issue_description: 'leak',
      service_wo_id: 'WO-12345',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_SERVICE_WO_ID');
  });

  it('400 invalid triage_result', async () => {
    const res = await route.POST(jsonReq({
      warranty_id: WARRANTY_ID, inbound_source: 'EMAIL',
      inbound_date: '2026-05-01', issue_description: 'leak',
      triage_result: 'BOGUS',
    }));
    expect(res.status).toBe(400);
  });

  it('404 parent warranty not found', async () => {
    selectResultQueue.push([]);
    const res = await route.POST(jsonReq({
      warranty_id: WARRANTY_ID, inbound_source: 'EMAIL',
      inbound_date: '2026-05-01', issue_description: 'leak',
    }));
    expect(res.status).toBe(404);
  });

  it('201 happy path INSERTS no field_events row + accepts SRV- service_wo_id', async () => {
    selectResultQueue.push([{ warranty_id: WARRANTY_ID, engagement_id: ENG_ID }]);
    insertReturningByLabel.warranty_claims = [{ claim_id: CLAIM_ID }];
    const res = await route.POST(jsonReq({
      warranty_id: WARRANTY_ID,
      inbound_source: 'PORTAL',
      inbound_date: '2026-05-01',
      issue_description: 'seal failure',
      service_wo_id: 'SRV-99001',
      triage_result: 'KULA_RESPONSIBLE',
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).claim_id).toBe(CLAIM_ID);
    // No field_events insert — CRUD-only per PR 3 D3
    expect(insertValuesSpy.mock.calls.find((c) => c[0] === 'field_events')).toBeUndefined();
    expect(insertValuesSpy.mock.calls.find((c) => c[0] === 'warranty_claims')).toBeTruthy();
  });
});

describe('GET /api/closeout/warranties/[id]/claims', () => {
  type RouteModule = { GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> };
  let route: RouteModule;
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/warranties/[id]/claims/route') as RouteModule;
  });

  it('200 returns claims list', async () => {
    selectResultQueue.push([
      { claim_id: CLAIM_ID, warranty_id: WARRANTY_ID },
      { claim_id: 'c2', warranty_id: WARRANTY_ID },
    ]);
    const res = await route.GET(getReq(`https://x/api/closeout/warranties/${WARRANTY_ID}/claims`), ctx({ id: WARRANTY_ID }));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(2);
  });

  it('403 when permission denied', async () => {
    mockCheckPermission.mockResolvedValueOnce({ allowed: false, role: 'none', email: null });
    const res = await route.GET(getReq(`https://x/api/closeout/warranties/${WARRANTY_ID}/claims`), ctx({ id: WARRANTY_ID }));
    expect(res.status).toBe(403);
  });
});

describe('GET + PATCH /api/closeout/warranty-claims/[id]', () => {
  type RouteModule = {
    GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  };
  let route: RouteModule;
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/warranty-claims/[id]/route') as RouteModule;
  });

  it('GET 404 not found', async () => {
    selectResultQueue.push([]);
    const res = await route.GET(getReq(`https://x/api/closeout/warranty-claims/${CLAIM_ID}`), ctx({ id: CLAIM_ID }));
    expect(res.status).toBe(404);
  });

  it('GET 200 happy path', async () => {
    selectResultQueue.push([{ claim_id: CLAIM_ID, warranty_id: WARRANTY_ID }]);
    const res = await route.GET(getReq(`https://x/api/closeout/warranty-claims/${CLAIM_ID}`), ctx({ id: CLAIM_ID }));
    expect(res.status).toBe(200);
    expect((await res.json()).claim_id).toBe(CLAIM_ID);
  });

  it('PATCH 400 non-patchable field (engagement_id)', async () => {
    const res = await route.PATCH(
      jsonReq({ engagement_id: 'changed' }, 'PATCH', `https://x/api/closeout/warranty-claims/${CLAIM_ID}`),
      ctx({ id: CLAIM_ID }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('FIELD_NOT_PATCHABLE');
  });

  it('PATCH 400 invalid resolution', async () => {
    const res = await route.PATCH(
      jsonReq({ resolution: 'BOGUS' }, 'PATCH', `https://x/api/closeout/warranty-claims/${CLAIM_ID}`),
      ctx({ id: CLAIM_ID }),
    );
    expect(res.status).toBe(400);
  });

  it('PATCH 400 invalid service_wo_id', async () => {
    const res = await route.PATCH(
      jsonReq({ service_wo_id: 'WO-1' }, 'PATCH', `https://x/api/closeout/warranty-claims/${CLAIM_ID}`),
      ctx({ id: CLAIM_ID }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_SERVICE_WO_ID');
  });

  it('PATCH 404 when not found', async () => {
    selectResultQueue.push([]);
    const res = await route.PATCH(
      jsonReq({ triage_reasoning: 'updated' }, 'PATCH', `https://x/api/closeout/warranty-claims/${CLAIM_ID}`),
      ctx({ id: CLAIM_ID }),
    );
    expect(res.status).toBe(404);
  });

  it('PATCH 200 partial update — only patched fields change; no field_events emit', async () => {
    selectResultQueue.push([{ claim_id: CLAIM_ID }]);
    const res = await route.PATCH(
      jsonReq(
        { triage_reasoning: 'manufacturer defect', triage_result: 'MANUFACTURER_RESPONSIBLE' },
        'PATCH',
        `https://x/api/closeout/warranty-claims/${CLAIM_ID}`,
      ),
      ctx({ id: CLAIM_ID }),
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      'warranty_claims',
      expect.objectContaining({
        triage_reasoning: 'manufacturer defect',
        triage_result: 'MANUFACTURER_RESPONSIBLE',
      }),
    );
    // No emission per BAN-311 PR 3 dispatch (§8.7 bound)
    expect(insertValuesSpy.mock.calls.find((c) => c[0] === 'field_events')).toBeUndefined();
  });

  it('PATCH 200 parses resolved_at string to Date', async () => {
    selectResultQueue.push([{ claim_id: CLAIM_ID }]);
    const res = await route.PATCH(
      jsonReq(
        { resolved_at: '2026-06-01T10:00:00Z', resolution: 'COMPLETED' },
        'PATCH',
        `https://x/api/closeout/warranty-claims/${CLAIM_ID}`,
      ),
      ctx({ id: CLAIM_ID }),
    );
    expect(res.status).toBe(200);
    const call = updateSetSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(call.resolved_at).toBeInstanceOf(Date);
    expect(call.resolution).toBe('COMPLETED');
  });

  it('PATCH 400 empty body', async () => {
    const res = await route.PATCH(
      jsonReq({}, 'PATCH', `https://x/api/closeout/warranty-claims/${CLAIM_ID}`),
      ctx({ id: CLAIM_ID }),
    );
    expect(res.status).toBe(400);
  });
});

// ─── search-indexes admin routes ────────────────────────────────────────────

describe('GET /api/closeout/projects/[kID]/search-indexes', () => {
  type RouteModule = { GET: (req: Request, ctx: { params: Promise<{ kID: string }> }) => Promise<Response> };
  let route: RouteModule;
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/projects/[kID]/search-indexes/route') as RouteModule;
  });

  it('404 engagement missing by kID', async () => {
    selectResultQueue.push([]);
    const res = await route.GET(getReq(`https://x/api/closeout/projects/${ENG_KID}/search-indexes`), ctx({ kID: ENG_KID }));
    expect(res.status).toBe(404);
  });

  it('200 returns rows + resolved engagement_id', async () => {
    selectResultQueue.push([{ engagement_id: ENG_ID }]);
    selectResultQueue.push([{ search_index_id: SEARCH_INDEX_ID, engagement_id: ENG_ID }]);
    const res = await route.GET(getReq(`https://x/api/closeout/projects/${ENG_KID}/search-indexes`), ctx({ kID: ENG_KID }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.engagement_id).toBe(ENG_ID);
    expect(j.items).toHaveLength(1);
  });
});

describe('GET /api/closeout/search-indexes/[id]', () => {
  type RouteModule = { GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> };
  let route: RouteModule;
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require('@/app/api/closeout/search-indexes/[id]/route') as RouteModule;
  });

  it('404 when not found', async () => {
    selectResultQueue.push([]);
    const res = await route.GET(getReq(`https://x/api/closeout/search-indexes/${SEARCH_INDEX_ID}`), ctx({ id: SEARCH_INDEX_ID }));
    expect(res.status).toBe(404);
  });

  it('200 happy path', async () => {
    selectResultQueue.push([{ search_index_id: SEARCH_INDEX_ID, engagement_id: ENG_ID }]);
    const res = await route.GET(getReq(`https://x/api/closeout/search-indexes/${SEARCH_INDEX_ID}`), ctx({ id: SEARCH_INDEX_ID }));
    expect(res.status).toBe(200);
    expect((await res.json()).search_index_id).toBe(SEARCH_INDEX_ID);
  });
});
