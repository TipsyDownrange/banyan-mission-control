/**
 * BAN-355 follow-up — Contacts auth migration route tests.
 *
 * CONTACTS-PERMISSIONS dispatch (2026-05-19): updated to drive the new
 * RolePermission system in lib/permissions.ts instead of the legacy
 * CONTACTS_WRITE_ROLES set (PR #187).  The gates now resolve role via
 * next-auth's getServerSession + passPermissionGate(CONTACTS_*), so each
 * test stamps the role directly on `session.user` and the real
 * passPermissionGate / hasPermission logic runs.
 *
 * Confirms /api/contacts (GET / POST / PATCH / DELETE) enforces the canonical
 * permission gate defined in lib/contacts/api-gate.ts and rejects insufficient
 * sessions with 401 / 403 while permitting the documented roles.
 *
 * Mocks googleapis to keep route handlers off the live Sheets API.
 */

export {}; // module-scope guard

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock('@/lib/backend-config', () => ({
  getBackendSheetId: jest.fn(() => 'test-sheet-id'),
}));

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

const mockSheetsAppend = jest.fn().mockResolvedValue({ data: {} });
const mockSheetsBatchUpdate = jest.fn().mockResolvedValue({ data: {} });
const mockSheetsGet = jest.fn().mockResolvedValue({
  data: { sheets: [{ properties: { title: 'Contacts', sheetId: 42 } }] },
});
const mockValuesGet = jest.fn().mockResolvedValue({ data: { values: [] } });
const mockValuesBatchGet = jest.fn().mockResolvedValue({
  data: { valueRanges: [{ values: [] }, { values: [] }] },
});
const mockValuesBatchUpdate = jest.fn().mockResolvedValue({ data: {} });

jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(() => ({
      spreadsheets: {
        get: mockSheetsGet,
        batchUpdate: mockSheetsBatchUpdate,
        values: {
          append: mockSheetsAppend,
          get: mockValuesGet,
          batchGet: mockValuesBatchGet,
          batchUpdate: mockValuesBatchUpdate,
        },
      },
    })),
  },
}));

function contactsSession(role: string | null, email?: string | null) {
  if (role === null) return null;
  const resolvedEmail = email ?? `${role}@kulaglass.com`;
  return { user: { email: resolvedEmail, role } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValuesGet.mockResolvedValue({ data: { values: [['cnt_1', 'org_1', 'Existing', '', '', '', '', 'FALSE', '', '']] } });
  mockValuesBatchGet.mockResolvedValue({ data: { valueRanges: [{ values: [] }, { values: [] }] } });
  // Run with default permission map regardless of env, and reset the memoized
  // permissions cache so each test sees defaults fresh.
  delete process.env.ROLE_PERMISSIONS_JSON;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const perms = require('@/lib/permissions');
  perms.resetRolePermissionsCacheForTests();
});

// ═══ GET /api/contacts — auth gate (CONTACTS_VIEW) ═════════════════════════

describe('GET /api/contacts — auth gate', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import('@/app/api/contacts/route');
    const res = await GET(new Request('http://t/api/contacts'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for role=none (signed in but not on roster)', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('none', 'unknown@kulaglass.com'));
    const { GET } = await import('@/app/api/contacts/route');
    const res = await GET(new Request('http://t/api/contacts'));
    expect(res.status).toBe(403);
  });

  it('returns 200 for field role (any authenticated user can read)', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('field'));
    const { GET } = await import('@/app/api/contacts/route');
    const res = await GET(new Request('http://t/api/contacts'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('service_pm'));
    const { GET } = await import('@/app/api/contacts/route');
    const res = await GET(new Request('http://t/api/contacts'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('super_admin'));
    const { GET } = await import('@/app/api/contacts/route');
    const res = await GET(new Request('http://t/api/contacts'));
    expect(res.status).toBe(200);
  });
});

// ═══ POST /api/contacts — write gate (CONTACTS_WRITE) ══════════════════════

describe('POST /api/contacts — write gate', () => {
  const body = JSON.stringify({ org_id: 'org_1', name: 'New Contact' });

  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('field'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for super (Superintendent) — tightened from email-endsWith', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('super'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('pm'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for business_admin', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('business_admin'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('super_admin'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('service_pm'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for estimator', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('estimator'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for sales', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('sales'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });
});

// ═══ PATCH /api/contacts — write gate (CONTACTS_WRITE) ═════════════════════

describe('PATCH /api/contacts — write gate', () => {
  const body = JSON.stringify({ contact_id: 'cnt_1', name: 'Updated' });

  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/contacts/route');
    const res = await PATCH(new Request('http://t/api/contacts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('field'));
    const { PATCH } = await import('@/app/api/contacts/route');
    const res = await PATCH(new Request('http://t/api/contacts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('pm'));
    const { PATCH } = await import('@/app/api/contacts/route');
    const res = await PATCH(new Request('http://t/api/contacts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('service_pm'));
    const { PATCH } = await import('@/app/api/contacts/route');
    const res = await PATCH(new Request('http://t/api/contacts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });
});

// ═══ DELETE /api/contacts — write gate (CONTACTS_WRITE) ════════════════════

describe('DELETE /api/contacts — write gate', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/contacts/route');
    const res = await DELETE(new Request('http://t/api/contacts?contact_id=cnt_1', { method: 'DELETE' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for admin role — tightened from email-endsWith', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('admin'));
    const { DELETE } = await import('@/app/api/contacts/route');
    const res = await DELETE(new Request('http://t/api/contacts?contact_id=cnt_1', { method: 'DELETE' }));
    expect(res.status).toBe(403);
  });

  it('returns 200 for super_admin', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('super_admin'));
    const { DELETE } = await import('@/app/api/contacts/route');
    const res = await DELETE(new Request('http://t/api/contacts?contact_id=cnt_1', { method: 'DELETE' }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for pm', async () => {
    mockGetServerSession.mockResolvedValue(contactsSession('pm'));
    const { PATCH } = await import('@/app/api/contacts/route');
    const res = await PATCH(new Request('http://t/api/contacts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contact_id: 'cnt_1', name: 'Y' }),
    }));
    expect(res.status).toBe(200);
  });
});

// ═══ CONTACTS-PERMISSIONS dispatch — new RolePermission coverage ═══════════

describe('CONTACTS_VIEW / CONTACTS_WRITE — env override', () => {
  it('honors ROLE_PERMISSIONS_JSON widening CONTACTS_WRITE to a new role', async () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      pm: ['CONTACTS_VIEW', 'CONTACTS_WRITE'],
      business_admin: ['CONTACTS_VIEW', 'CONTACTS_WRITE'],
      super_admin: ['CONTACTS_VIEW', 'CONTACTS_WRITE'],
      service_pm: ['CONTACTS_VIEW', 'CONTACTS_WRITE'],
      estimator: ['CONTACTS_VIEW', 'CONTACTS_WRITE'],
      sales: ['CONTACTS_VIEW', 'CONTACTS_WRITE'],
      // Widen super (Superintendent) to write contacts.
      super: ['CONTACTS_VIEW', 'CONTACTS_WRITE'],
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const perms = require('@/lib/permissions');
    perms.resetRolePermissionsCacheForTests();

    mockGetServerSession.mockResolvedValue(contactsSession('super'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ org_id: 'org_1', name: 'New Contact' }),
    }));
    expect(res.status).toBe(200);
  });

  it('honors ROLE_PERMISSIONS_JSON narrowing CONTACTS_VIEW (field denied)', async () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      pm: ['CONTACTS_VIEW', 'CONTACTS_WRITE'],
      business_admin: ['CONTACTS_VIEW', 'CONTACTS_WRITE'],
      super_admin: ['CONTACTS_VIEW', 'CONTACTS_WRITE'],
      // field omitted → no CONTACTS_VIEW.
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const perms = require('@/lib/permissions');
    perms.resetRolePermissionsCacheForTests();

    mockGetServerSession.mockResolvedValue(contactsSession('field'));
    const { GET } = await import('@/app/api/contacts/route');
    const res = await GET(new Request('http://t/api/contacts'));
    expect(res.status).toBe(403);
  });
});
