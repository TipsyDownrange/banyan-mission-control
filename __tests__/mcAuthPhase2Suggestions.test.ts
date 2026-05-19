/**
 * MC-AUTH-PHASE2-SUGGESTIONS — Suggestions auth migration route tests.
 *
 * SUGGESTIONS-PERMISSIONS dispatch (2026-05-19): updated to drive the new
 * RolePermission system in lib/permissions.ts instead of the legacy
 * SUGGESTIONS_REVIEW_ROLES set (PR #190).  The gates now resolve role via
 * next-auth's getServerSession + passPermissionGate(SUGGESTIONS_*), so each
 * test stamps the role directly on `session.user` and the real
 * passPermissionGate / hasPermission logic runs.
 *
 * Confirms /api/suggestions (POST submit / GET review list) enforces the
 * canonical permission gates defined in lib/suggestions/api-gate.ts and
 * rejects insufficient sessions with 401 / 403 while permitting the
 * documented roles.
 *
 * Mocks googleapis so handlers stay off the live Sheets API.
 */

export {}; // mark this file as a module so top-level consts don't collide with peer test files

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

function suggestionsSession(role: string | null, email?: string | null) {
  if (role === null) return null;
  const resolvedEmail = email ?? `${role}@kulaglass.com`;
  return { user: { email: resolvedEmail, role } };
}

beforeEach(() => {
  jest.clearAllMocks();
  suggestionsSheetsGetMock.mockResolvedValue({ data: { values: [] } });
  delete process.env.ROLE_PERMISSIONS_JSON;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const perms = require('@/lib/permissions');
  perms.resetRolePermissionsCacheForTests();
});

// ═══ POST /api/suggestions — auth gate (SUGGESTIONS_VIEW) ══════════════════

describe('POST /api/suggestions — auth gate', () => {
  const body = JSON.stringify({ description: 'It would be nice if ...', name: 'Tester' });

  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for role=none (signed in but not on roster)', async () => {
    mockGetServerSession.mockResolvedValue(suggestionsSession('none', 'unknown@kulaglass.com'));
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 200 for field role (any authenticated user can submit)', async () => {
    mockGetServerSession.mockResolvedValue(suggestionsSession('field'));
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
    mockGetServerSession.mockResolvedValue(suggestionsSession('sales'));
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for estimator', async () => {
    mockGetServerSession.mockResolvedValue(suggestionsSession('estimator'));
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockGetServerSession.mockResolvedValue(suggestionsSession('super_admin'));
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 400 when description is missing (after passing gate)', async () => {
    mockGetServerSession.mockResolvedValue(suggestionsSession('pm'));
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'No body here' }),
    }));
    expect(res.status).toBe(400);
  });
});

// ═══ GET /api/suggestions — review gate (SUGGESTIONS_REVIEW) ═══════════════

describe('GET /api/suggestions — review gate', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role — tightened from email-endsWith', async () => {
    mockGetServerSession.mockResolvedValue(suggestionsSession('field'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for sales — tightened from email-endsWith', async () => {
    mockGetServerSession.mockResolvedValue(suggestionsSession('sales'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for estimator — tightened from email-endsWith', async () => {
    mockGetServerSession.mockResolvedValue(suggestionsSession('estimator'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockGetServerSession.mockResolvedValue(suggestionsSession('pm'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(200);
    expect(suggestionsSheetsGetMock).toHaveBeenCalled();
  });

  it('returns 200 for service_pm', async () => {
    mockGetServerSession.mockResolvedValue(suggestionsSession('service_pm'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for business_admin', async () => {
    mockGetServerSession.mockResolvedValue(suggestionsSession('business_admin'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockGetServerSession.mockResolvedValue(suggestionsSession('super_admin'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(200);
  });
});

// ═══ Role set sanity ═══════════════════════════════════════════════════════

describe('SUGGESTIONS_REVIEW_ROLES role set (legacy export)', () => {
  it('contains exactly pm, business_admin, super_admin, service_pm', async () => {
    const { SUGGESTIONS_REVIEW_ROLES } = await import('@/lib/suggestions/api-gate');
    expect(Array.from(SUGGESTIONS_REVIEW_ROLES).sort()).toEqual(
      ['business_admin', 'pm', 'service_pm', 'super_admin'],
    );
  });
});

// ═══ SUGGESTIONS-PERMISSIONS dispatch — new RolePermission coverage ════════

describe('SUGGESTIONS_VIEW / SUGGESTIONS_REVIEW — env override', () => {
  it('honors ROLE_PERMISSIONS_JSON widening SUGGESTIONS_REVIEW to a new role', async () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      pm: ['SUGGESTIONS_VIEW', 'SUGGESTIONS_REVIEW'],
      business_admin: ['SUGGESTIONS_VIEW', 'SUGGESTIONS_REVIEW'],
      super_admin: ['SUGGESTIONS_VIEW', 'SUGGESTIONS_REVIEW'],
      service_pm: ['SUGGESTIONS_VIEW', 'SUGGESTIONS_REVIEW'],
      // Widen estimator to review.
      estimator: ['SUGGESTIONS_VIEW', 'SUGGESTIONS_REVIEW'],
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const perms = require('@/lib/permissions');
    perms.resetRolePermissionsCacheForTests();

    mockGetServerSession.mockResolvedValue(suggestionsSession('estimator'));
    const { GET } = await import('@/app/api/suggestions/route');
    const res = await GET(new Request('http://t/api/suggestions'));
    expect(res.status).toBe(200);
  });

  it('honors ROLE_PERMISSIONS_JSON narrowing SUGGESTIONS_VIEW (field denied)', async () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      pm: ['SUGGESTIONS_VIEW', 'SUGGESTIONS_REVIEW'],
      business_admin: ['SUGGESTIONS_VIEW', 'SUGGESTIONS_REVIEW'],
      super_admin: ['SUGGESTIONS_VIEW', 'SUGGESTIONS_REVIEW'],
      // field omitted → no SUGGESTIONS_VIEW (submit blocked).
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const perms = require('@/lib/permissions');
    perms.resetRolePermissionsCacheForTests();

    mockGetServerSession.mockResolvedValue(suggestionsSession('field'));
    const { POST } = await import('@/app/api/suggestions/route');
    const res = await POST(new Request('http://t/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'x', name: 'y' }),
    }));
    expect(res.status).toBe(403);
  });
});
