/**
 * BAN-375 Closeout v1.1 Phase 2 — GET /api/closeout/warranties/{id}/warranty-letter
 *
 * Covers the gates and tenant-scoped lookup contract:
 *   - 403 when project:edit permission denied
 *   - 503 when isPostgresWriteEnabled is false (passAiaApiGate per dispatch)
 *   - 404 when the warranty does not resolve in the gate's tenant
 *   - 200 + application/pdf body on success, with the existing
 *     lib/pdf-warranty.tsx template invoked for the buffer
 */

export {};

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const WARRANTY_ID = '11111111-1111-4111-8111-111111111111';
const ENG_ID = '22222222-2222-4222-8222-222222222222';

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

let lookupResult: Array<Record<string, unknown>> = [];

const mockDb = {
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      innerJoin: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => lookupResult),
        })),
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
    warranties: tbl('warranties'),
    engagements: tbl('engagements'),
  };
});

const mockGenerateWarrantyPDF: jest.Mock<Promise<Buffer>, [Record<string, unknown>]> = jest.fn(
  async (_data: Record<string, unknown>) => Buffer.from('%PDF-1.4 fake'),
);
jest.mock('@/lib/pdf-warranty', () => ({
  generateWarrantyPDF: (data: Record<string, unknown>) => mockGenerateWarrantyPDF(data),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const route = require('@/app/api/closeout/warranties/[id]/warranty-letter/route') as {
  GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
};

function getReq(id = WARRANTY_ID): {
  req: Request;
  ctx: { params: Promise<{ id: string }> };
} {
  return {
    req: new Request(`https://example.test/api/closeout/warranties/${id}/warranty-letter`, { method: 'GET' }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  lookupResult = [];
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'pm@kulaglass.com' });
  mockBlockStagingMutation.mockReturnValue(null);
  mockIsPostgresWriteEnabled.mockReturnValue(true);
  mockGenerateWarrantyPDF.mockResolvedValue(Buffer.from('%PDF-1.4 fake'));
});

describe('GET /api/closeout/warranties/[id]/warranty-letter — gates', () => {
  it('returns 403 when checkPermission denies project:edit', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: false, role: 'none', email: null });
    const { req, ctx } = getReq();
    const res = await route.GET(req, ctx);
    expect(res.status).toBe(403);
  });

  it('returns 503 when isPostgresWriteEnabled is false (passAiaApiGate per dispatch)', async () => {
    mockIsPostgresWriteEnabled.mockReturnValue(false);
    const { req, ctx } = getReq();
    const res = await route.GET(req, ctx);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('POSTGRES_WRITE_DISABLED');
  });
});

describe('GET /api/closeout/warranties/[id]/warranty-letter — tenant scoping', () => {
  it('returns 404 when warranty does not resolve in tenant', async () => {
    lookupResult = [];
    const { req, ctx } = getReq();
    const res = await route.GET(req, ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain(WARRANTY_ID);
  });
});

describe('GET /api/closeout/warranties/[id]/warranty-letter — happy path', () => {
  it('returns a PDF stream with the warranty letter buffer', async () => {
    lookupResult = [{
      warranty_id: WARRANTY_ID,
      engagement_id: ENG_ID,
      start_date: '2026-05-01',
      scope_warranties: [
        { scope: 'Curtain wall', years: 1, description: 'Installation workmanship' },
      ],
      status: 'ACTIVE',
      kid: 'PRJ-26-0007',
      drive_folder_id: 'drive-PRJ-26-0007',
      metadata: {
        project_name: 'Mauna Tower Curtain Wall',
        owner_name: 'Mauna Owner LLC',
        owner_address: '123 Coastline Dr, Honolulu HI',
      },
    }];
    const { req, ctx } = getReq();
    const res = await route.GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain(`WAR-${WARRANTY_ID.slice(0, 8).toUpperCase()}`);

    expect(mockGenerateWarrantyPDF).toHaveBeenCalledTimes(1);
    const call = mockGenerateWarrantyPDF.mock.calls[0];
    if (!call) throw new Error('generateWarrantyPDF was not called');
    const data = call[0];
    expect(data).toMatchObject({
      warranty_number: `WAR-${WARRANTY_ID.slice(0, 8).toUpperCase()}`,
      project_name: 'Mauna Tower Curtain Wall',
      kID: 'PRJ-26-0007',
      owner_name: 'Mauna Owner LLC',
      owner_address: '123 Coastline Dr, Honolulu HI',
      workmanship_years: 1,
      warranty_start_date: '2026-05-01',
      warranty_end_date: '2027-05-01',
    });
    expect(data.system_types).toEqual(['Curtain wall']);
  });

  it('falls back to kID + sane defaults when engagement metadata is empty', async () => {
    lookupResult = [{
      warranty_id: WARRANTY_ID,
      engagement_id: ENG_ID,
      start_date: '2026-05-01',
      scope_warranties: [],
      status: 'ACTIVE',
      kid: 'PRJ-26-0007',
      drive_folder_id: null,
      metadata: {},
    }];
    const { req, ctx } = getReq();
    const res = await route.GET(req, ctx);
    expect(res.status).toBe(200);
    const call = mockGenerateWarrantyPDF.mock.calls[0];
    if (!call) throw new Error('generateWarrantyPDF was not called');
    const data = call[0];
    expect(data.project_name).toBe('PRJ-26-0007');
    expect(data.owner_name).toBe('—');
    expect(data.owner_address).toBe('—');
    expect(data.workmanship_years).toBe(1);
    expect(data.warranty_end_date).toBe('2027-05-01');
  });
});
