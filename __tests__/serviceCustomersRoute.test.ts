const mockSheets = jest.fn();
const mockGetCrosswalkSheets = jest.fn();
const mockLoadCrosswalkByCustomer = jest.fn();
const mockGetServerSession = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

jest.mock('@/lib/backend-config', () => ({
  getBackendSheetId: jest.fn(() => 'backend-sheet-test'),
}));

jest.mock('@/lib/entityCrosswalk', () => ({
  getCrosswalkSheets: mockGetCrosswalkSheets,
  loadCrosswalkByCustomer: mockLoadCrosswalkByCustomer,
}));

jest.mock('googleapis', () => ({
  google: {
    sheets: mockSheets,
  },
}));

describe('service customers route identity enrichment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    delete process.env.ROLE_PERMISSIONS_JSON;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const perms = require('@/lib/permissions');
    perms.resetRolePermissionsCacheForTests();
  });

  it('adds org_id only from Entity_Crosswalk mappings', async () => {
    const sheetsValuesGet = jest.fn().mockResolvedValue({
      data: {
        values: [
          ['Customer_ID', 'Company_Name', 'Contact_Person', 'Phone', 'Email', 'Address', 'Island'],
          ['CUST-0001', 'Mapped Customer', 'Mapped Contact', '(808) 555-0101', 'mapped@example.com', '18 Waokele Pl, Kula, HI 96790', 'Maui'],
          ['CUST-0002', 'Unmapped Customer', 'Unmapped Contact', '(808) 555-0102', 'unmapped@example.com', '99 Puamana St, Wailuku, HI 96793', 'Maui'],
        ],
      },
    });
    mockSheets.mockReturnValue({
      spreadsheets: {
        values: {
          get: sheetsValuesGet,
        },
      },
    });
    const crosswalkSheets = { crosswalk: true };
    mockGetCrosswalkSheets.mockReturnValue(crosswalkSheets);
    mockLoadCrosswalkByCustomer.mockResolvedValue(new Map([
      ['CUST-0001', { customer_id: 'CUST-0001', org_id: 'org_mapped' }],
    ]));

    const { GET } = await import('@/app/api/service/customers/route');
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetCrosswalkSheets).toHaveBeenCalledWith(true);
    expect(mockLoadCrosswalkByCustomer).toHaveBeenCalledWith(crosswalkSheets);
    expect(json.customers[0]).toEqual(expect.objectContaining({ customerId: 'CUST-0001', org_id: 'org_mapped' }));
    expect(json.customers[1]).toEqual(expect.objectContaining({ customerId: 'CUST-0002' }));
    expect(json.customers[1]).not.toHaveProperty('org_id');
    expect(json.identity_resolution).toBe('entity_crosswalk');
    expect(json.unresolved_org_count).toBe(1);
  });
});

describe('service customers route inline customer creation', () => {
  const headers = [
    'Customer_ID',
    'Company_Name',
    'Contact_Person',
    'Title',
    'Phone',
    'Phone2',
    'Email',
    'Address',
    'City',
    'State',
    'ZIP',
    'Island',
    'WO_Count',
    'First_WO_Date',
    'Last_WO_Date',
    'Source',
  ];

  function session(role: string | null) {
    if (role === null) return null;
    return { user: { email: `${role}@kulaglass.com`, role } };
  }

  function postRequest(body: Record<string, unknown>) {
    return new Request('https://example.test/api/service/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    delete process.env.ROLE_PERMISSIONS_JSON;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const perms = require('@/lib/permissions');
    perms.resetRolePermissionsCacheForTests();
    mockGetCrosswalkSheets.mockReturnValue({ crosswalk: true });
    mockLoadCrosswalkByCustomer.mockResolvedValue(new Map());
  });

  it('returns 401 when POST has no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/service/customers/route');

    const res = await POST(postRequest({ company: 'Maui Glass' }));

    expect(res.status).toBe(401);
  });

  it('returns 403 when POST session lacks CONTACTS_WRITE', async () => {
    mockGetServerSession.mockResolvedValue(session('field'));
    const { POST } = await import('@/app/api/service/customers/route');

    const res = await POST(postRequest({ company: 'Maui Glass' }));

    expect(res.status).toBe(403);
  });

  it('returns 400 when company is missing', async () => {
    mockGetServerSession.mockResolvedValue(session('service_pm'));
    const { POST } = await import('@/app/api/service/customers/route');

    const res = await POST(postRequest({ company: '   ' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/company/i);
  });

  it('creates CUS-26-NNNN customers, appends by header order, and refreshes subsequent GET data', async () => {
    mockGetServerSession.mockResolvedValue(session('service_pm'));
    const sheetRows: unknown[][] = [
      headers,
      ['CUS-26-0004', 'Existing Co', 'Pat Existing', '', '(808) 555-0100', '', 'pat@example.test', '1 Old Rd', 'Kula', 'HI', '96790', 'Maui', '2', '2026-01-01', '2026-02-02', 'seed'],
      ['CUS-25-0099', 'Prior Year Co', 'Kai Prior', '', '', '', '', '', '', '', '', 'Maui', '1', '', '', 'seed'],
    ];
    const valuesGet = jest.fn().mockImplementation(() => Promise.resolve({
      data: { values: sheetRows.map(row => [...row]) },
    }));
    const valuesAppend = jest.fn().mockImplementation(({ requestBody }) => {
      sheetRows.push(requestBody.values[0]);
      return Promise.resolve({ data: {} });
    });
    mockSheets.mockReturnValue({
      spreadsheets: {
        values: {
          get: valuesGet,
          append: valuesAppend,
        },
      },
    });

    const { GET, POST } = await import('@/app/api/service/customers/route');
    const before = await GET();
    expect((await before.json()).customers).toHaveLength(2);

    const res = await POST(postRequest({
      company: 'Joey Inline Customer',
      contactPerson: 'Joey',
      phone: '(808) 555-0199',
      email: 'joey@example.test',
      address: '18 Waokele Pl',
      city: 'Kula',
      state: 'HI',
      zip: '96790',
      island: 'Maui',
    }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toEqual({
      ok: true,
      customer: expect.objectContaining({
        customerId: 'CUS-26-0005',
        company: 'Joey Inline Customer',
        contactPerson: 'Joey',
        phone: '(808) 555-0199',
        email: 'joey@example.test',
        address: '18 Waokele Pl',
        city: 'Kula',
        state: 'HI',
        zip: '96790',
        island: 'Maui',
        woCount: 0,
        firstWODate: '',
        lastWODate: '',
        source: 'service_intake_inline',
      }),
    });
    expect(json.customer.customerId).toMatch(/^CUS-26-\d{4}$/);
    expect(valuesAppend).toHaveBeenCalledWith({
      spreadsheetId: 'backend-sheet-test',
      range: 'Customers!A:Z',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          'CUS-26-0005',
          'Joey Inline Customer',
          'Joey',
          '',
          '(808) 555-0199',
          '',
          'joey@example.test',
          '18 Waokele Pl',
          'Kula',
          'HI',
          '96790',
          'Maui',
          '0',
          '',
          '',
          'service_intake_inline',
        ]],
      },
    });

    const after = await GET();
    const afterJson = await after.json();
    expect(afterJson.customers).toHaveLength(3);
    expect(afterJson.customers[2]).toEqual(expect.objectContaining({
      customerId: 'CUS-26-0005',
      company: 'Joey Inline Customer',
      woCount: 0,
    }));
    expect(valuesGet).toHaveBeenCalledTimes(3);
  });
});

export {};
