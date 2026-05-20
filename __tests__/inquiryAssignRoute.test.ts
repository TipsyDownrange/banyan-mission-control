/**
 * BAN-376 Customer Pipeline — /api/inquiries/[id]/assign POST route tests.
 *
 *   - 401 / 403 gate.
 *   - Rejects invalid assigned_role.
 *   - Requires assigned_to_user_id.
 *   - Happy path stamps assigned_at and writes assigned_role.
 */

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const INQUIRY_ID = '00000000-0000-4000-8000-000000000111';
const USER_ID = '00000000-0000-4000-8000-000000000222';

const updateSetSpy = jest.fn();

const mockDb = {
  update: jest.fn(() => ({
    set: (vals: Record<string, unknown>) => {
      updateSetSpy(vals);
      return {
        where: () => ({ returning: async () => [{ inquiry_id: INQUIRY_ID, ...vals }] }),
      };
    },
  })),
};

function tbl(label: string) {
  const cols = ['inquiry_id', 'tenant_id', 'assigned_to_user_id', 'assigned_role', 'assigned_at', 'updated_at'];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  db: mockDb,
  inquiries: tbl('inquiries'),
  INQUIRY_ASSIGNED_ROLES: ['PM', 'SERVICE_PM', 'ESTIMATOR', 'GM', 'ADMIN'],
}));

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  __esModule: true,
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock('@/lib/env', () => ({
  getDefaultTenantId: () => TENANT_ID,
  isPostgresWriteEnabled: () => true,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetServerSession.mockResolvedValue({
    user: { email: 'pm@kulaglass.com', role: 'pm' },
  });
});

describe('POST /api/inquiries/[id]/assign', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/inquiries/[id]/assign/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assigned_to_user_id: USER_ID }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(401);
  });

  it('returns 403 when role lacks INQUIRY_WRITE', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: 'f@k.com', role: 'field' } });
    const { POST } = await import('@/app/api/inquiries/[id]/assign/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assigned_to_user_id: USER_ID }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(403);
  });

  it('rejects when assigned_to_user_id missing', async () => {
    const { POST } = await import('@/app/api/inquiries/[id]/assign/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(400);
  });

  it('rejects invalid assigned_role', async () => {
    const { POST } = await import('@/app/api/inquiries/[id]/assign/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assigned_to_user_id: USER_ID, assigned_role: 'BOGUS' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(400);
  });

  it('stamps assigned_at + assigned_role on happy path', async () => {
    const { POST } = await import('@/app/api/inquiries/[id]/assign/route');
    const res = await POST(new Request(`http://localhost/api/inquiries/${INQUIRY_ID}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assigned_to_user_id: USER_ID, assigned_role: 'PM' }),
    }), { params: Promise.resolve({ id: INQUIRY_ID }) });
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      assigned_to_user_id: USER_ID,
      assigned_role: 'PM',
      assigned_at: expect.any(Date),
    }));
  });
});
