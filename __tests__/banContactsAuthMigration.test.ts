/**
 * BAN-355 follow-up — Contacts auth migration route tests.
 *
 * Confirms /api/contacts (GET / POST / PATCH / DELETE) enforces the canonical
 * role gate defined in lib/contacts/api-gate.ts and rejects insufficient
 * sessions with 401 / 403 while permitting the documented roles.
 *
 * Mocks @/lib/permissions to drive `checkPermission` so the suite can
 * exercise the gates without standing up next-auth or the backend Sheet.
 * Mocks googleapis to keep route handlers off the live Sheets API.
 */

const mockCheckPermission = jest.fn();
jest.mock('@/lib/permissions', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
}));

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

function permResult(role: string, email: string | null = role === 'none' ? null : `${role}@kulaglass.com`) {
  return { allowed: true, role, email };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValuesGet.mockResolvedValue({ data: { values: [['cnt_1', 'org_1', 'Existing', '', '', '', '', 'FALSE', '', '']] } });
  mockValuesBatchGet.mockResolvedValue({ data: { valueRanges: [{ values: [] }, { values: [] }] } });
});

// ═══ GET /api/contacts — auth gate (any signed-in user) ════════════════════

describe('GET /api/contacts — auth gate', () => {
  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { GET } = await import('@/app/api/contacts/route');
    const res = await GET(new Request('http://t/api/contacts'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for role=none (signed in but not on roster)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', 'unknown@kulaglass.com'));
    const { GET } = await import('@/app/api/contacts/route');
    const res = await GET(new Request('http://t/api/contacts'));
    expect(res.status).toBe(401);
  });

  it('returns 200 for field role (any authenticated user can read)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { GET } = await import('@/app/api/contacts/route');
    const res = await GET(new Request('http://t/api/contacts'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('service_pm'));
    const { GET } = await import('@/app/api/contacts/route');
    const res = await GET(new Request('http://t/api/contacts'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super_admin'));
    const { GET } = await import('@/app/api/contacts/route');
    const res = await GET(new Request('http://t/api/contacts'));
    expect(res.status).toBe(200);
  });
});

// ═══ POST /api/contacts — write gate ═══════════════════════════════════════

describe('POST /api/contacts — write gate', () => {
  const body = JSON.stringify({ org_id: 'org_1', name: 'New Contact' });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for super (Superintendent) — tightened from email-endsWith', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for business_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('business_admin'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super_admin'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('service_pm'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for estimator', async () => {
    mockCheckPermission.mockResolvedValue(permResult('estimator'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for sales', async () => {
    mockCheckPermission.mockResolvedValue(permResult('sales'));
    const { POST } = await import('@/app/api/contacts/route');
    const res = await POST(new Request('http://t/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });
});

// ═══ PATCH /api/contacts — write gate ══════════════════════════════════════

describe('PATCH /api/contacts — write gate', () => {
  const body = JSON.stringify({ contact_id: 'cnt_1', name: 'Updated' });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { PATCH } = await import('@/app/api/contacts/route');
    const res = await PATCH(new Request('http://t/api/contacts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { PATCH } = await import('@/app/api/contacts/route');
    const res = await PATCH(new Request('http://t/api/contacts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { PATCH } = await import('@/app/api/contacts/route');
    const res = await PATCH(new Request('http://t/api/contacts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('service_pm'));
    const { PATCH } = await import('@/app/api/contacts/route');
    const res = await PATCH(new Request('http://t/api/contacts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });
});

// ═══ DELETE /api/contacts — write gate ═════════════════════════════════════

describe('DELETE /api/contacts — write gate', () => {
  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { DELETE } = await import('@/app/api/contacts/route');
    const res = await DELETE(new Request('http://t/api/contacts?contact_id=cnt_1', { method: 'DELETE' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for admin role — tightened from email-endsWith', async () => {
    mockCheckPermission.mockResolvedValue(permResult('admin'));
    const { DELETE } = await import('@/app/api/contacts/route');
    const res = await DELETE(new Request('http://t/api/contacts?contact_id=cnt_1', { method: 'DELETE' }));
    expect(res.status).toBe(403);
  });

  it('returns 200 for super_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super_admin'));
    const { DELETE } = await import('@/app/api/contacts/route');
    const res = await DELETE(new Request('http://t/api/contacts?contact_id=cnt_1', { method: 'DELETE' }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { PATCH } = await import('@/app/api/contacts/route');
    const res = await PATCH(new Request('http://t/api/contacts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contact_id: 'cnt_1', name: 'Y' }),
    }));
    expect(res.status).toBe(200);
  });
});
