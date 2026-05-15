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
  let prevTargetEnv: string | undefined;
  let prevStagingId: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    prevTargetEnv = process.env.VERCEL_TARGET_ENV;
    prevStagingId = process.env.STAGING_DRIVE_FOLDER_ID;
    mockCheckPermission.mockResolvedValue({ allowed: true, email: 'pm@kulaglass.com' });
    mockGetGoogleAuth.mockReturnValue({});
    mockEmitMCEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (prevTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
    else process.env.VERCEL_TARGET_ENV = prevTargetEnv;
    if (prevStagingId === undefined) delete process.env.STAGING_DRIVE_FOLDER_ID;
    else process.env.STAGING_DRIVE_FOLDER_ID = prevStagingId;
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

  it('staging rejects a WO folder that is not a descendant of STAGING_DRIVE_FOLDER_ID before upload', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    process.env.STAGING_DRIVE_FOLDER_ID = 'staging-root-folder-id-1234567890';
    setupSheets('https://drive.google.com/drive/folders/prod-folder-id-1234567890');
    const drive = setupDrive(BANYAN_DRIVE_ID);
    drive.filesGet.mockResolvedValueOnce({
      data: {
        id: 'prod-folder-id-1234567890',
        name: 'WO-26-8371 — Jude Augustine',
        parents: ['prod-parent-folder-id-1234567890'],
        trashed: false,
      },
    }).mockResolvedValueOnce({
      data: {
        id: 'prod-parent-folder-id-1234567890',
        parents: [],
        trashed: false,
      },
    });
    const { POST } = await import('@/app/api/jobs/[woId]/upload/route');

    const res = await POST(makeUploadRequest(), { params: Promise.resolve({ woId: 'WO-26-8371' }) });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/not inside STAGING_DRIVE_FOLDER_ID/);
    expect(drive.filesCreate).not.toHaveBeenCalled();
    expect(drive.permissionsCreate).not.toHaveBeenCalled();
  });

  it('staging allows a descendant WO folder and skips public anyone permission creation', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    process.env.STAGING_DRIVE_FOLDER_ID = 'staging-root-folder-id-1234567890';
    setupSheets('https://drive.google.com/drive/folders/staging-wo-folder-id-1234567890');
    const drive = setupDrive(null);
    drive.filesGet.mockResolvedValueOnce({
      data: {
        id: 'staging-wo-folder-id-1234567890',
        parents: ['staging-root-folder-id-1234567890'],
        trashed: false,
      },
    });
    drive.filesList.mockResolvedValueOnce({ data: { files: [{ id: 'photos-folder-id' }] } });
    const { POST } = await import('@/app/api/jobs/[woId]/upload/route');

    const res = await POST(makeUploadRequest(), { params: Promise.resolve({ woId: 'WO-26-8371' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(drive.filesCreate).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({ parents: ['photos-folder-id'] }),
    }));
    expect(drive.permissionsCreate).not.toHaveBeenCalled();
  });
});

export {};
