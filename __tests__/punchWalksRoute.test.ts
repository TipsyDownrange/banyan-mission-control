/**
 * BAN-375 Closeout v1.1.1 — /api/closeout/punch-walks tests.
 *
 * Covers GET (engagement_id filter), POST (validation + engagement lookup
 * + insert), PATCH (status flip in_progress → complete).
 */

export {};

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const WALK_ID = '00000000-0000-4000-8000-000000000b01';

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

let walksSelectResult: Array<Record<string, unknown>> = [];
let engagementSelectResult: Array<Record<string, unknown>> = [];
let walksByIdResult: Array<Record<string, unknown>> = [];
let updateReturning: Array<Record<string, unknown>> = [];
let insertReturning: Array<Record<string, unknown>> = [];
const insertValuesSpy = jest.fn();
const updateSetSpy = jest.fn();
let currentLookup: 'walks' | 'engagement' | 'walk_by_id' = 'walks';

const mockDb = {
  select: jest.fn(() => ({
    from: jest.fn((tableHandle: { _label?: string }) => {
      const label = tableHandle._label;
      return {
        where: jest.fn(() => ({
          orderBy: jest.fn(async () => walksSelectResult),
          limit: jest.fn(async () => {
            if (label === 'engagements') return engagementSelectResult;
            if (label === 'punch_walks' && currentLookup === 'walk_by_id') return walksByIdResult;
            return [];
          }),
        })),
      };
    }),
  })),
  insert: jest.fn(() => ({
    values: (vals: Record<string, unknown>) => {
      insertValuesSpy(vals);
      return { returning: async () => insertReturning };
    },
  })),
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(vals);
      return {
        where: jest.fn(() => ({
          returning: async () => updateReturning,
        })),
      };
    },
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
    punch_walks: tbl('punch_walks'),
    engagements: tbl('engagements'),
  };
});

function jsonReq(body: unknown, method = 'POST', url = 'https://example.test/api'): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  walksSelectResult = [];
  engagementSelectResult = [];
  walksByIdResult = [];
  updateReturning = [];
  insertReturning = [];
  currentLookup = 'walks';
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'pm@kulaglass.com' });
  mockBlockStagingMutation.mockReturnValue(null);
  mockIsPostgresWriteEnabled.mockReturnValue(true);
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const collection = require('@/app/api/closeout/punch-walks/route') as {
  GET: (req: Request) => Promise<Response>;
  POST: (req: Request) => Promise<Response>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const item = require('@/app/api/closeout/punch-walks/[id]/route') as {
  GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
};

function ctxFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/closeout/punch-walks', () => {
  it('requires engagement_id query param', async () => {
    const res = await collection.GET(new Request('https://example.test/api/closeout/punch-walks'));
    expect(res.status).toBe(400);
  });

  it('returns walks scoped to the engagement', async () => {
    walksSelectResult = [
      { walk_id: WALK_ID, engagement_id: ENG_ID, type: 'initial', walk_date: '2026-05-19' },
    ];
    const res = await collection.GET(
      new Request(`https://example.test/api/closeout/punch-walks?engagement_id=${ENG_ID}`),
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.punch_walks).toHaveLength(1);
    expect(j.punch_walks[0].type).toBe('initial');
  });
});

describe('POST /api/closeout/punch-walks', () => {
  it('creates a walk when engagement resolves + type is valid', async () => {
    engagementSelectResult = [{ engagement_id: ENG_ID }];
    insertReturning = [{ walk_id: WALK_ID, type: 'initial', walk_date: '2026-05-19' }];
    const res = await collection.POST(jsonReq({
      engagement_id: ENG_ID,
      type: 'initial',
      walk_date: '2026-05-19',
    }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.punch_walk.walk_id).toBe(WALK_ID);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        engagement_id: ENG_ID,
        type: 'initial',
        status: 'in_progress',
      }),
    );
  });

  it('rejects unknown type values with INVALID_TYPE', async () => {
    engagementSelectResult = [{ engagement_id: ENG_ID }];
    const res = await collection.POST(jsonReq({
      engagement_id: ENG_ID,
      type: 'random_walk',
      walk_date: '2026-05-19',
    }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.code).toBe('INVALID_TYPE');
  });

  it('returns 404 when engagement does not resolve in tenant', async () => {
    engagementSelectResult = [];
    const res = await collection.POST(jsonReq({
      engagement_id: ENG_ID,
      type: 'initial',
      walk_date: '2026-05-19',
    }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when walk_date is missing', async () => {
    engagementSelectResult = [{ engagement_id: ENG_ID }];
    const res = await collection.POST(jsonReq({ engagement_id: ENG_ID, type: 'initial' }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/closeout/punch-walks/[id]', () => {
  it('updates status from in_progress → complete', async () => {
    updateReturning = [{ walk_id: WALK_ID, status: 'complete' }];
    const res = await item.PATCH(jsonReq({ status: 'complete' }, 'PATCH'), ctxFor(WALK_ID));
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete' }),
    );
  });

  it('rejects invalid status values', async () => {
    const res = await item.PATCH(jsonReq({ status: 'cancelled' }, 'PATCH'), ctxFor(WALK_ID));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/closeout/punch-walks/[id]', () => {
  it('returns the walk when found', async () => {
    currentLookup = 'walk_by_id';
    walksByIdResult = [{ walk_id: WALK_ID, engagement_id: ENG_ID, type: 'final' }];
    const res = await item.GET(jsonReq(undefined, 'GET'), ctxFor(WALK_ID));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.punch_walk.type).toBe('final');
  });

  it('returns 404 when missing', async () => {
    currentLookup = 'walk_by_id';
    walksByIdResult = [];
    const res = await item.GET(jsonReq(undefined, 'GET'), ctxFor(WALK_ID));
    expect(res.status).toBe(404);
  });
});
