const mockCheckPermission = jest.fn();
const mockGetGoogleAuth = jest.fn();
const mockGoogleSheets = jest.fn();
const mockGoogleDrive = jest.fn();
const mockInvalidateCache = jest.fn();
const mockEmitMCEvent = jest.fn();
const mockUpsertCrosswalkEntry = jest.fn();

jest.mock('@/lib/permissions', () => ({ checkPermission: mockCheckPermission }));
jest.mock('@/app/api/service/route', () => ({ invalidateCache: mockInvalidateCache }));
jest.mock('@/lib/gauth', () => ({ getGoogleAuth: mockGetGoogleAuth }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('@/lib/updateCustomerRecord', () => ({ fireAndForgetCustomerUpdate: jest.fn() }));
jest.mock('@/lib/normalize', () => ({
  normalizeAddressComponent: (v: string) => v,
  normalizePhone: (v: string) => v,
  normalizeEmail: (v: string) => v,
  normalizeName: (v: string) => v,
  normalizeContactList: (v: string) => v,
  resolveWorkOrderIsland: (v: string) => v,
}));
jest.mock('@/lib/events', () => ({ emitMCEvent: mockEmitMCEvent }));
jest.mock('@/lib/entityCrosswalk', () => ({ upsertCrosswalkEntry: mockUpsertCrosswalkEntry }));
jest.mock('@/lib/hawaii-time', () => ({ hawaiiNow: jest.fn(() => '2026-05-06T09:00:00') }));
jest.mock('googleapis', () => ({
  google: {
    sheets: mockGoogleSheets,
    drive: mockGoogleDrive,
  },
}));

import { BANYAN_DRIVE_ID, STANDARD_SUBFOLDERS } from '@/lib/drive-wo-folder';

const VALID_KEY = 'test-internal-key-abc123';
const WO_ROW = ['WO-26-8371', '26-8371', 'Jude Augustine', '', 'new'];
while (WO_ROW.length < 47) WO_ROW.push('');

function makeRequest(body: Record<string, unknown>) {
  return new Request('https://example.test/api/service/update', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': VALID_KEY,
    },
    body: JSON.stringify(body),
  });
}

function setupSheets() {
  const valuesGet = jest.fn().mockResolvedValueOnce({ data: { values: [WO_ROW] } });
  const valuesBatchUpdate = jest.fn().mockResolvedValue({ data: {} });
  mockGoogleSheets.mockReturnValue({
    spreadsheets: {
      values: {
        get: valuesGet,
        batchUpdate: valuesBatchUpdate,
      },
    },
  });
  return { valuesGet, valuesBatchUpdate };
}

function setupDrive(driveId: string | null) {
  const filesGet = jest.fn().mockResolvedValue({
    data: {
      id: 'folder-id-1234567890',
      name: 'WO-26-8371 — Jude Augustine',
      driveId,
      trashed: false,
      webViewLink: 'https://drive.google.com/drive/folders/folder-id-1234567890',
    },
  });
  const filesList = jest.fn().mockResolvedValue({
    data: { files: STANDARD_SUBFOLDERS.map((name, i) => ({ id: `sub-${i}`, name })) },
  });
  mockGoogleDrive.mockReturnValue({ files: { get: filesGet, list: filesList } });
  return { filesGet, filesList };
}

describe('/api/service/update folderUrl validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockGetGoogleAuth.mockReturnValue({});
    mockEmitMCEvent.mockResolvedValue(undefined);
    process.env.INTERNAL_API_KEY = VALID_KEY;
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_KEY;
  });

  it('validates a shared-drive folder before writing Service_Work_Orders.folder_url', async () => {
    const sheets = setupSheets();
    setupDrive(BANYAN_DRIVE_ID);
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(makeRequest({
      woId: 'WO-26-8371',
      folderUrl: 'https://drive.google.com/drive/folders/folder-id-1234567890',
    }));

    expect(res.status).toBe(200);
    expect(sheets.valuesBatchUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'backend-sheet-test',
      requestBody: {
        valueInputOption: 'RAW',
        data: expect.arrayContaining([
          { range: 'Service_Work_Orders!X2', values: [['https://drive.google.com/drive/folders/folder-id-1234567890']] },
          { range: 'Service_Work_Orders!AB2', values: [['2026-05-06T09:00:00']] },
        ]),
      },
    });
  });

  it('rejects a wrong-root folder before writing Service_Work_Orders.folder_url', async () => {
    const sheets = setupSheets();
    setupDrive(null);
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(makeRequest({
      woId: 'WO-26-8371',
      folderUrl: 'https://drive.google.com/drive/folders/private-folder-id-1234567890',
    }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.classification.kind).toBe('my_drive');
    expect(sheets.valuesBatchUpdate).not.toHaveBeenCalled();
  });
});

export {};
