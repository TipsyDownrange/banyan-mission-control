const mockCheckPermission = jest.fn();
const mockGetGoogleAuth = jest.fn();
const mockGoogleSheets = jest.fn();
const mockGoogleDrive = jest.fn();
const mockEmitMCEvent = jest.fn();

jest.mock('@/lib/permissions', () => ({ checkPermission: mockCheckPermission }));
jest.mock('@/lib/gauth', () => ({ getGoogleAuth: mockGetGoogleAuth }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('@/lib/events', () => ({ emitMCEvent: mockEmitMCEvent }));
jest.mock('googleapis', () => ({
  google: {
    sheets: mockGoogleSheets,
    drive: mockGoogleDrive,
  },
}));

import { BANYAN_DRIVE_ID } from '@/lib/drive-wo-folder';

function makeUploadRequest() {
  const form = new FormData();
  form.set('file', new File(['image-bytes'], 'photo.jpg', { type: 'image/jpeg' }));
  return new Request('https://example.test/api/jobs/WO-26-8371/upload', {
    method: 'POST',
    body: form,
  });
}

function setupSheets(folderUrl: string) {
  const valuesGet = jest.fn().mockResolvedValue({
    data: {
      values: [
        [
          'WO-26-8371',
          '26-8371',
          'Jude Augustine',
          '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
          folderUrl,
        ],
      ],
    },
  });
  mockGoogleSheets.mockReturnValue({
    spreadsheets: { values: { get: valuesGet } },
  });
  return { valuesGet };
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
  const filesList = jest.fn().mockResolvedValue({ data: { files: [] } });
  const filesCreate = jest.fn().mockResolvedValue({
    data: { id: 'created-photo-id', webViewLink: 'https://drive.google.com/file/d/created-photo-id/view', name: 'photo.jpg' },
  });
  const permissionsCreate = jest.fn().mockResolvedValue({ data: {} });
  mockGoogleDrive.mockReturnValue({
    files: { get: filesGet, list: filesList, create: filesCreate },
    permissions: { create: permissionsCreate },
  });
  return { filesGet, filesList, filesCreate, permissionsCreate };
}

describe('/api/jobs/[woId]/upload folder_url validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockCheckPermission.mockResolvedValue({ allowed: true, email: 'pm@kulaglass.com' });
    mockGetGoogleAuth.mockReturnValue({});
    mockEmitMCEvent.mockResolvedValue(undefined);
  });

  it('rejects a My Drive/private WO folder before creating subfolders or uploading', async () => {
    setupSheets('https://drive.google.com/drive/folders/private-folder-id-1234567890');
    const drive = setupDrive(null);
    const { POST } = await import('@/app/api/jobs/[woId]/upload/route');

    const res = await POST(makeUploadRequest(), { params: Promise.resolve({ woId: 'WO-26-8371' }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.classification.kind).toBe('my_drive');
    expect(drive.filesList).not.toHaveBeenCalled();
    expect(drive.filesCreate).not.toHaveBeenCalled();
    expect(drive.permissionsCreate).not.toHaveBeenCalled();
  });

  it('allows a Banyan shared-drive folder and then resolves the upload subfolder', async () => {
    setupSheets('https://drive.google.com/drive/folders/folder-id-1234567890');
    const drive = setupDrive(BANYAN_DRIVE_ID);
    drive.filesList
      .mockResolvedValueOnce({ data: { files: [{ id: 'Photos', name: 'Photos' }] } })
      .mockResolvedValueOnce({ data: { files: [{ id: 'photos-folder-id' }] } });
    const { POST } = await import('@/app/api/jobs/[woId]/upload/route');

    const res = await POST(makeUploadRequest(), { params: Promise.resolve({ woId: 'WO-26-8371' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(drive.filesCreate).toHaveBeenCalledWith(expect.objectContaining({
      supportsAllDrives: true,
      requestBody: expect.objectContaining({ parents: ['photos-folder-id'] }),
    }));
  });
});

export {};
