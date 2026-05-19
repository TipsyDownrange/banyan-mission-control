/**
 * MC-AUTH-PHASE2-DAILY-REPORT — Daily Report auth migration route tests.
 *
 * DAILY-REPORT-PERMISSIONS dispatch (2026-05-19): updated to drive the new
 * RolePermission system in lib/permissions.ts instead of the legacy
 * DAILY_REPORT_WRITE_ROLES set.  The gates now resolve role via next-auth's
 * getServerSession + passPermissionGate(DAILY_REPORT_*), so each test stamps
 * the role directly on `session.user` and the real passPermissionGate /
 * hasPermission logic runs.
 *
 * Confirms POST /api/daily-report/pdf enforces the canonical permission gate
 * (DAILY_REPORT_VIEW) and rejects insufficient sessions with 401 while
 * permitting any authenticated kulaglass.com user with a resolved role.  The
 * route's secondary auth path — the shared INTERNAL_API_KEY header used by
 * the FA server-to-server PDF auto-trigger — is also covered: a valid key
 * must bypass the session gate entirely.
 *
 * Mocks next-auth's getServerSession to exercise the gate without standing
 * up next-auth.  Mocks googleapis + @/lib/pdf-daily-report to keep the route
 * off the live Sheets / Drive APIs and PDF renderer.
 */

export {};

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

jest.mock('@/lib/env', () => ({
  isStaging: jest.fn(() => false),
}));

jest.mock('@/lib/drive-wo-folder', () => ({
  resolveStagingDriveParentId: jest.fn(() => 'staging-parent'),
}));

const mockGenerateDailyReportPDF = jest.fn().mockResolvedValue(Buffer.from('PDF'));
jest.mock('@/lib/pdf-daily-report', () => ({
  generateDailyReportPDF: (...args: unknown[]) => mockGenerateDailyReportPDF(...args),
}));

jest.mock('@/lib/photo-attribution', () => ({
  formatAttributionCaption: jest.fn(() => 'caption'),
}));

const EVENT_ID = 'evt-001';
const KID = 'WO-1001';

// Field_Events_V1 row matching the column indices in the route under test.
// Index 0 event_id, 1 target_kID, 3 occurred_at, 5 performed_by, 23 work_performed.
function makeEventRow(): string[] {
  const row: string[] = new Array(32).fill('');
  row[0] = EVENT_ID;
  row[1] = KID;
  row[3] = '2026-05-19T08:00:00Z';
  row[5] = 'karl@kulaglass.com';
  row[23] = 'Glazing crew installed storefront.';
  return row;
}

// Service_Work_Orders row matching SWO indices (0 wo_id, 23 folder_url).
function makeSwoRow(): string[] {
  const row: string[] = new Array(24).fill('');
  row[0] = KID;
  row[1] = KID;
  row[2] = 'Test Project';
  row[5] = 'Oahu';
  row[23] = 'https://drive.google.com/drive/folders/folder-id-abc';
  return row;
}

const mockValuesGet = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(() => ({
      spreadsheets: {
        values: { get: mockValuesGet },
      },
    })),
    drive: jest.fn(() => ({ files: { list: jest.fn(), create: jest.fn() } })),
  },
}));

function drSession(role: string | null, email?: string | null) {
  if (role === null) return null;
  const resolvedEmail = email ?? `${role}@kulaglass.com`;
  return { user: { email: resolvedEmail, role } };
}

function pdfRequest(headers: Record<string, string> = {}, body: Record<string, unknown> = { event_id: EVENT_ID }): Request {
  return new Request('http://t/api/daily-report/pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.INTERNAL_API_KEY;
  // Run with default permission map regardless of env, and reset the memoized
  // permissions cache so each test sees defaults fresh.
  delete process.env.ROLE_PERMISSIONS_JSON;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const perms = require('@/lib/permissions');
  perms.resetRolePermissionsCacheForTests();

  // Default googleapis stub: Field_Events_V1 has the test event, Users_Roles + Core_Entities empty,
  // Service_Work_Orders has the matching WO row.
  mockValuesGet.mockImplementation(({ range }: { range: string }) => {
    if (range.startsWith('Core_Entities')) return Promise.resolve({ data: { values: [] } });
    if (range.startsWith('Users_Roles')) return Promise.resolve({ data: { values: [] } });
    if (range.startsWith('Field_Events_V1')) return Promise.resolve({ data: { values: [makeEventRow()] } });
    if (range.startsWith('Service_Work_Orders')) return Promise.resolve({ data: { values: [makeSwoRow()] } });
    return Promise.resolve({ data: { values: [] } });
  });
});

// ═══ POST /api/daily-report/pdf — session auth gate ═════════════════════════

describe('POST /api/daily-report/pdf — auth gate (session path)', () => {
  it('returns 401 when no session and no internal key', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/daily-report/pdf/route');
    const res = await POST(pdfRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 for role=none (signed in but not on roster)', async () => {
    mockGetServerSession.mockResolvedValue(drSession('none', 'unknown@kulaglass.com'));
    const { POST } = await import('@/app/api/daily-report/pdf/route');
    const res = await POST(pdfRequest());
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockGetServerSession.mockResolvedValue(drSession('pm'));
    const { POST } = await import('@/app/api/daily-report/pdf/route');
    const res = await POST(pdfRequest());
    expect(res.status).toBe(200);
    expect(mockGenerateDailyReportPDF).toHaveBeenCalled();
  });

  it('returns 200 for business_admin', async () => {
    mockGetServerSession.mockResolvedValue(drSession('business_admin'));
    const { POST } = await import('@/app/api/daily-report/pdf/route');
    const res = await POST(pdfRequest());
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockGetServerSession.mockResolvedValue(drSession('super_admin'));
    const { POST } = await import('@/app/api/daily-report/pdf/route');
    const res = await POST(pdfRequest());
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockGetServerSession.mockResolvedValue(drSession('service_pm'));
    const { POST } = await import('@/app/api/daily-report/pdf/route');
    const res = await POST(pdfRequest());
    expect(res.status).toBe(200);
  });

  it('returns 200 for super (field superintendent)', async () => {
    mockGetServerSession.mockResolvedValue(drSession('super'));
    const { POST } = await import('@/app/api/daily-report/pdf/route');
    const res = await POST(pdfRequest());
    expect(res.status).toBe(200);
  });

  it('returns 200 for field role (any authenticated user can read their own PDF)', async () => {
    mockGetServerSession.mockResolvedValue(drSession('field'));
    const { POST } = await import('@/app/api/daily-report/pdf/route');
    const res = await POST(pdfRequest());
    expect(res.status).toBe(200);
  });

  it('returns 400 when event_id is missing (after passing gate)', async () => {
    mockGetServerSession.mockResolvedValue(drSession('pm'));
    const { POST } = await import('@/app/api/daily-report/pdf/route');
    const res = await POST(pdfRequest({}, {}));
    expect(res.status).toBe(400);
  });
});

// ═══ POST /api/daily-report/pdf — INTERNAL_API_KEY bypass (FA server-to-server)

describe('POST /api/daily-report/pdf — internal key bypass', () => {
  it('skips the session gate when X-Internal-Key matches INTERNAL_API_KEY', async () => {
    process.env.INTERNAL_API_KEY = 'fa-secret-key';
    // getServerSession must never be called when the internal key matches.
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/daily-report/pdf/route');
    const res = await POST(pdfRequest({ 'X-Internal-Key': 'fa-secret-key' }));
    expect(res.status).toBe(200);
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  it('falls through to the session gate when X-Internal-Key does not match', async () => {
    process.env.INTERNAL_API_KEY = 'fa-secret-key';
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/daily-report/pdf/route');
    const res = await POST(pdfRequest({ 'X-Internal-Key': 'wrong-key' }));
    expect(res.status).toBe(401);
    expect(mockGetServerSession).toHaveBeenCalled();
  });

  it('falls through to the session gate when X-Internal-Key is empty', async () => {
    process.env.INTERNAL_API_KEY = 'fa-secret-key';
    mockGetServerSession.mockResolvedValue(drSession('pm'));
    const { POST } = await import('@/app/api/daily-report/pdf/route');
    const res = await POST(pdfRequest({ 'X-Internal-Key': '' }));
    expect(res.status).toBe(200);
    expect(mockGetServerSession).toHaveBeenCalled();
  });
});

// ═══ Role set sanity (legacy export) ════════════════════════════════════════
//
// DAILY_REPORT_WRITE_ROLES is @deprecated and no longer referenced by any
// active call site, but kept exported for backward-compat with anything that
// imported it before the DAILY-REPORT-PERMISSIONS migration.

describe('DAILY_REPORT_WRITE_ROLES role set (legacy export)', () => {
  it('contains exactly pm, business_admin, super_admin, service_pm, super', async () => {
    const { DAILY_REPORT_WRITE_ROLES } = await import('@/lib/daily-report/api-gate');
    expect(Array.from(DAILY_REPORT_WRITE_ROLES).sort()).toEqual([
      'business_admin',
      'pm',
      'service_pm',
      'super',
      'super_admin',
    ]);
  });
});

// ═══ passDailyReportWriteGate gate behavior ════════════════════════════════

describe('passDailyReportWriteGate — direct gate calls', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { passDailyReportWriteGate } = await import('@/lib/daily-report/api-gate');
    const gate = await passDailyReportWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it('returns 403 for field role (not in write set)', async () => {
    mockGetServerSession.mockResolvedValue(drSession('field'));
    const { passDailyReportWriteGate } = await import('@/lib/daily-report/api-gate');
    const gate = await passDailyReportWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it('returns 403 for estimator (not in write set)', async () => {
    mockGetServerSession.mockResolvedValue(drSession('estimator'));
    const { passDailyReportWriteGate } = await import('@/lib/daily-report/api-gate');
    const gate = await passDailyReportWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it('permits pm', async () => {
    mockGetServerSession.mockResolvedValue(drSession('pm'));
    const { passDailyReportWriteGate } = await import('@/lib/daily-report/api-gate');
    const gate = await passDailyReportWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(true);
  });

  it('permits super (field superintendent)', async () => {
    mockGetServerSession.mockResolvedValue(drSession('super'));
    const { passDailyReportWriteGate } = await import('@/lib/daily-report/api-gate');
    const gate = await passDailyReportWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(true);
  });
});

// ═══ DAILY-REPORT-PERMISSIONS — RolePermission system coverage ══════════════
//
// Exercises the new DAILY_REPORT_VIEW / DAILY_REPORT_WRITE permissions added
// to lib/permissions.ts ROLE_PERMISSIONS_DEFAULTS.

describe('passDailyReportAuthGate — DAILY_REPORT_VIEW permission', () => {
  it('returns 403 for role=none (no DAILY_REPORT_VIEW in defaults)', async () => {
    mockGetServerSession.mockResolvedValue(drSession('none', 'unknown@kulaglass.com'));
    const { passDailyReportAuthGate } = await import('@/lib/daily-report/api-gate');
    const gate = await passDailyReportAuthGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it('permits every documented role except none by default', async () => {
    const documented = [
      'super_admin', 'business_admin', 'gm', 'owner', 'service_pm', 'super',
      'pm', 'estimator', 'admin_mgr', 'admin', 'field', 'pm_track', 'sales',
      'catalog_admin',
    ];
    const { passDailyReportAuthGate } = await import('@/lib/daily-report/api-gate');
    for (const role of documented) {
      mockGetServerSession.mockResolvedValueOnce(drSession(role));
      const gate = await passDailyReportAuthGate(new Request('http://t/x'));
      expect(gate.ok).toBe(true);
      if (gate.ok) expect(gate.role).toBe(role);
    }
  });

  it('honors a ROLE_PERMISSIONS_JSON override that revokes DAILY_REPORT_VIEW for field', async () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      pm: ['DAILY_REPORT_VIEW', 'DAILY_REPORT_WRITE'],
      field: [],
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/lib/permissions').resetRolePermissionsCacheForTests();
    mockGetServerSession.mockResolvedValueOnce(drSession('field'));
    const { passDailyReportAuthGate } = await import('@/lib/daily-report/api-gate');
    const gate = await passDailyReportAuthGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });
});

describe('passDailyReportWriteGate — DAILY_REPORT_WRITE permission', () => {
  it('default write set: pm, business_admin, super_admin, service_pm, super', async () => {
    const writeRoles = ['pm', 'business_admin', 'super_admin', 'service_pm', 'super'];
    const { passDailyReportWriteGate } = await import('@/lib/daily-report/api-gate');
    for (const role of writeRoles) {
      mockGetServerSession.mockResolvedValueOnce(drSession(role));
      const gate = await passDailyReportWriteGate(new Request('http://t/x'));
      expect(gate.ok).toBe(true);
    }
  });

  it('rejects roles outside the write set with 403', async () => {
    const readOnlyRoles = ['gm', 'owner', 'estimator', 'admin_mgr', 'admin', 'field', 'pm_track', 'sales', 'catalog_admin'];
    const { passDailyReportWriteGate } = await import('@/lib/daily-report/api-gate');
    for (const role of readOnlyRoles) {
      mockGetServerSession.mockResolvedValueOnce(drSession(role));
      const gate = await passDailyReportWriteGate(new Request('http://t/x'));
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.response.status).toBe(403);
    }
  });

  it('honors a ROLE_PERMISSIONS_JSON override widening DAILY_REPORT_WRITE to estimator', async () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      estimator: ['DAILY_REPORT_VIEW', 'DAILY_REPORT_WRITE'],
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/lib/permissions').resetRolePermissionsCacheForTests();
    mockGetServerSession.mockResolvedValueOnce(drSession('estimator'));
    const { passDailyReportWriteGate } = await import('@/lib/daily-report/api-gate');
    const gate = await passDailyReportWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(true);
  });
});
