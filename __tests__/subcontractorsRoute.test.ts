/**
 * BAN-375 Closeout v1.1.1 — /api/closeout/subcontractors CRUD tests.
 *
 * Mocks lib/permissions + lib/env + the db handle to verify gate behavior,
 * trade validation, island validation, and the soft-delete shape on DELETE.
 * Mirrors the BAN-311 Pattern A mock scaffold style.
 */

export {};

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const SUB_ID = '00000000-0000-4000-8000-000000000a01';

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

let selectResult: Array<Record<string, unknown>> = [];
const insertValuesSpy = jest.fn();
const updateSetSpy = jest.fn();
let insertReturning: Array<Record<string, unknown>> = [];
let updateReturning: Array<Record<string, unknown>> = [];

const mockDb = {
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        orderBy: jest.fn(async () => selectResult),
        limit: jest.fn(async () => selectResult),
      })),
    })),
  })),
  insert: jest.fn(() => ({
    values: (vals: Record<string, unknown>) => {
      insertValuesSpy(vals);
      return {
        returning: async () => insertReturning,
      };
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
  const tbl = (label: string) => {
    const proxy = new Proxy(
      { _label: label },
      { get: (target, prop) => (prop === '_label' ? label : { name: prop, table: target }) },
    );
    return proxy;
  };
  return {
    __esModule: true,
    db: mockDb,
    subcontractors: tbl('subcontractors'),
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
  selectResult = [];
  insertReturning = [];
  updateReturning = [];
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'business_admin', email: 'admin@kulaglass.com' });
  mockBlockStagingMutation.mockReturnValue(null);
  mockIsPostgresWriteEnabled.mockReturnValue(true);
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const collection = require('@/app/api/closeout/subcontractors/route') as {
  GET: (req: Request) => Promise<Response>;
  POST: (req: Request) => Promise<Response>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const item = require('@/app/api/closeout/subcontractors/[id]/route') as {
  GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
};

function ctxFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/closeout/subcontractors', () => {
  it('returns the list when the read gate passes', async () => {
    selectResult = [
      { subcontractor_id: SUB_ID, company_name: 'Acme Framing', trade: 'framer', active: true },
    ];
    const res = await collection.GET(new Request('https://example.test/api/closeout/subcontractors'));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.subcontractors).toHaveLength(1);
    expect(j.subcontractors[0].trade).toBe('framer');
  });

  it('rejects an unknown trade filter with 400 INVALID_TRADE message', async () => {
    const res = await collection.GET(
      new Request('https://example.test/api/closeout/subcontractors?trade=electrician'),
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toContain('framer, waterproofer');
  });

  it('rejects an unknown island filter with 400', async () => {
    const res = await collection.GET(
      new Request('https://example.test/api/closeout/subcontractors?island=hawaii'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when project:view is denied', async () => {
    mockCheckPermission.mockResolvedValueOnce({ allowed: false, role: 'none', email: null });
    const res = await collection.GET(new Request('https://example.test/api/closeout/subcontractors'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/closeout/subcontractors', () => {
  it('creates a row when business:admin gate passes', async () => {
    insertReturning = [{ subcontractor_id: SUB_ID, company_name: 'Acme', trade: 'framer' }];
    const res = await collection.POST(jsonReq({ company_name: 'Acme', trade: 'framer' }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.subcontractor.trade).toBe('framer');
    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ company_name: 'Acme', trade: 'framer', active: true }),
    );
  });

  it('rejects trade values outside framer | waterproofer (Sean lock)', async () => {
    const res = await collection.POST(jsonReq({ company_name: 'BadCo', trade: 'glazier' }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.code).toBe('INVALID_TRADE');
  });

  it('requires company_name', async () => {
    const res = await collection.POST(jsonReq({ trade: 'framer' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when business:admin permission is missing', async () => {
    mockCheckPermission.mockResolvedValueOnce({ allowed: false, role: 'pm', email: 'pm@kulaglass.com' });
    const res = await collection.POST(jsonReq({ company_name: 'Acme', trade: 'framer' }));
    expect(res.status).toBe(403);
  });
});

describe('PATCH/DELETE /api/closeout/subcontractors/[id]', () => {
  it('PATCH updates the row when business:admin', async () => {
    updateReturning = [{ subcontractor_id: SUB_ID, company_name: 'New Name', trade: 'framer' }];
    const res = await item.PATCH(jsonReq({ company_name: 'New Name' }, 'PATCH'), ctxFor(SUB_ID));
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ company_name: 'New Name' }),
    );
  });

  it('DELETE soft-deletes (sets active=false), returns 200 with active:false', async () => {
    updateReturning = [{ subcontractor_id: SUB_ID }];
    const res = await item.DELETE(jsonReq(undefined, 'DELETE'), ctxFor(SUB_ID));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.active).toBe(false);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ active: false }),
    );
  });

  it('DELETE returns 404 when row does not exist in tenant', async () => {
    updateReturning = [];
    const res = await item.DELETE(jsonReq(undefined, 'DELETE'), ctxFor(SUB_ID));
    expect(res.status).toBe(404);
  });
});
