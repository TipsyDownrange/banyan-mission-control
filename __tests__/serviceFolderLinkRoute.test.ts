const mockCheckPermission = jest.fn();
const mockGetGoogleAuth = jest.fn();
const mockGoogleSheets = jest.fn();
const mockGoogleDrive = jest.fn();
const mockInvalidateCache = jest.fn();

jest.mock('@/lib/permissions', () => ({ checkPermission: mockCheckPermission }));
jest.mock('@/lib/gauth', () => ({ getGoogleAuth: mockGetGoogleAuth }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('@/lib/hawaii-time', () => ({ hawaiiNow: jest.fn(() => '2026-05-06T09:00:00') }));
jest.mock('@/app/api/service/route', () => ({ invalidateCache: mockInvalidateCache }));
jest.mock('googleapis', () => ({
  google: {
    sheets: mockGoogleSheets,
    drive: mockGoogleDrive,
  },
}));

import { BANYAN_DRIVE_ID, STANDARD_SUBFOLDERS } from '@/lib/drive-wo-folder';

function request(body: Record<string, unknown>) {
  return new Request('https://example.test/api/service/folder-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildDrive(opts: { driveId?: string | null; webViewLink?: string } = {}) {
  const filesGet = jest.fn().mockResolvedValue({
    data: {
      id: 'canon-folder-id-1234567890',
      name: 'WO-26-8371 — Jude Augustine',
      driveId: opts.driveId === undefined ? BANYAN_DRIVE_ID : opts.driveId,
      trashed: false,
      webViewLink: opts.webViewLink || 'https://drive.google.com/drive/folders/canon-folder-id-1234567890',
    },
  });
  const filesList = jest.fn().mockResolvedValue({
    data: { files: STANDARD_SUBFOLDERS.map((name, i) => ({ id: `sub-${i}`, name })) },
  });
  const drive = { files: { get: filesGet, list: filesList } };
  mockGoogleDrive.mockReturnValue(drive);
  return { filesGet, filesList };
}

function buildSheets() {
  const valuesGet = jest.fn()
    .mockResolvedValueOnce({
      data: {
        values: [
          ['WO-26-8371', '26-8371', 'Jude Augustine 1338 Uluniu Rd'],
        ],
      },
    })
    .mockResolvedValueOnce({
      data: {
        values: [
          ['folder_name', 'folder_id', 'folder_url', 'source'],
        ],
      },
    });
  const valuesBatchUpdate = jest.fn().mockResolvedValue({ data: {} });
  const valuesAppend = jest.fn().mockResolvedValue({ data: {} });
  const valuesUpdate = jest.fn().mockResolvedValue({ data: {} });
  mockGoogleSheets.mockReturnValue({
    spreadsheets: {
      values: {
        get: valuesGet,
        batchUpdate: valuesBatchUpdate,
        append: valuesAppend,
        update: valuesUpdate,
      },
    },
  });
  return { valuesGet, valuesBatchUpdate, valuesAppend, valuesUpdate };
}

describe('/api/service/folder-link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockCheckPermission.mockResolvedValue({ allowed: true, email: 'pm@kulaglass.com' });
    mockGetGoogleAuth.mockReturnValue({});
  });

  it('validates and persists a manual link to Service_Work_Orders.folder_url', async () => {
    buildDrive();
    const sheets = buildSheets();
    const { POST } = await import('@/app/api/service/folder-link/route');

    const res = await POST(request({
      woId: 'WO-26-8371',
      woName: 'Jude Augustine 1338 Uluniu Rd',
      folderUrl: 'https://drive.google.com/drive/folders/canon-folder-id-1234567890',
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.folderUrl).toBe('https://drive.google.com/drive/folders/canon-folder-id-1234567890');
    expect(sheets.valuesBatchUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'backend-sheet-test',
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'Service_Work_Orders!X2', values: [['https://drive.google.com/drive/folders/canon-folder-id-1234567890']] },
          { range: 'Service_Work_Orders!AB2', values: [['2026-05-06T09:00:00']] },
        ],
      },
    });
    expect(sheets.valuesAppend).toHaveBeenCalledWith(expect.objectContaining({
      range: 'WO_Folder_Links!A:D',
      requestBody: {
        values: [[
          'Jude Augustine 1338 Uluniu Rd',
          'canon-folder-id-1234567890',
          'https://drive.google.com/drive/folders/canon-folder-id-1234567890',
          'manual',
        ]],
      },
    }));
    expect(mockInvalidateCache).toHaveBeenCalled();
  });

  it('rejects My Drive/private folders before any Sheet write', async () => {
    buildDrive({ driveId: null });
    buildSheets();
    const { POST } = await import('@/app/api/service/folder-link/route');

    const res = await POST(request({
      woId: 'WO-26-8371',
      folderUrl: 'https://drive.google.com/drive/folders/private-folder-id-1234567890',
    }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.classification.kind).toBe('my_drive');
    expect(mockGoogleSheets).not.toHaveBeenCalled();
  });

  it('rejects unparseable folder URLs before any Sheet write', async () => {
    buildDrive();
    buildSheets();
    const { POST } = await import('@/app/api/service/folder-link/route');

    const res = await POST(request({
      woId: 'WO-26-8371',
      folderUrl: 'not a folder url',
    }));

    expect(res.status).toBe(400);
    expect(mockGoogleSheets).not.toHaveBeenCalled();
    expect(mockGoogleDrive.mock.results[0].value.files.get).not.toHaveBeenCalled();
  });
});

export {};
