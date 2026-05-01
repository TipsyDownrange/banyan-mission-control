const mockCheckPermission = jest.fn();
const mockInvalidateCache = jest.fn();
const mockSheets = jest.fn();
const mockDrive = jest.fn();

jest.mock('@/lib/permissions', () => ({
  checkPermission: mockCheckPermission,
}));

jest.mock('@/app/api/service/route', () => ({
  invalidateCache: mockInvalidateCache,
}));

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

jest.mock('@/lib/updateCustomerRecord', () => ({
  fireAndForgetCustomerUpdate: jest.fn(),
}));

jest.mock('@/lib/hawaii-time', () => ({
  hawaiiToday: jest.fn(() => '2026-04-29'),
  hawaiiNow: jest.fn(() => '2026-04-29T09:00:00'),
  hawaiiYear2: jest.fn(() => '26'),
}));

jest.mock('googleapis', () => ({
  google: {
    sheets: mockSheets,
    drive: mockDrive,
  },
}));

type MockGoogleClients = {
  sheetsValuesGet: jest.Mock;
  sheetsValuesAppend: jest.Mock;
  sheetsValuesUpdate: jest.Mock;
  driveFilesList: jest.Mock;
  driveFilesCreate: jest.Mock;
  driveFilesGet: jest.Mock;
  drivePermissionsCreate: jest.Mock;
};

function request(body: Record<string, unknown>) {
  return new Request('https://example.test/api/service/dispatch', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    customerName: 'BAN-51 Test Customer',
    description: 'Replace test pane',
    island: 'Maui',
    customer_id: 'CUST-0001',
    org_id: 'org_test',
    ...overrides,
  };
}

function setupGoogleClients(options: {
  existingWONumbers?: string[];
  folderUrl?: string;
  failDrive?: boolean;
} = {}): MockGoogleClients {
  const sheetsValuesGet = jest
    .fn()
    .mockResolvedValueOnce({
      data: {
        values: [
          ['Customer_ID', 'Company_Name'],
          ['CUST-0001', 'BAN-51 Test Customer'],
        ],
      },
    });

  if (options.existingWONumbers) {
    sheetsValuesGet.mockResolvedValueOnce({
      data: { values: options.existingWONumbers.map(value => [value]) },
    });
  }

  const sheetsValuesAppend = jest.fn().mockResolvedValue({
    data: { updates: { updatedRange: 'Service_Work_Orders!A7:P7' } },
  });
  const sheetsValuesUpdate = jest.fn().mockResolvedValue({ data: {} });

  mockSheets.mockReturnValue({
    spreadsheets: {
      values: {
        get: sheetsValuesGet,
        append: sheetsValuesAppend,
        update: sheetsValuesUpdate,
      },
    },
  });

  const driveFilesList = options.failDrive
    ? jest.fn().mockRejectedValue(new Error('Drive unavailable'))
    : jest.fn().mockResolvedValue({ data: { files: [] } });
  let folderId = 0;
  const driveFilesCreate = jest.fn().mockImplementation(() => {
    folderId += 1;
    return Promise.resolve({ data: { id: `folder-${folderId}` } });
  });
  const driveFilesGet = jest.fn().mockResolvedValue({
    data: { webViewLink: options.folderUrl || 'https://drive.google.com/drive/folders/ban51-test' },
  });
  const drivePermissionsCreate = jest.fn().mockResolvedValue({ data: {} });

  mockDrive.mockReturnValue({
    files: {
      list: driveFilesList,
      create: driveFilesCreate,
      get: driveFilesGet,
    },
    permissions: {
      create: drivePermissionsCreate,
    },
  });

  return {
    sheetsValuesGet,
    sheetsValuesAppend,
    sheetsValuesUpdate,
    driveFilesList,
    driveFilesCreate,
    driveFilesGet,
    drivePermissionsCreate,
  };
}

describe('Service WO create route', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckPermission.mockResolvedValue({ allowed: true });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('generates a valid sequential WO-YY-#### id when no incoming woNumber is provided', async () => {
    const clients = setupGoogleClients({
      existingWONumbers: ['26-0001 ', '26-0009', '25-9999', 'B2616723'],
    });
    const { POST } = await import('@/app/api/service/dispatch/route');

    const res = await POST(request(baseBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.woId).toBe('WO-26-0010');
    expect(json.woNumber).toBe('26-0010');
    expect(clients.sheetsValuesAppend).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({
        values: [expect.arrayContaining(['WO-26-0010', '26-0010'])],
      }),
    }));
  });

  it('rejects invalid incoming woNumber instead of converting it into a WO id', async () => {
    const clients = setupGoogleClients();
    const { POST } = await import('@/app/api/service/dispatch/route');

    const res = await POST(request(baseBody({ woNumber: 'B2616723' })));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('Use the standard YY-#### format');
    expect(clients.sheetsValuesAppend).not.toHaveBeenCalled();
  });

  it('does not append a row when Drive folder creation fails', async () => {
    const clients = setupGoogleClients({
      existingWONumbers: ['26-0001'],
      failDrive: true,
    });
    const { POST } = await import('@/app/api/service/dispatch/route');

    const res = await POST(request(baseBody()));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toContain('Drive folder could not be created');
    expect(clients.sheetsValuesAppend).not.toHaveBeenCalled();
    expect(clients.sheetsValuesUpdate).not.toHaveBeenCalled();
  });

  it('appends the row only after a non-empty Drive folder URL exists', async () => {
    const folderUrl = ' https://drive.google.com/drive/folders/ban51-valid ';
    const clients = setupGoogleClients({ folderUrl });
    const { POST } = await import('@/app/api/service/dispatch/route');

    const res = await POST(request(baseBody({ woNumber: '26-1234' })));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.folderUrl).toBe(folderUrl.trim());
    expect(clients.driveFilesGet.mock.invocationCallOrder[0]).toBeLessThan(
      clients.sheetsValuesAppend.mock.invocationCallOrder[0]
    );
    expect(clients.sheetsValuesUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      range: 'Service_Work_Orders!W7:AC7',
      requestBody: {
        values: [[
          '',
          folderUrl.trim(),
          '',
          '',
          '2026-04-29T09:00:00',
          '2026-04-29T09:00:00',
          'banyan_dispatch',
        ]],
      },
    }));
    expect(clients.sheetsValuesUpdate).toHaveBeenNthCalledWith(3, expect.objectContaining({
      range: 'Service_Work_Orders!AU7',
      requestBody: { values: [['false']] },
    }));
  });

  it('allows WO creation with a missing org_id while logging an identity warning', async () => {
    const clients = setupGoogleClients();
    const { POST } = await import('@/app/api/service/dispatch/route');

    const res = await POST(request(baseBody({ woNumber: '26-1235', org_id: '' })));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.woId).toBe('WO-26-1235');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[identity] missing org_id on WO create',
      expect.objectContaining({
        customer_id: 'CUST-0001',
        customerName: 'BAN-51 Test Customer',
      })
    );
    expect(clients.sheetsValuesUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      range: 'Service_Work_Orders!AQ7:AS7',
      requestBody: { values: [['', 'CUST-0001', 'false']] },
    }));
    expect(clients.sheetsValuesUpdate).toHaveBeenNthCalledWith(3, expect.objectContaining({
      range: 'Service_Work_Orders!AU7',
      requestBody: { values: [['true']] },
    }));
  });
});

export {};
