/**
 * BAN-355 follow-up — Organizations auth migration route tests.
 *
 * Confirms /api/organizations and its subroutes
 *   - /api/organizations (GET / POST)
 *   - /api/organizations/[orgId] (GET / PATCH)
 *   - /api/organizations/[orgId]/sites (POST / PATCH)
 *   - /api/organizations/[orgId]/contacts (POST / PATCH)
 *   - /api/organizations/governance/relationships (GET / POST / PATCH)
 *   - /api/organizations/governance/merge (GET / POST)
 * enforce the canonical role gate defined in lib/organizations/api-gate.ts and
 * reject insufficient sessions with 401 / 403 while permitting the documented
 * roles.
 *
 * Mocks @/lib/permissions to drive `checkPermission` so the suite can
 * exercise the gates without standing up next-auth or the backend Sheet.
 * Mocks googleapis, organizationGovernance, and events to keep route
 * handlers off the live Sheets API.
 */

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

jest.mock('@/lib/events', () => ({
  emitMCEvent: jest.fn().mockResolvedValue(undefined),
}));

const mockListRelationships = jest.fn().mockResolvedValue([]);
const mockSaveRelationship = jest.fn().mockResolvedValue({});
const mockBuildMergePreview = jest.fn().mockResolvedValue({});
const mockExecuteMerge = jest.fn().mockResolvedValue({});
jest.mock('@/lib/organizationGovernance', () => ({
  getOrganizationGovernanceSheets: jest.fn(() => ({})),
  listOrganizationRelationships: (...args: unknown[]) => mockListRelationships(...args),
  saveOrganizationRelationship: (...args: unknown[]) => mockSaveRelationship(...args),
  buildOrganizationMergePreview: (...args: unknown[]) => mockBuildMergePreview(...args),
  executeOrganizationMerge: (...args: unknown[]) => mockExecuteMerge(...args),
}));

const mockSheetsAppend = jest.fn().mockResolvedValue({ data: {} });
const mockSheetsBatchUpdate = jest.fn().mockResolvedValue({ data: {} });
const mockValuesGet = jest.fn().mockResolvedValue({ data: { values: [] } });
const mockValuesBatchUpdate = jest.fn().mockResolvedValue({ data: {} });

jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(() => ({
      spreadsheets: {
        batchUpdate: mockSheetsBatchUpdate,
        values: {
          append: mockSheetsAppend,
          get: mockValuesGet,
          batchUpdate: mockValuesBatchUpdate,
        },
      },
    })),
  },
}));

function permResult(role: string, email: string | null = role === 'none' ? null : `${role}@kulaglass.com`) {
  return { allowed: true, role, email };
}

const orgRow = ['org_1', 'Acme', 'CUSTOMER', 'COMPANY', 'Oahu', '', '', '', '', 'src', '', '', '', '', '', ''];
const contactRow = ['cnt_1', 'org_1', 'Existing', '', '', '', '', 'FALSE', '', ''];
const siteRow = ['sit_1', 'org_1', 'Main', '1 Way', '', 'Honolulu', 'HI', '', 'Oahu', '', 'OFFICE', '', ''];

beforeEach(() => {
  jest.clearAllMocks();
  // Default: empty sheets. Individual tests can override.
  mockValuesGet.mockResolvedValue({ data: { values: [] } });
});

function paramsFor(orgId = 'org_1') {
  return { params: Promise.resolve({ orgId }) };
}

// ═══ GET /api/organizations — auth gate ═══════════════════════════════════

describe('GET /api/organizations — auth gate', () => {
  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { GET } = await import('@/app/api/organizations/route');
    const res = await GET(new Request('http://t/api/organizations'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for role=none', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', 'unknown@kulaglass.com'));
    const { GET } = await import('@/app/api/organizations/route');
    const res = await GET(new Request('http://t/api/organizations'));
    expect(res.status).toBe(401);
  });

  it('returns 200 for field role (any authenticated user can read)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { GET } = await import('@/app/api/organizations/route');
    const res = await GET(new Request('http://t/api/organizations?nocache=1'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super_admin'));
    const { GET } = await import('@/app/api/organizations/route');
    const res = await GET(new Request('http://t/api/organizations?nocache=1'));
    expect(res.status).toBe(200);
  });
});

// ═══ POST /api/organizations — write gate ═════════════════════════════════

describe('POST /api/organizations — write gate', () => {
  const body = JSON.stringify({ name: 'Acme' });

  beforeEach(() => {
    // POST checks Customers!A1:N1 headers and Customers!A2:A for existing ids.
    const CUSTOMER_HEADERS = [
      'Customer_ID','Company_Name','Contact_Person','Title','Phone','Phone2',
      'Email','Address','Island','WO_Count','First_WO_Date','Last_WO_Date','Source','Notes',
    ];
    mockValuesGet.mockImplementation(async ({ range }: { range: string }) => {
      if (range.startsWith('Customers!A1')) return { data: { values: [CUSTOMER_HEADERS] } };
      if (range.startsWith('Customers!A2')) return { data: { values: [] } };
      return { data: { values: [] } };
    });
  });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { POST } = await import('@/app/api/organizations/route');
    const res = await POST(new Request('http://t/api/organizations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { POST } = await import('@/app/api/organizations/route');
    const res = await POST(new Request('http://t/api/organizations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for super (Superintendent) — tightened from email-endsWith', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super'));
    const { POST } = await import('@/app/api/organizations/route');
    const res = await POST(new Request('http://t/api/organizations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { POST } = await import('@/app/api/organizations/route');
    const res = await POST(new Request('http://t/api/organizations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for business_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('business_admin'));
    const { POST } = await import('@/app/api/organizations/route');
    const res = await POST(new Request('http://t/api/organizations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for super_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super_admin'));
    const { POST } = await import('@/app/api/organizations/route');
    const res = await POST(new Request('http://t/api/organizations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('service_pm'));
    const { POST } = await import('@/app/api/organizations/route');
    const res = await POST(new Request('http://t/api/organizations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for estimator', async () => {
    mockCheckPermission.mockResolvedValue(permResult('estimator'));
    const { POST } = await import('@/app/api/organizations/route');
    const res = await POST(new Request('http://t/api/organizations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for sales', async () => {
    mockCheckPermission.mockResolvedValue(permResult('sales'));
    const { POST } = await import('@/app/api/organizations/route');
    const res = await POST(new Request('http://t/api/organizations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(200);
  });
});

// ═══ GET /api/organizations/[orgId] — auth gate ═══════════════════════════

describe('GET /api/organizations/[orgId] — auth gate', () => {
  beforeEach(() => {
    mockValuesGet.mockImplementation(async ({ range }: { range: string }) => {
      if (range.startsWith('Organizations!')) return { data: { values: [orgRow] } };
      return { data: { values: [] } };
    });
  });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { GET } = await import('@/app/api/organizations/[orgId]/route');
    const res = await GET(new Request('http://t/api/organizations/org_1'), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 200 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { GET } = await import('@/app/api/organizations/[orgId]/route');
    const res = await GET(new Request('http://t/api/organizations/org_1'), paramsFor());
    expect(res.status).toBe(200);
  });
});

// ═══ PATCH /api/organizations/[orgId] — write gate ════════════════════════

describe('PATCH /api/organizations/[orgId] — write gate', () => {
  const body = JSON.stringify({ name: 'Acme Updated' });

  beforeEach(() => {
    mockValuesGet.mockResolvedValue({ data: { values: [orgRow] } });
  });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { PATCH } = await import('@/app/api/organizations/[orgId]/route');
    const res = await PATCH(new Request('http://t/api/organizations/org_1', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { PATCH } = await import('@/app/api/organizations/[orgId]/route');
    const res = await PATCH(new Request('http://t/api/organizations/org_1', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { PATCH } = await import('@/app/api/organizations/[orgId]/route');
    const res = await PATCH(new Request('http://t/api/organizations/org_1', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for service_pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('service_pm'));
    const { PATCH } = await import('@/app/api/organizations/[orgId]/route');
    const res = await PATCH(new Request('http://t/api/organizations/org_1', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(200);
  });
});

// ═══ POST /api/organizations/[orgId]/sites — write gate ═══════════════════

describe('POST /api/organizations/[orgId]/sites — write gate', () => {
  const body = JSON.stringify({ name: 'Site A', address_line_1: '1 Way' });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { POST } = await import('@/app/api/organizations/[orgId]/sites/route');
    const res = await POST(new Request('http://t/api/organizations/org_1/sites', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { POST } = await import('@/app/api/organizations/[orgId]/sites/route');
    const res = await POST(new Request('http://t/api/organizations/org_1/sites', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { POST } = await import('@/app/api/organizations/[orgId]/sites/route');
    const res = await POST(new Request('http://t/api/organizations/org_1/sites', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(200);
  });

  it('returns 200 for estimator', async () => {
    mockCheckPermission.mockResolvedValue(permResult('estimator'));
    const { POST } = await import('@/app/api/organizations/[orgId]/sites/route');
    const res = await POST(new Request('http://t/api/organizations/org_1/sites', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(200);
  });
});

// ═══ PATCH /api/organizations/[orgId]/sites — write gate ══════════════════

describe('PATCH /api/organizations/[orgId]/sites — write gate', () => {
  const body = JSON.stringify({ siteId: 'sit_1', name: 'New Name' });

  beforeEach(() => {
    mockValuesGet.mockResolvedValue({ data: { values: [siteRow] } });
  });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { PATCH } = await import('@/app/api/organizations/[orgId]/sites/route');
    const res = await PATCH(new Request('http://t/api/organizations/org_1/sites', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 403 for admin role — tightened from email-endsWith', async () => {
    mockCheckPermission.mockResolvedValue(permResult('admin'));
    const { PATCH } = await import('@/app/api/organizations/[orgId]/sites/route');
    const res = await PATCH(new Request('http://t/api/organizations/org_1/sites', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 200 for sales', async () => {
    mockCheckPermission.mockResolvedValue(permResult('sales'));
    const { PATCH } = await import('@/app/api/organizations/[orgId]/sites/route');
    const res = await PATCH(new Request('http://t/api/organizations/org_1/sites', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(200);
  });
});

// ═══ POST /api/organizations/[orgId]/contacts — write gate ════════════════

describe('POST /api/organizations/[orgId]/contacts — write gate', () => {
  const body = JSON.stringify({ name: 'New Contact' });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { POST } = await import('@/app/api/organizations/[orgId]/contacts/route');
    const res = await POST(new Request('http://t/api/organizations/org_1/contacts', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { POST } = await import('@/app/api/organizations/[orgId]/contacts/route');
    const res = await POST(new Request('http://t/api/organizations/org_1/contacts', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 200 for super_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super_admin'));
    const { POST } = await import('@/app/api/organizations/[orgId]/contacts/route');
    const res = await POST(new Request('http://t/api/organizations/org_1/contacts', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(200);
  });
});

// ═══ PATCH /api/organizations/[orgId]/contacts — write gate ═══════════════

describe('PATCH /api/organizations/[orgId]/contacts — write gate', () => {
  const body = JSON.stringify({ contactId: 'cnt_1', name: 'Updated' });

  beforeEach(() => {
    mockValuesGet.mockResolvedValue({ data: { values: [contactRow] } });
  });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { PATCH } = await import('@/app/api/organizations/[orgId]/contacts/route');
    const res = await PATCH(new Request('http://t/api/organizations/org_1/contacts', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { PATCH } = await import('@/app/api/organizations/[orgId]/contacts/route');
    const res = await PATCH(new Request('http://t/api/organizations/org_1/contacts', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(403);
  });

  it('returns 200 for service_pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('service_pm'));
    const { PATCH } = await import('@/app/api/organizations/[orgId]/contacts/route');
    const res = await PATCH(new Request('http://t/api/organizations/org_1/contacts', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    }), paramsFor());
    expect(res.status).toBe(200);
  });
});

// ═══ /api/organizations/governance/relationships — auth/write gates ══════

describe('GET /api/organizations/governance/relationships — auth gate', () => {
  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { GET } = await import('@/app/api/organizations/governance/relationships/route');
    const res = await GET(new Request('http://t/api/organizations/governance/relationships?org_id=org_1'));
    expect(res.status).toBe(401);
  });

  it('returns 200 for field role (read)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { GET } = await import('@/app/api/organizations/governance/relationships/route');
    const res = await GET(new Request('http://t/api/organizations/governance/relationships?org_id=org_1'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/organizations/governance/relationships — write gate', () => {
  const body = JSON.stringify({ source_org_id: 'org_1', target_org_id: 'org_2', relationship_type: 'PARENT' });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { POST } = await import('@/app/api/organizations/governance/relationships/route');
    const res = await POST(new Request('http://t/api/organizations/governance/relationships', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { POST } = await import('@/app/api/organizations/governance/relationships/route');
    const res = await POST(new Request('http://t/api/organizations/governance/relationships', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { POST } = await import('@/app/api/organizations/governance/relationships/route');
    const res = await POST(new Request('http://t/api/organizations/governance/relationships', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/organizations/governance/relationships — write gate', () => {
  const body = JSON.stringify({ relationship_id: 'rel_1', source_org_id: 'org_1', target_org_id: 'org_2', relationship_type: 'PARENT' });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { PATCH } = await import('@/app/api/organizations/governance/relationships/route');
    const res = await PATCH(new Request('http://t/api/organizations/governance/relationships', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 200 for business_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('business_admin'));
    const { PATCH } = await import('@/app/api/organizations/governance/relationships/route');
    const res = await PATCH(new Request('http://t/api/organizations/governance/relationships', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(200);
  });
});

// ═══ /api/organizations/governance/merge — auth/write gates ══════════════

describe('GET /api/organizations/governance/merge — auth gate', () => {
  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { GET } = await import('@/app/api/organizations/governance/merge/route');
    const res = await GET(new Request('http://t/api/organizations/governance/merge?source_org_id=a&survivor_org_id=b'));
    expect(res.status).toBe(401);
  });

  it('returns 200 for field role (read preview)', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { GET } = await import('@/app/api/organizations/governance/merge/route');
    const res = await GET(new Request('http://t/api/organizations/governance/merge?source_org_id=a&survivor_org_id=b'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/organizations/governance/merge — write gate', () => {
  const body = JSON.stringify({ preview_confirmed: true, source_org_id: 'org_1', survivor_org_id: 'org_2' });

  it('returns 401 when no session', async () => {
    mockCheckPermission.mockResolvedValue(permResult('none', null));
    const { POST } = await import('@/app/api/organizations/governance/merge/route');
    const res = await POST(new Request('http://t/api/organizations/governance/merge', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for field role', async () => {
    mockCheckPermission.mockResolvedValue(permResult('field'));
    const { POST } = await import('@/app/api/organizations/governance/merge/route');
    const res = await POST(new Request('http://t/api/organizations/governance/merge', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for super (Superintendent) — tightened from email-endsWith', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super'));
    const { POST } = await import('@/app/api/organizations/governance/merge/route');
    const res = await POST(new Request('http://t/api/organizations/governance/merge', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(403);
  });

  it('returns 200 for super_admin', async () => {
    mockCheckPermission.mockResolvedValue(permResult('super_admin'));
    const { POST } = await import('@/app/api/organizations/governance/merge/route');
    const res = await POST(new Request('http://t/api/organizations/governance/merge', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for pm', async () => {
    mockCheckPermission.mockResolvedValue(permResult('pm'));
    const { POST } = await import('@/app/api/organizations/governance/merge/route');
    const res = await POST(new Request('http://t/api/organizations/governance/merge', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }));
    expect(res.status).toBe(200);
  });
});
