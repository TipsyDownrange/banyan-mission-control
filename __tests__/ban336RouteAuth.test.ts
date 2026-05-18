/**
 * BAN-336 Pay App Core — route auth contracts (route GET handlers loaded
 * with all DB code mocked). Verifies the 403 path on the read gate and the
 * 400 path on missing required fields. The transaction body is mocked so
 * we don't need a live Postgres.
 */

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/auth', () => ({ authOptions: {}, getRoleFromEmail: () => 'super_admin' }));
jest.mock('@/lib/permissions', () => ({
  checkPermission: jest.fn(async () => ({ allowed: true, email: 'admin@kulaglass.com', role: 'super_admin' })),
}));

// Capture mocked db so tests can inject row results
const mockSelect: jest.Mock = jest.fn();
jest.mock('@/db', () => ({
  db: { select: () => mockSelect(), transaction: jest.fn() },
  pay_applications: {},
  pay_app_line_items: {},
  schedule_of_values: {},
  billing_format_config: {},
  engagements: {},
  sov_versions: {},
  users: {},
}));
jest.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  desc: (...args: unknown[]) => args,
  sql: () => ({}),
}));
jest.mock('@/lib/aia/read-gate', () => ({
  passAiaReadGate: jest.fn(async (req: Request) => {
    const h = (req.headers as Headers).get('x-test-auth');
    if (h === 'forbidden') {
      return {
        ok: false as const,
        response: new (await import('next/server')).NextResponse(
          JSON.stringify({ error: 'forbidden' }),
          { status: 403 },
        ),
      };
    }
    return { ok: true as const, actorEmail: 'pm@kulaglass.com', tenantId: 'tenant-1' };
  }),
  parsePagination: () => ({ limit: 50, offset: 0 }),
}));
jest.mock('@/lib/aia/api-gate', () => ({
  passAiaApiGate: jest.fn(async (req: Request) => {
    const h = (req.headers as Headers).get('x-test-auth');
    if (h === 'forbidden') {
      return {
        ok: false as const,
        response: new (await import('next/server')).NextResponse(
          JSON.stringify({ error: 'forbidden' }),
          { status: 403 },
        ),
      };
    }
    return { ok: true as const, actorEmail: 'admin@kulaglass.com', tenantId: 'tenant-1' };
  }),
}));

describe('BAN-336 /api/pay-apps GET[id] gate', () => {
  beforeEach(() => mockSelect.mockReset());

  it('returns 403 when the read gate rejects', async () => {
    const { GET } = await import('@/app/api/pay-apps/[id]/route');
    const req = new Request('http://localhost/api/pay-apps/abc', {
      headers: { 'x-test-auth': 'forbidden' },
    });
    const res = await GET(req, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the pay app does not exist in tenant', async () => {
    mockSelect.mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    const { GET } = await import('@/app/api/pay-apps/[id]/route');
    const req = new Request('http://localhost/api/pay-apps/missing');
    const res = await GET(req, { params: Promise.resolve({ id: 'missing' }) });
    expect(res.status).toBe(404);
  });
});

describe('BAN-336 /api/pay-apps POST input validation', () => {
  beforeEach(() => mockSelect.mockReset());

  it('returns 400 on missing required fields', async () => {
    const { POST } = await import('@/app/api/pay-apps/route');
    const req = new Request('http://localhost/api/pay-apps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engagement_id: 'X' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/period/);
  });

  it('returns 400 on unknown billing_format', async () => {
    const { POST } = await import('@/app/api/pay-apps/route');
    const req = new Request('http://localhost/api/pay-apps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engagement_id: 'X',
        period_start: '2026-01-01',
        period_end: '2026-01-31',
        billing_format: 'NOT_A_FORMAT',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('BAN-336 /api/admin/sov-stub POST input validation', () => {
  beforeEach(() => mockSelect.mockReset());

  it('returns 400 on missing engagement_id', async () => {
    const { POST } = await import('@/app/api/admin/sov-stub/route');
    const req = new Request('http://localhost/api/admin/sov-stub', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: [{ line_number: 1, description: 'x', scheduled_value: 100 }] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on empty lines array', async () => {
    const { POST } = await import('@/app/api/admin/sov-stub/route');
    const req = new Request('http://localhost/api/admin/sov-stub', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engagement_id: 'eng-1', lines: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('BAN-336 /api/pay-apps/[id]/reject', () => {
  it('returns 400 when reason is missing', async () => {
    const { POST } = await import('@/app/api/pay-apps/[id]/reject/route');
    const req = new Request('http://localhost/api/pay-apps/abc/reject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(400);
  });
});
