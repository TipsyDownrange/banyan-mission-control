/**
 * MC-AUTH-PHASE2-WORK-BREAKDOWN — Work Breakdown auth migration route tests.
 *
 * Confirms /api/work-breakdown/[jobId] (GET / POST / PATCH / DELETE) enforces
 * the canonical role gate defined in lib/work-breakdown/api-gate.ts and
 * rejects insufficient sessions with 401 / 403 while permitting the
 * documented roles.  This is the last module-level migration in the
 * BAN-355 follow-up chain (mirrors PR #187/189/190/191).
 *
 * Mocks @/lib/permissions so the suite can exercise the gate without
 * standing up next-auth.  Mocks googleapis + the project's helper
 * modules to keep route handlers off the live Sheets / event bus.
 */

export {};

const mockCheckPermission = jest.fn();
jest.mock('@/lib/permissions', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
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

function permResult(role: string, email: string | null = role === 'none' ? null : `${role}@kulaglass.com`) {
  return { allowed: true, role, email };
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
});

// ═══ GET /api/work-breakdown/[jobId] — auth gate (any signed-in user) ═══════

describe('GET /api/work-breakdown/[jobId] — auth gate', () => {
  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 401 for role=none (signed in but not on roster)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', 'unknown@kulaglass.com'));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 200 for field role (any authenticated user can read)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('service_pm'));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for estimator (WOEstimatePanel read path)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('estimator'));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super_admin'));
    const { GET } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await GET(jsonRequest('GET'), paramsFor());
    expect(res.status).toBe(200);
  });
});

// ═══ POST /api/work-breakdown/[jobId] — write gate ══════════════════════════

describe('POST /api/work-breakdown/[jobId] — write gate', () => {
  const planBody = {
    type: 'plan',
    system_type: 'Glazing',
    location: 'A1',
    estimated_total_hours: 4,
    estimated_qty: 1,
  };

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 403 for super (Field Superintendent) — tightened from email-endsWith', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 403 for sales — tightened from email-endsWith', async () => {
    mockCheckPermission.mockResolvedValue(permResult('sales'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('service_pm'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for estimator', async () => {
    mockCheckPermission.mockResolvedValue(permResult('estimator'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for business_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('business_admin'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super_admin'));
    const { POST } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await POST(jsonRequest('POST', planBody), paramsFor());
    expect(res.status).toBe(200);
  });

  it('threads the gate actorEmail through to emitMCEvent submitted_by', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm', 'pm-user@kulaglass.com'));
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
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await PATCH(jsonRequest('PATCH', planPatch), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await PATCH(jsonRequest('PATCH', planPatch), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 403 for super (Field Superintendent) — tightened from email-endsWith', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super'));
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await PATCH(jsonRequest('PATCH', planPatch), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await PATCH(jsonRequest('PATCH', planPatch), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('service_pm'));
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await PATCH(jsonRequest('PATCH', planPatch), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for estimator', async () => {
    mockCheckPermission.mockResolvedValue(permResult('estimator'));
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
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { DELETE } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await DELETE(jsonRequest('DELETE', deleteBody), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { DELETE } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await DELETE(jsonRequest('DELETE', deleteBody), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 403 for super (Field Superintendent) — tightened from email-endsWith', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super'));
    const { DELETE } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await DELETE(jsonRequest('DELETE', deleteBody), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 403 for admin role — tightened from email-endsWith', async () => {
    mockCheckPermission.mockResolvedValue(permResult('admin'));
    const { DELETE } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await DELETE(jsonRequest('DELETE', deleteBody), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { DELETE } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await DELETE(jsonRequest('DELETE', deleteBody), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super_admin'));
    const { DELETE } = await import('@/app/api/work-breakdown/[jobId]/route');
    const res = await DELETE(jsonRequest('DELETE', deleteBody), paramsFor());
    expect(res.status).toBe(200);
  });
});

// ═══ Role set sanity ════════════════════════════════════════════════════════

describe('WORK_BREAKDOWN_WRITE_ROLES role set', () => {
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
  it('returns 401 when no email', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { passWorkBreakdownAuthGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownAuthGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it('returns 401 when role is none even if email present', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', 'unknown@kulaglass.com'));
    const { passWorkBreakdownAuthGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownAuthGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it('permits pm with email', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { passWorkBreakdownAuthGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownAuthGate(new Request('http://t/x'));
    expect(gate.ok).toBe(true);
  });
});

describe('passWorkBreakdownWriteGate — direct gate calls', () => {
  it('returns 401 when no email', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { passWorkBreakdownWriteGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it('returns 403 for field role (not in write set)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { passWorkBreakdownWriteGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it('returns 403 for super (not in write set)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super'));
    const { passWorkBreakdownWriteGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it('permits estimator', async () => {
    mockCheckPermission.mockResolvedValue(permResult('estimator'));
    const { passWorkBreakdownWriteGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(true);
  });

  it('permits service_pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('service_pm'));
    const { passWorkBreakdownWriteGate } = await import('@/lib/work-breakdown/api-gate');
    const gate = await passWorkBreakdownWriteGate(new Request('http://t/x'));
    expect(gate.ok).toBe(true);
  });
});
