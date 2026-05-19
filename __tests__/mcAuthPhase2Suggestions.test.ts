/**
 * MC-AUTH-PHASE2-SUGGESTIONS — Suggestions auth migration route tests.
 *
 * Confirms /api/suggestions (POST submit / GET review list) enforces the
 * canonical role gates defined in lib/suggestions/api-gate.ts and rejects
 * insufficient sessions with 401 / 403 while permitting the documented
 * roles.
 *
 * Mocks @/lib/permissions so the suite can exercise the gates without
 * standing up next-auth, and mocks googleapis so handlers stay off the
 * live Sheets API.
 */

export {}; // mark this file as a module so top-level consts don't collide with peer test files

const suggestionsCheckPermissionMock = jest.fn();
jest.mock('@/lib/permissions', () => ({
  checkPermission: (...args: unknown[]) => suggestionsCheckPermissionMock(...args),
}));

jest.mock('@/lib/backend-config', () => ({
  getBackendSheetId: jest.fn(() => 'test-sheet-id'),
}));

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

const suggestionsSheetsAppendMock = jest.fn().mockResolvedValue({ data: {} });
const suggestionsSheetsGetMock = jest.fn().mockResolvedValue({ data: { values: [] } });

jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(() => ({
      spreadsheets: {
        values: {
          append: suggestionsSheetsAppendMock,
          get: suggestionsSheetsGetMock,
        },
      },
    })),
  },
}));

function suggestionsPermResult(
  role: string,
  email: string | null = role === 'none' ? null : `${role}@kulaglass.com`,
) {
  return { allowed: true, role, email };
}

beforeEach(() => {
  jest.clearAllMocks();
  suggestionsSheetsGetMock.mockResolvedValue({ data: { values: [] } });
});

// ═══ POST /api/suggestions — auth gate (any signed-in kulaglass user) ══════

describe('POST /api/suggestions — auth gate', () => {
  const body = JSON.stringify({ description: 'It would be nice if ...', name: 'Tester' });

  it('returns 401 when no session', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('none', null));
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for role=none (signed in but not on roster)', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('none', 'unknown@kulaglass.com'));
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 200 for field role (any authenticated user can submit)', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('field'));
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
    expect(suggestionsSheetsAppendMock).toHaveBeenCalled();
  });

  it('returns 200 for sales', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('sales'));
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for estimator', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('estimator'));
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('super_admin'));
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 400 when description is missing (after passing gate)', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('pm'));
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'No body here' }),
    }));
    expect(res.status).toBe(400);
  });
});

// ═══ GET /api/suggestions — review gate (PM/admin triage) ══════════════════

describe('GET /api/suggestions — review gate', () => {
  it('returns 401 when no session', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('none', null));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role — tightened from email-endsWith', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('field'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for sales — tightened from email-endsWith', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('sales'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for estimator — tightened from email-endsWith', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('estimator'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('pm'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(200);
    expect(suggestionsSheetsGetMock).toHaveBeenCalled();
  });

  it('returns 200 for service_pm', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('service_pm'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for business_admin', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('business_admin'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    suggestionsCheckPermissionMock.mockResolvedValue(suggestionsPermResult('super_admin'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(200);
  });
});

// ═══ Role set sanity ═══════════════════════════════════════════════════════

describe('SUGGESTIONS_REVIEW_ROLES role set', () => {
  it('contains exactly pm, business_admin, super_admin, service_pm', async () => {
    const { SUGGESTIONS_REVIEW_ROLES } = await import('@/lib/suggestions/api-gate');
    expect(Array.from(SUGGESTIONS_REVIEW_ROLES).sort()).toEqual(
      ['business_admin', 'pm', 'service_pm', 'super_admin'],
    );
  });
});
