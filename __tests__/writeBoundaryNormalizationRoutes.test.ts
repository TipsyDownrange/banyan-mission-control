const mockGetServerSession = jest.fn();
const mockCheckPermission = jest.fn();
const mockSheets = jest.fn();
const mockDrive = jest.fn();
const mockFireAndForgetCustomerUpdate = jest.fn();

jest.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
jest.mock('@/lib/permissions', () => ({ checkPermission: mockCheckPermission }));
jest.mock('@/app/api/service/route', () => ({ invalidateCache: jest.fn() }));
jest.mock('@/lib/gauth', () => ({ getGoogleAuth: jest.fn(() => ({})) }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('@/lib/updateCustomerRecord', () => ({ fireAndForgetCustomerUpdate: mockFireAndForgetCustomerUpdate }));
jest.mock('@/lib/hawaii-time', () => ({
  hawaiiToday: jest.fn(() => '2026-05-04'),
  hawaiiNow: jest.fn(() => '2026-05-04T09:00:00'),
  hawaiiYear2: jest.fn(() => '26'),
}));
jest.mock('googleapis', () => ({
  google: {
    sheets: mockSheets,
    drive: mockDrive,
  },
}));

function jsonRequest(path: string, body: Record<string, unknown>) {
  return new Request(`https://example.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function routeParams(orgId = 'org_test') {
  return { params: Promise.resolve({ orgId }) };
}

function mockSession() {
  mockGetServerSession.mockResolvedValue({ user: { email: 'sean@kulaglass.com' } });
}

function setupAppendOnlySheets() {
  const append = jest.fn().mockResolvedValue({ data: { updates: { updatedRange: 'Sheet!A2:Z2' } } });
  const get = jest.fn().mockResolvedValue({ data: { values: [] } });
  const batchUpdate = jest.fn().mockResolvedValue({ data: {} });
  const update = jest.fn().mockResolvedValue({ data: {} });
  mockSheets.mockReturnValue({
    spreadsheets: {
      values: { get, append, batchUpdate, update },
    },
  });
  return { get, append, batchUpdate, update };
}

describe('BAN-144 write-boundary normalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockSession();
    mockCheckPermission.mockResolvedValue({ allowed: true, email: 'sean@kulaglass.com' });
  });

  it('normalizes top-level contact name, email, and phone on create', async () => {
    const sheets = setupAppendOnlySheets();
    const { POST } = await import('@/app/api/contacts/route');

    const res = await POST(jsonRequest('/api/contacts', {
      org_id: 'org_test',
      name: '  Pat   Contact  ',
      email: '  PAT@Example.TEST ',
      phone: '8085550199',
      title: '  Lead  ',
    }));

    expect(res.status).toBe(200);
    const row = sheets.append.mock.calls[0][0].requestBody.values[0];
    expect(row[2]).toBe('Pat Contact');
    expect(row[3]).toBe('Lead');
    expect(row[5]).toBe('pat@example.test');
    expect(row[6]).toBe('(808) 555-0199');
  });

  it('normalizes org contact name, email, and phone on create', async () => {
    const sheets = setupAppendOnlySheets();
    const { POST } = await import('@/app/api/organizations/[orgId]/contacts/route');

    const res = await POST(jsonRequest('/api/organizations/org_test/contacts', {
      name: '  Kai   Contact  ',
      email: '  KAI@Example.TEST ',
      phone: '5550199',
    }), routeParams());

    expect(res.status).toBe(200);
    const row = sheets.append.mock.calls[0][0].requestBody.values[0];
    expect(row[2]).toBe('Kai Contact');
    expect(row[5]).toBe('kai@example.test');
    expect(row[6]).toBe('(808) 555-0199');
  });

  it('trims site address components, normalizes island, and uppercases allowed site_type', async () => {
    const sheets = setupAppendOnlySheets();
    const { POST } = await import('@/app/api/organizations/[orgId]/sites/route');

    const res = await POST(jsonRequest('/api/organizations/org_test/sites', {
      name: '  Main   Office ',
      address_line_1: '  123 Kula Rd  ',
      city: '  Kula ',
      state: ' hi ',
      zip: ' 96790 ',
      island: ' maui ',
      site_type: ' jobsite ',
    }), routeParams());

    expect(res.status).toBe(200);
    const row = sheets.append.mock.calls[0][0].requestBody.values[0];
    expect(row[2]).toBe('Main Office');
    expect(row[3]).toBe('123 Kula Rd');
    expect(row[5]).toBe('Kula');
    expect(row[6]).toBe('HI');
    expect(row[7]).toBe('96790');
    expect(row[8]).toBe('Maui');
    expect(row[10]).toBe('JOBSITE');
  });

  it('rejects unknown site_type values without writing', async () => {
    const sheets = setupAppendOnlySheets();
    const { POST } = await import('@/app/api/organizations/[orgId]/sites/route');

    const res = await POST(jsonRequest('/api/organizations/org_test/sites', {
      address_line_1: '123 Kula Rd',
      site_type: 'billing',
    }), routeParams());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('Invalid site_type');
    expect(sheets.append).not.toHaveBeenCalled();
  });

  it('crew update preserves omitted fields and normalizes explicitly included name, email, and phone', async () => {
    const update = jest.fn().mockResolvedValue({ data: {} });
    mockSheets.mockReturnValue({
      spreadsheets: {
        values: {
          get: jest.fn().mockResolvedValue({
            data: { values: [[
              'crew_123', 'Existing Name', 'Journeyman', 'old@example.test', '808-555-0100',
              'Maui', 'personal@test.test', 'Glazier', 'Field', 'Maui HQ',
              '123 Old Home Rd', 'Pat Contact 808', '2024-01-02', 'Existing notes', 'Field', 'Field-to-Office',
            ]] },
          }),
          update,
        },
      },
    });
    const { POST } = await import('@/app/api/crew/update/route');

    const res = await POST(jsonRequest('/api/crew/update', {
      user_id: 'crew_123',
      name: '  Jordan   Crew ',
      email: ' JORDAN@Example.TEST ',
      phone: '8085550199',
    }));

    expect(res.status).toBe(200);
    const row = update.mock.calls[0][0].requestBody.values[0];
    expect(row[0]).toBe('Jordan Crew');
    expect(row[2]).toBe('jordan@example.test');
    expect(row[3]).toBe('(808) 555-0199');
    expect(row[9]).toBe('123 Old Home Rd');
    expect(row[10]).toBe('Pat Contact 808');
  });

  it('service dispatch normalizes WO contact fields without backfeeding Customers identity', async () => {
    const get = jest.fn()
      .mockResolvedValueOnce({ data: { values: [['Customer_ID'], ['CUST-0001']] } })
      .mockResolvedValueOnce({ data: { values: [['26-0001']] } });
    const append = jest.fn().mockResolvedValue({ data: { updates: { updatedRange: 'Service_Work_Orders!A7:P7' } } });
    const update = jest.fn().mockResolvedValue({ data: {} });
    mockSheets.mockReturnValue({ spreadsheets: { values: { get, append, update } } });
    mockDrive.mockReturnValue({
      files: {
        list: jest.fn().mockResolvedValue({ data: { files: [] } }),
        create: jest.fn().mockResolvedValue({ data: { id: 'folder-test' } }),
        get: jest.fn().mockResolvedValue({ data: { webViewLink: 'https://drive.test/folder' } }),
      },
      permissions: { create: jest.fn().mockResolvedValue({ data: {} }) },
    });
    const { POST } = await import('@/app/api/service/dispatch/route');

    const res = await POST(jsonRequest('/api/service/dispatch', {
      customerName: '  Acme   Glass ',
      description: 'Repair pane',
      island: ' maui ',
      city: ' Kula ',
      address: '  123 Kula Rd ',
      contactPerson: '  Pat   Contact ',
      contactPhone: '8085550199',
      contactEmail: ' PAT@Example.TEST ',
      customer_id: 'CUST-0001',
      org_id: 'org_test',
    }));

    expect(res.status).toBe(200);
    const row = append.mock.calls[0][0].requestBody.values[0];
    expect(row[5]).toBe('Maui');
    expect(row[7]).toBe('123 Kula Rd, Kula');
    expect(row[8]).toBe('Pat Contact');
    expect(row[10]).toBe('(808) 555-0199');
    expect(row[11]).toBe('pat@example.test');
    expect(mockFireAndForgetCustomerUpdate).not.toHaveBeenCalled();
  });

  it('procurement create normalizes vendor and document names', async () => {
    const sheets = setupAppendOnlySheets();
    const { POST } = await import('@/app/api/procurement/route');

    const res = await POST(jsonRequest('/api/procurement', {
      wo_id: 'WO-26-0001',
      vendor_name: '  Maui   Supplier ',
      line_items: [{ description: '  hinge ', quantity: 2, unit_cost: 5, unit: ' ea ' }],
      quote_document_name: '  Quote   One ',
    }));

    expect(res.status).toBe(200);
    const row = sheets.append.mock.calls[0][0].requestBody.values[0];
    expect(row[3]).toBe('Maui Supplier');
    expect(row[4]).toBe('hinge');
    expect(row[6]).toBe('ea');
    expect(row[26]).toBe('Quote One');
  });
});

export {};
