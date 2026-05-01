const mockGetServerSession = jest.fn();
const mockSheets = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: mockGetServerSession,
}));

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

jest.mock('@/lib/backend-config', () => ({
  getBackendSheetId: jest.fn(() => 'backend-sheet-test'),
}));

jest.mock('googleapis', () => ({
  google: {
    sheets: mockSheets,
  },
}));

function patchRequest(body: Record<string, unknown>) {
  return new Request('https://example.test/api/organizations/org_westin', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function params(orgId = 'org_westin') {
  return { params: Promise.resolve({ orgId }) };
}

describe('organization detail PATCH route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { email: 'sean@kulaglass.com' } });
  });

  it('saves a case-only organization name edit without overwriting blank status', async () => {
    const valuesGet = jest.fn().mockResolvedValue({
      data: {
        values: [
          ['org_westin', 'westin Nanea', 'CUSTOMER', '', '', '', '', '', '', '', '', '', ''],
        ],
      },
    });
    const batchUpdate = jest.fn().mockResolvedValue({ data: {} });
    mockSheets.mockReturnValue({
      spreadsheets: {
        values: {
          get: valuesGet,
          batchUpdate,
        },
      },
    });

    const { PATCH } = await import('@/app/api/organizations/[orgId]/route');
    const res = await PATCH(patchRequest({
      name: 'Westin Nanea',
      types: ['CUSTOMER'],
      notes: '',
      status: '',
    }), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'backend-sheet-test',
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: expect.arrayContaining([
          { range: 'Organizations!B2', values: [['Westin Nanea']] },
          { range: 'Organizations!C2', values: [['CUSTOMER']] },
          { range: 'Organizations!I2', values: [['']] },
          { range: 'Organizations!L2', values: [[expect.any(String)]] },
        ]),
      },
    });
    const updateData = batchUpdate.mock.calls[0][0].requestBody.data;
    expect(updateData).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ range: 'Organizations!M2' }),
    ]));
  });

  it('accepts CUSTOMER type with an explicit governed status on PATCH', async () => {
    const valuesGet = jest.fn().mockResolvedValue({
      data: {
        values: [
          ['org_westin', 'Westin Nanea', 'CUSTOMER', '', '', '', '', '', '', '', '', '', ''],
        ],
      },
    });
    const batchUpdate = jest.fn().mockResolvedValue({ data: {} });
    mockSheets.mockReturnValue({
      spreadsheets: {
        values: {
          get: valuesGet,
          batchUpdate,
        },
      },
    });

    const { PATCH } = await import('@/app/api/organizations/[orgId]/route');
    const res = await PATCH(patchRequest({
      name: 'Westin Nanea',
      types: ['CUSTOMER'],
      status: 'active',
    }), params());

    expect(res.status).toBe(200);
    expect(batchUpdate.mock.calls[0][0].requestBody.data).toEqual(expect.arrayContaining([
      { range: 'Organizations!C2', values: [['CUSTOMER']] },
      { range: 'Organizations!M2', values: [['active']] },
    ]));
  });
});

export {};
