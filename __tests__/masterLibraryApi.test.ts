/**
 * Packet 001: Unit tests for Master Library API routes.
 * Tests: response shape (entity-prefixed keys), auth enforcement, tenant scope.
 *
 * DB is mocked at module level (not per-test) to avoid dynamic-import/resetModules conflicts.
 * Set mockDbRows before each test that needs different data.
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

// ─── Stable mock data ─────────────────────────────────────────────────────────

const MOCK_FAMILIES = [
  { family_id: 'fam-uuid-1', kid: 'FAM-01', name: 'Storefront & Window Wall', description: null, gold_data_rollup: true, display_order: 0, status: 'canonical', is_active: true },
];

const MOCK_SYSTEM_TYPES = [
  { system_type_id: 'st-uuid-1', kid: 'ST-001', family_id: 'fam-uuid-1', family_kid: 'FAM-01', name: 'Storefront — Exterior', description: null, common_aliases: ['SF'], notes: null, status: 'canonical', is_active: true },
];

const MOCK_MANUFACTURERS = [
  { manufacturer_id: 'mfg-uuid-1', kid: 'MFG-001', name: 'YKK AP', primary_trade_role: 'Storefront / CW / Window', notes: null, status: 'canonical', is_active: true },
];

const MOCK_WORK_TYPES = [
  { work_type_id: 'wt-uuid-1', kid: 'WRK-01', name: 'Install', description: 'New installation', status: 'locked', is_active: true },
];

// ─── Mutable DB result — set before each test ─────────────────────────────────

let mockDbRows: unknown[] = [];

const mockOrderBy = jest.fn().mockImplementation(() => Promise.resolve(mockDbRows));
const mockQueryChain = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: mockOrderBy,
};

// ─── Module-level mocks ───────────────────────────────────────────────────────

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({ authOptions: {} }));

jest.mock('@/lib/env', () => ({
  getDefaultTenantId: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
  isMasterLibraryApiEnabled: jest.fn(() => false),
}));

jest.mock('@/db', () => ({
  db: mockQueryChain,
  families: {},
  system_types: {},
  manufacturers: {},
  work_types: {},
}));

// ─── Typed mock reference ─────────────────────────────────────────────────────

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/master-library/families', () => {
  // Import at describe scope — no resetModules so mock stays connected
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GET } = require('@/app/api/master-library/families/route');

  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderBy.mockImplementation(() => Promise.resolve(mockDbRows));
    // Re-wire chain after clearAllMocks
    mockQueryChain.select.mockReturnValue(mockQueryChain);
    mockQueryChain.from.mockReturnValue(mockQueryChain);
    mockQueryChain.leftJoin.mockReturnValue(mockQueryChain);
    mockQueryChain.where.mockReturnValue(mockQueryChain);
    mockQueryChain.orderBy.mockImplementation(() => Promise.resolve(mockDbRows));
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = makeRequest('http://localhost:3000/api/master-library/families');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 200 with correct envelope when authenticated', async () => {
    mockDbRows = MOCK_FAMILIES;
    mockGetServerSession.mockResolvedValue({ user: { email: 'test@kulaglass.com' } } as Awaited<ReturnType<typeof getServerSession>>);
    const req = makeRequest('http://localhost:3000/api/master-library/families');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('tenant_id', '00000000-0000-4000-8000-000000000001');
    expect(body).toHaveProperty('fetched_at');
  });

  it('response data uses entity-prefixed key family_id, not generic id', async () => {
    mockDbRows = MOCK_FAMILIES;
    mockGetServerSession.mockResolvedValue({ user: { email: 'test@kulaglass.com' } } as Awaited<ReturnType<typeof getServerSession>>);
    const req = makeRequest('http://localhost:3000/api/master-library/families');
    const res = await GET(req);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length > 0) {
      expect(body.data[0]).toHaveProperty('family_id');
      expect(body.data[0]).not.toHaveProperty('id');
    }
  });

  it('response tenant_id matches getDefaultTenantId', async () => {
    mockDbRows = MOCK_FAMILIES;
    mockGetServerSession.mockResolvedValue({ user: { email: 'test@kulaglass.com' } } as Awaited<ReturnType<typeof getServerSession>>);
    const req = makeRequest('http://localhost:3000/api/master-library/families');
    const res = await GET(req);
    const body = await res.json();
    expect(body.tenant_id).toBe('00000000-0000-4000-8000-000000000001');
  });
});

describe('GET /api/master-library/system-types', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GET } = require('@/app/api/master-library/system-types/route');

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryChain.select.mockReturnValue(mockQueryChain);
    mockQueryChain.from.mockReturnValue(mockQueryChain);
    mockQueryChain.leftJoin.mockReturnValue(mockQueryChain);
    mockQueryChain.where.mockReturnValue(mockQueryChain);
    mockQueryChain.orderBy.mockImplementation(() => Promise.resolve(mockDbRows));
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = makeRequest('http://localhost:3000/api/master-library/system-types');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with entity-prefixed keys system_type_id and family_id', async () => {
    mockDbRows = MOCK_SYSTEM_TYPES;
    mockGetServerSession.mockResolvedValue({ user: { email: 'test@kulaglass.com' } } as Awaited<ReturnType<typeof getServerSession>>);
    const req = makeRequest('http://localhost:3000/api/master-library/system-types');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('tenant_id');
    if (body.data.length > 0) {
      expect(body.data[0]).toHaveProperty('system_type_id');
      expect(body.data[0]).toHaveProperty('family_id');
      expect(body.data[0]).toHaveProperty('family_kid');
      expect(body.data[0]).not.toHaveProperty('id');
    }
  });
});

describe('GET /api/master-library/manufacturers', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GET } = require('@/app/api/master-library/manufacturers/route');

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryChain.select.mockReturnValue(mockQueryChain);
    mockQueryChain.from.mockReturnValue(mockQueryChain);
    mockQueryChain.leftJoin.mockReturnValue(mockQueryChain);
    mockQueryChain.where.mockReturnValue(mockQueryChain);
    mockQueryChain.orderBy.mockImplementation(() => Promise.resolve(mockDbRows));
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = makeRequest('http://localhost:3000/api/master-library/manufacturers');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with manufacturer_id key', async () => {
    mockDbRows = MOCK_MANUFACTURERS;
    mockGetServerSession.mockResolvedValue({ user: { email: 'test@kulaglass.com' } } as Awaited<ReturnType<typeof getServerSession>>);
    const req = makeRequest('http://localhost:3000/api/master-library/manufacturers');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    if (body.data.length > 0) {
      expect(body.data[0]).toHaveProperty('manufacturer_id');
      expect(body.data[0]).not.toHaveProperty('id');
    }
  });
});

describe('GET /api/master-library/work-types', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GET } = require('@/app/api/master-library/work-types/route');

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryChain.select.mockReturnValue(mockQueryChain);
    mockQueryChain.from.mockReturnValue(mockQueryChain);
    mockQueryChain.leftJoin.mockReturnValue(mockQueryChain);
    mockQueryChain.where.mockReturnValue(mockQueryChain);
    mockQueryChain.orderBy.mockImplementation(() => Promise.resolve(mockDbRows));
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = makeRequest('http://localhost:3000/api/master-library/work-types');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with work_type_id key', async () => {
    mockDbRows = MOCK_WORK_TYPES;
    mockGetServerSession.mockResolvedValue({ user: { email: 'test@kulaglass.com' } } as Awaited<ReturnType<typeof getServerSession>>);
    const req = makeRequest('http://localhost:3000/api/master-library/work-types');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    if (body.data.length > 0) {
      expect(body.data[0]).toHaveProperty('work_type_id');
      expect(body.data[0]).not.toHaveProperty('id');
    }
  });
});
