/**
 * MC-AUTH-PHASE2-WORK-BREAKDOWN — Work Breakdown auth migration route tests.
 *
 * WORK-BREAKDOWN-PERMISSIONS dispatch (2026-05-19): updated to drive the new
 * RolePermission system in lib/permissions.ts instead of the legacy
 * WORK_BREAKDOWN_WRITE_ROLES set (PR #193).  The gates now resolve role via
 * next-auth's getServerSession + passPermissionGate(WORK_BREAKDOWN_*), so
 * each test stamps the role directly on `session.user` and the real
 * passPermissionGate / hasPermission logic runs.
 *
 * Confirms /api/work-breakdown/[jobId] (GET / POST / PATCH / DELETE) enforces
 * the canonical permission gate defined in lib/work-breakdown/api-gate.ts and
 * rejects insufficient sessions with 401 / 403 while permitting the
 * documented roles.
 *
 * Mocks googleapis + the project's helper modules to keep route handlers off
 * the live Sheets / event bus.
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

jest.mock('@/lib/normalize-kid', () => ({
  normalizeKID: (v: string) => v,
  kidsMatch: (a: string, b: string) => a === b,
}));

jest.mock('@/lib/schemas', () => ({
  validateHeaders: jest.fn(() => ({ valid: true })),
  INSTALL_PLANS_SCHEMA: [],
  INSTALL_STEPS_SCHEMA: [],
}));

const mockEmitMCEvent = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/events', () => ({
  emitMCEvent: (...args: unknown[]) => mockEmitMCEvent(...args),
}));

const mockValuesGet = jest.fn();
const mockValuesAppend = jest.fn().mockResolvedValue({ data: {} });
const mockValuesUpdate = jest.fn().mockResolvedValue({ data: {} });
const mockValuesBatchGet = jest.fn().mockResolvedValue({ data: { valueRanges: [] } });

jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(() => ({
      spreadsheets: {
        values: {
          get: mockValuesGet,
          append: mockValuesAppend,
          update: mockValuesUpdate,
          batchGet: mockValuesBatchGet,
        },
      },
    })),
  },
}));

function wbSession(role: string | null, email?: string | null) {
  if (role === null) return null;
  const resolvedEmail = email ?? `${role}@kulaglass.com`;
  return { user: { email: resolvedEmail, role } };
}

const JOB_ID = 'WO-26-0001';

function jsonRequest(method: string, body?: unknown): Request {
  return new Request(`http://t/api/work-breakdown/${JOB_ID}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function paramsFor(jobId: string = JOB_ID) {
  return { params: Promise.resolve({ jobId }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default Sheets stub: empty plans/steps/completions/headers; routes that need
  // specific row fixtures override per-test.
  mockValuesGet.mockResolvedValue({ data: { values: [] } });
  delete process.env.ROLE_PERMISSIONS_JSON;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const perms = require('@/lib/permissions');
  perms.resetRolePermissionsCacheForTests();
});

// ═══ GET /api/work-breakdown/[jobId] — auth gate (WORK_BREAKDOWN_VIEW) ══════

describe('GET /api/work-breakdown/[jobId] — auth gate', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 403 for role=none (signed in but not on roster)', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('none', 'unknown@kulaglass.com'));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 200 for field role (any authenticated user can read)', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('field'));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for pm', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('pm'));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('service_pm'));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for estimator (WOEstimatePanel read path)', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('estimator'));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('super_admin'));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(200);
  });
});

// ═══ POST /api/work-breakdown/[jobId] — write gate (WORK_BREAKDOWN_WRITE) ═══

describe('POST /api/work-breakdown/[jobId] — write gate', () => {
  const planBody = {
    type: 'plan',
    system_type: 'Glazing',
    location: 'A1',
    estimated_total_hours: 4,
    estimated_qty: 1,
  };

  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('field'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 403 for super (Field Superintendent) — tightened from email-endsWith', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('super'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 403 for sales — tightened from email-endsWith', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('sales'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('pm'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('service_pm'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for estimator', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('estimator'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for business_admin', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('business_admin'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('super_admin'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(200);
  });

  it('threads the gate actorEmail through to emitMCEvent submitted_by', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('pm', 'pm-user@kulaglass.com'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(200);
    expect(mockEmitMCEvent).toHaveBeenCalledTimes(1);
    expect(mockEmitMCEvent.mock.calls[0][0].submitted_by).toBe('pm-user@kulaglass.com');
  });
});

// ═══ PATCH /api/work-breakdown/[jobId] — write gate ════════════════════════

describe('PATCH /api/work-breakdown/[jobId] — write gate', () => {
  const planPatch = { type: 'plan', id: 'IP-1', system_type: 'Updated' };

  beforeEach(() => {
    // PATCH 'plan' reads Install_Plans; return a single matching row.
    mockValuesGet.mockResolvedValue({
      data: { values: [['IP-1', JOB_ID, 'Glazing', 'A1', 4, 1, 'Active']] },
    });
  });

  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await PATCH(jsonRequest('PATCH', planPatch), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('field'));
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await PATCH(jsonRequest('PATCH', planPatch), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 403 for super (Field Superintendent) — tightened from email-endsWith', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('super'));
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await PATCH(jsonRequest('PATCH', planPatch), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('pm'));
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await PATCH(jsonRequest('PATCH', planPatch), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('service_pm'));
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await PATCH(jsonRequest('PATCH', planPatch), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for estimator', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('estimator'));
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await PATCH(jsonRequest('PATCH', planPatch), paramsFor());
    expect(res.status).toBe(200);
  });
});

// ═══ DELETE /api/work-breakdown/[jobId] — write gate ═══════════════════════

describe('DELETE /api/work-breakdown/[jobId] — write gate', () => {
  const deleteBody = { type: 'plan', id: 'IP-1' };

  beforeEach(() => {
    mockValuesGet.mockResolvedValue({
      data: { values: [['IP-1', JOB_ID, 'Glazing', 'A1', 4, 1, 'Active']] },
    });
  });

  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await DELETE(jsonRequest('DELETE', deleteBody), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('field'));
    const { DELETE } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await DELETE(jsonRequest('DELETE', deleteBody), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 403 for super (Field Superintendent) — tightened from email-endsWith', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('super'));
    const { DELETE } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await DELETE(jsonRequest('DELETE', deleteBody), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 403 for admin role — tightened from email-endsWith', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('admin'));
    const { DELETE } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await DELETE(jsonRequest('DELETE', deleteBody), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('pm'));
    const { DELETE } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await DELETE(jsonRequest('DELETE', deleteBody), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('super_admin'));
    const { DELETE } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await DELETE(jsonRequest('DELETE', deleteBody), paramsFor());
    expect(res.status).toBe(200);
  });
});

// ═══ Role set sanity ════════════════════════════════════════════════════════

describe('WORK_BREAKDOWN_WRITE_ROLES role set (legacy export)', () => {
  it('contains exactly pm, service_pm, estimator, business_admin, super_admin', async () => {
    const { WORK_BREAKDOWN_WRITE_ROLES } = await import('@/lib/work-breakdown/api-gate');
    expect(Array.from(WORK_BREAKDOWN_WRITE_ROLES).sort()).toEqual([
      'business_admin',
      'estimator',
      'pm',
      'service_pm',
      'super_admin',
    ]);
  });
});

// ═══ Gate behavior — direct calls ═══════════════════════════════════════════

describe('passWorkBreakdownAuthGate — direct gate calls', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { passWorkBreakdownAuthGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownAuthGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it('returns 403 when role is none even if email present', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('none', 'unknown@kulaglass.com'));
    const { passWorkBreakdownAuthGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownAuthGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it('permits pm with email', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('pm'));
    const { passWorkBreakdownAuthGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownAuthGate(new Request('http://t/x'));
    expect(gate.ok).toBe(true);
  });
});

describe('passWorkBreakdownWriteGate — direct gate calls', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { passWorkBreakdownWriteGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it('returns 403 for field role (not in write set)', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('field'));
    const { passWorkBreakdownWriteGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it('returns 403 for super (not in write set)', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('super'));
    const { passWorkBreakdownWriteGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it('permits estimator', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('estimator'));
    const { passWorkBreakdownWriteGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(true);
  });

  it('permits service_pm', async () => {
    mockGetServerSession.mockResolvedValue(wbSession('service_pm'));
    const { passWorkBreakdownWriteGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(true);
  });
});

// ═══ WORK-BREAKDOWN-PERMISSIONS dispatch — new RolePermission coverage ═════

describe('WORK_BREAKDOWN_VIEW / WORK_BREAKDOWN_WRITE — env override', () => {
  it('honors ROLE_PERMISSIONS_JSON widening WORK_BREAKDOWN_WRITE to super', async () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      pm: ['WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE'],
      service_pm: ['WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE'],
      estimator: ['WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE'],
      business_admin: ['WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE'],
      super_admin: ['WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE'],
      // Widen super (field) to write.
      super: ['WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE'],
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const perms = require('@/lib/permissions');
    perms.resetRolePermissionsCacheForTests();

    mockGetServerSession.mockResolvedValue(wbSession('super'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', {
      type: 'plan',
      system_type: 'Glazing',
      location: 'A1',
      estimated_total_hours: 4,
      estimated_qty: 1,
    }), paramsFor());
    expect(res.status).toBe(200);
  });

  it('honors ROLE_PERMISSIONS_JSON narrowing WORK_BREAKDOWN_VIEW (field denied)', async () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      pm: ['WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE'],
      business_admin: ['WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE'],
      super_admin: ['WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE'],
      // field omitted → no WORK_BREAKDOWN_VIEW.
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const perms = require('@/lib/permissions');
    perms.resetRolePermissionsCacheForTests();

    mockGetServerSession.mockResolvedValue(wbSession('field'));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(403);
  });
});
